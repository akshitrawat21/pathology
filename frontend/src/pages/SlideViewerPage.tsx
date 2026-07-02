import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Share2 } from "lucide-react";
import { API_BASE, getToken } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useSlide } from "../api/hooks";
import SlideViewer from "../components/SlideViewer";
import ShareModal from "../components/ShareModal";
import { CenterSpinner } from "../components/ui";

export default function SlideViewerPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const slide = useSlide(id);
  const [sharing, setSharing] = useState(false);

  if (slide.isLoading) return <CenterSpinner />;
  if (slide.isError || !slide.data)
    return (
      <div className="center-screen">
        <div className="stack gap-12" style={{ alignItems: "center" }}>
          <div>Slide not available.</div>
          <button className="btn" onClick={() => navigate(-1)}>Go back</button>
        </div>
      </div>
    );

  const s = slide.data;

  return (
    <>
      <SlideViewer
        dziUrl={`${API_BASE}/slides/${s.id}/dzi`}
        tilesBaseUrl={`${API_BASE}/slides/${s.id}/tiles/`}
        authToken={getToken()}
        title={s.original_filename}
        info={{ width: s.width, height: s.height, mppX: s.mpp_x, mppY: s.mpp_y, vendor: s.vendor }}
        onClose={() => navigate(`/reports/${s.report_id}`)}
        extraActions={
          can("slide:share") ? (
            <button className="btn btn-sm" onClick={() => setSharing(true)}>
              <Share2 size={15} /> Share
            </button>
          ) : null
        }
      />
      {sharing && (
        <ShareModal slideId={s.id} slideName={s.original_filename} onClose={() => setSharing(false)} />
      )}
    </>
  );
}
