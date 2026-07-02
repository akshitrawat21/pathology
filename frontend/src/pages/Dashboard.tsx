import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, FolderOpen, Microscope, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useReports, useUsers } from "../api/hooks";
import { formatDate } from "../components/ui";

function Stat({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="card card-pad row gap-16">
      <div className="stat-icon">{icon}</div>
      <div className="stack">
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        <div className="small muted">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { me, isAdmin } = useAuth();
  const reports = useReports();
  const users = useUsers(); // only resolves for admins (endpoint is admin-only)

  const totalSlides = (reports.data ?? []).reduce((n, r) => n + r.slide_count, 0);
  const recent = (reports.data ?? []).slice(0, 5);

  return (
    <div className="content">
      <div className="page-head">
        <div className="stack">
          <h1>Welcome back, {me?.user.name?.split(" ")[0] || "there"}</h1>
          <span className="muted">Here's an overview of {me?.organization.name}.</span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <Stat label="Reports" value={reports.data?.length ?? "—"} icon={<FileText size={22} />} />
        <Stat label="Whole Slide Images" value={totalSlides} icon={<Microscope size={22} />} />
        {isAdmin && <Stat label="Team members" value={users.data?.length ?? "—"} icon={<Users size={22} />} />}
        <Stat label="Your role" value={me?.user.role ?? "—"} icon={<ShieldCheck size={22} />} />
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="row card-pad" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3>Recent reports</h3>
          <Link to="/reports" className="btn btn-sm right">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty">
            <FolderOpen size={40} className="empty-icon" />
            No reports yet. Head to <Link to="/reports">Reports</Link> to create one.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Slides</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/reports/${r.id}`} style={{ fontWeight: 600 }}>
                      {r.title}
                    </Link>
                  </td>
                  <td>{r.slide_count}</td>
                  <td className="muted">{formatDate(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
