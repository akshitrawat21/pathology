import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="center-screen">
      <div className="stack gap-12" style={{ alignItems: "center" }}>
        <Compass size={44} className="muted" />
        <h2>Page not found</h2>
        <Link to="/" className="btn btn-primary">Back to dashboard</Link>
      </div>
    </div>
  );
}
