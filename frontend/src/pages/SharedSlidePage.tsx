import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { API_BASE } from "../api/client";
import SlideViewer from "../components/SlideViewer";
import { CenterSpinner } from "../components/ui";
import type { SharedSlide } from "../api/types";

export default function SharedSlidePage() {
  const { token = "" } = useParams();
  const [slide, setSlide] = useState<SharedSlide | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/shared/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.detail || (r.status === 410 ? "This link has expired" : "This share link is invalid"));
        }
        return r.json();
      })
      .then((d) => active && setSlide(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [token]);

  if (error)
    return (
      <div className="center-screen">
        <div className="card card-pad stack gap-8" style={{ textAlign: "center", maxWidth: 380 }}>
          <Lock size={36} className="muted" style={{ margin: "0 auto" }} />
          <h3>Slide unavailable</h3>
          <p className="muted">{error}</p>
        </div>
      </div>
    );

  if (!slide) return <CenterSpinner />;

  return (
    <SlideViewer
      dziUrl={`${API_BASE}/shared/${token}/dzi`}
      tilesBaseUrl={`${API_BASE}/shared/${token}/tiles/`}
      title={`${slide.original_filename} (shared)`}
      info={{ width: slide.width, height: slide.height, mppX: slide.mpp_x, mppY: slide.mpp_y, vendor: slide.vendor }}
    />
  );
}
