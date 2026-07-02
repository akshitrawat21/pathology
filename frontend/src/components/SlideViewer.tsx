import { useEffect, useRef, useState, type ReactNode } from "react";
import OpenSeadragon from "openseadragon";
import { ArrowLeft, Maximize, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Spinner } from "./ui";

interface Props {
  /** URL returning the DZI descriptor JSON ({ Image, level_count }). */
  dziUrl: string;
  /** Base URL for tiles; OSD appends `{level}/{col}_{row}.{format}`. Ends with `/`. */
  tilesBaseUrl: string;
  /** When set, tiles + descriptor are fetched with this bearer token. */
  authToken?: string | null;
  title: string;
  info?: {
    width?: number | null;
    height?: number | null;
    mppX?: number | null;
    mppY?: number | null;
    vendor?: string | null;
  };
  onClose?: () => void;
  extraActions?: ReactNode;
}

type Status = "loading" | "ready" | "error";

export default function SlideViewer({
  dziUrl,
  tilesBaseUrl,
  authToken,
  title,
  info,
  onClose,
  extraActions,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Loading slide…");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let viewer: OpenSeadragon.Viewer | null = null;
    let cancelled = false;
    let loadedAny = false;
    let failCount = 0;

    setStatus("loading");
    setMessage("Loading slide…");

    (async () => {
      try {
        // The descriptor carries dimensions + tiling params. It's small, so we
        // fetch it with the auth header. Tiles, however, are loaded by OSD as
        // plain <img> elements (which can't carry headers), so we pass the token
        // as a query param baked into each tile URL — robust across OSD versions.
        const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
        const res = await fetch(dziUrl, { headers });
        if (!res.ok) throw new Error(`Failed to load slide (HTTP ${res.status})`);
        const data = await res.json();
        if (cancelled || !containerRef.current) return;

        const img = data.Image ?? {};
        const format: string = img.Format ?? "jpeg";
        const tokenQuery = authToken ? `?token=${encodeURIComponent(authToken)}` : "";

        const tileSource = {
          width: Number(img.Size?.Width),
          height: Number(img.Size?.Height),
          tileSize: Number(img.TileSize) || 254,
          tileOverlap: Number(img.Overlap) || 1,
          minLevel: 0,
          maxLevel: (Number(data.level_count) || 1) - 1,
          getTileUrl: (level: number, x: number, y: number) =>
            `${tilesBaseUrl}${level}/${x}_${y}.${format}${tokenQuery}`,
        };

        viewer = OpenSeadragon({
          element: containerRef.current,
          tileSources: tileSource as unknown as string,
          showNavigationControl: false, // custom controls in the toolbar
          showNavigator: true,
          navigatorPosition: "BOTTOM_RIGHT",
          navigatorHeight: "110px",
          navigatorWidth: "150px",
          maxZoomPixelRatio: 2,
          animationTime: 0.4,
          gestureSettingsMouse: { clickToZoom: false, scrollToZoom: true },
          zoomPerScroll: 1.4,
          visibilityRatio: 0.6,
        });

        viewer.addHandler("open", () => {
          if (!cancelled && !loadedAny) setMessage("Rendering tiles…");
        });
        // Hide the overlay only once a real tile has painted.
        viewer.addHandler("tile-loaded", () => {
          if (!cancelled) {
            loadedAny = true;
            setStatus("ready");
          }
        });
        // If tiles keep failing and none have loaded, surface an error.
        viewer.addHandler("tile-load-failed", () => {
          if (cancelled || loadedAny) return;
          failCount += 1;
          if (failCount >= 3) {
            setStatus("error");
            setMessage(
              "We couldn't load this slide's tiles. The server may be unavailable or still processing the file.",
            );
          }
        });
        viewer.addHandler("open-failed", () => {
          if (!cancelled) {
            setStatus("error");
            setMessage("The slide could not be opened.");
          }
        });
        viewerRef.current = viewer;
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage(e instanceof Error ? e.message : "Failed to load slide");
        }
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [dziUrl, tilesBaseUrl, authToken, reloadKey]);

  const zoom = (factor: number) => {
    const v = viewerRef.current;
    if (v) {
      v.viewport.zoomBy(factor);
      v.viewport.applyConstraints();
    }
  };
  const home = () => viewerRef.current?.viewport.goHome();
  const fullscreen = () => {
    const el = containerRef.current?.parentElement;
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  const retry = () => setReloadKey((k) => k + 1);

  const mpp = info?.mppX ? `${info.mppX.toFixed(3)} µm/px` : "—";
  const dims =
    info?.width && info?.height
      ? `${info.width.toLocaleString()} × ${info.height.toLocaleString()} px`
      : "—";

  return (
    <div className="viewer-shell">
      <div className="viewer-top">
        {onClose && (
          <button className="btn btn-sm" onClick={onClose}>
            <ArrowLeft size={15} /> Back
          </button>
        )}
        <strong style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </strong>
        <div className="row gap-8" style={{ marginLeft: "auto" }}>
          <button className="btn btn-sm" onClick={() => zoom(1.5)} title="Zoom in" aria-label="Zoom in"><ZoomIn size={16} /></button>
          <button className="btn btn-sm" onClick={() => zoom(1 / 1.5)} title="Zoom out" aria-label="Zoom out"><ZoomOut size={16} /></button>
          <button className="btn btn-sm" onClick={home} title="Reset view" aria-label="Reset view"><RotateCcw size={16} /></button>
          <button className="btn btn-sm" onClick={fullscreen} title="Fullscreen" aria-label="Fullscreen"><Maximize size={16} /></button>
          {extraActions}
        </div>
      </div>

      <div className="osd-canvas">
        {/* OpenSeadragon forces `position: relative` on its host element, which
            would break `inset: 0` sizing and collapse the canvas to 0px tall
            (the slide then renders at sub-pixel size and looks blank). Size it
            with width/height instead so it fills `.osd-canvas` regardless. */}
        <div ref={containerRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

        {status === "loading" && (
          <div className="viewer-overlay">
            <div className="stack gap-12" style={{ alignItems: "center", color: "#cdd8e6" }}>
              <Spinner />
              <span className="small">{message}</span>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="viewer-overlay">
            <div className="stack gap-12" style={{ alignItems: "center", maxWidth: 380, textAlign: "center", color: "#e6edf6" }}>
              <span style={{ color: "#fca5a5", fontWeight: 600 }}>Unable to display slide</span>
              <span className="small" style={{ color: "#aab7c8" }}>{message}</span>
              <button className="btn btn-sm" onClick={retry}>
                <RotateCcw size={15} /> Try again
              </button>
            </div>
          </div>
        )}

        {status === "ready" && (
          <div className="viewer-meta">
            <div><b>Dimensions:</b> {dims}</div>
            <div><b>Resolution:</b> {mpp}</div>
            {info?.vendor && <div><b>Scanner:</b> {info.vendor}</div>}
            <div className="small" style={{ marginTop: 4, opacity: 0.7 }}>Scroll to zoom · drag to pan</div>
          </div>
        )}
      </div>
    </div>
  );
}
