"""Whole Slide Image processing built on OpenSlide + DeepZoom.

Responsibilities:
  * Extract pyramid metadata from an uploaded .svs on ingest.
  * Serve DeepZoom tiles on demand so the browser never downloads the whole
    (often multi-GB) file — only the ~256px tiles it currently needs.

Concurrency: OpenSeadragon fires several tile requests at once, and some
OpenSlide backends (notably the OpenJPEG codec used for JPEG-2000 slides such as
``CMU-1-JP2K``) are **not thread-safe** — concurrent native decodes can crash the
process. We therefore serialize reads *per slide* with a lock; different slides
still decode in parallel. An LRU cache keeps a handful of slides open (opening a
WSI is expensive). Evicted handles are dropped from the cache and closed by
reference-counting, never force-closed while a read might still hold them.
"""
from __future__ import annotations

import io
import threading
from collections import OrderedDict

import openslide
from openslide import OpenSlide
from openslide.deepzoom import DeepZoomGenerator

from .config import settings


class SlideError(Exception):
    pass


# --------------------------------------------------------------------------- #
# Open-slide LRU cache + per-slide read locks
# --------------------------------------------------------------------------- #
_cache_lock = threading.Lock()
_cache: "OrderedDict[str, tuple[OpenSlide, DeepZoomGenerator]]" = OrderedDict()

_locks_guard = threading.Lock()
_read_locks: dict[str, threading.Lock] = {}


def _read_lock(path: str) -> threading.Lock:
    with _locks_guard:
        lk = _read_locks.get(path)
        if lk is None:
            lk = threading.Lock()
            _read_locks[path] = lk
        return lk


def _open(path: str) -> tuple[OpenSlide, DeepZoomGenerator]:
    """Return a cached (OpenSlide, DeepZoomGenerator), opening if needed.

    Callers hold the per-path read lock, so at most one thread opens a given
    slide at a time.
    """
    with _cache_lock:
        if path in _cache:
            _cache.move_to_end(path)
            return _cache[path]
    try:
        osr = OpenSlide(path)
    except openslide.OpenSlideError as exc:
        raise SlideError(f"Cannot open slide: {exc}") from exc
    dzg = DeepZoomGenerator(
        osr,
        tile_size=settings.DEEPZOOM_TILE_SIZE,
        overlap=settings.DEEPZOOM_OVERLAP,
        limit_bounds=True,
    )
    with _cache_lock:
        _cache[path] = (osr, dzg)
        _cache.move_to_end(path)
        # Evict least-recently-used by dropping references only; the handle is
        # closed when the last user releases it (never force-closed mid-read).
        while len(_cache) > settings.SLIDE_CACHE_SIZE:
            _cache.popitem(last=False)
        return _cache[path]


def evict(path: str) -> None:
    """Drop a slide from the cache (e.g. before deleting its file)."""
    with _cache_lock:
        _cache.pop(path, None)
    with _locks_guard:
        _read_locks.pop(path, None)


# --------------------------------------------------------------------------- #
# Metadata + tiles
# --------------------------------------------------------------------------- #
def extract_metadata(path: str) -> dict:
    """Read pyramid dimensions + microns-per-pixel from a slide file."""
    try:
        osr = OpenSlide(path)
    except openslide.OpenSlideError as exc:
        raise SlideError(f"Not a readable whole-slide image: {exc}") from exc
    try:
        w, h = osr.dimensions

        def _f(key: str) -> float | None:
            val = osr.properties.get(key)
            try:
                return float(val) if val is not None else None
            except (TypeError, ValueError):
                return None

        return {
            "width": w,
            "height": h,
            "level_count": osr.level_count,
            "mpp_x": _f(openslide.PROPERTY_NAME_MPP_X),
            "mpp_y": _f(openslide.PROPERTY_NAME_MPP_Y),
            "vendor": osr.properties.get(openslide.PROPERTY_NAME_VENDOR),
        }
    finally:
        osr.close()


def get_dzi(path: str) -> dict:
    """Return the ``Image`` descriptor OpenSeadragon expects for a DZI source.

    Dimensions come from the DeepZoom generator itself (which honours
    ``limit_bounds``) so the viewer's tile grid matches exactly what we serve.
    """
    with _read_lock(path):
        _osr, dzg = _open(path)
        w, h = dzg.level_dimensions[dzg.level_count - 1]
        level_count = dzg.level_count
    return {
        "Image": {
            "xmlns": "http://schemas.microsoft.com/deepzoom/2008",
            "Format": settings.DEEPZOOM_FORMAT,
            "Overlap": str(settings.DEEPZOOM_OVERLAP),
            "TileSize": str(settings.DEEPZOOM_TILE_SIZE),
            "Size": {"Width": w, "Height": h},
        },
        "level_count": level_count,
    }


def get_thumbnail(path: str, max_size: int = 512) -> bytes:
    """A small JPEG thumbnail for slide cards / previews."""
    with _read_lock(path):
        osr, _dzg = _open(path)
        img = osr.get_thumbnail((max_size, max_size)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def get_tile(path: str, level: int, col: int, row: int) -> bytes:
    with _read_lock(path):
        _osr, dzg = _open(path)
        if level < 0 or level >= dzg.level_count:
            raise SlideError("Tile level out of range")
        try:
            tile = dzg.get_tile(level, (col, row))
        except (ValueError, IndexError) as exc:
            raise SlideError(f"Tile out of range: {exc}") from exc

    buf = io.BytesIO()
    fmt = settings.DEEPZOOM_FORMAT
    if fmt == "jpeg":
        tile.convert("RGB").save(buf, "JPEG", quality=settings.DEEPZOOM_JPEG_QUALITY)
    else:
        tile.save(buf, "PNG")
    return buf.getvalue()
