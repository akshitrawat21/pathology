import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useCreateReport, useDeleteReport, useReports } from "../api/hooks";
import { apiError } from "../api/client";
import { CenterSpinner, Modal, formatDate } from "../components/ui";

export default function ReportsPage() {
  const { can } = useAuth();
  const reports = useReports();
  const createReport = useCreateReport();
  const deleteReport = useDeleteReport();

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createReport.mutateAsync({ title, description });
      setShowCreate(false);
      setTitle("");
      setDescription("");
    } catch (e) {
      setError(apiError(e));
    }
  }

  if (reports.isLoading) return <CenterSpinner />;

  return (
    <div className="content">
      <div className="page-head">
        <div className="stack">
          <h1>Reports</h1>
          <span className="muted">Cases and their whole-slide images.</span>
        </div>
        {can("report:create") && (
          <button className="btn btn-primary right" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New report
          </button>
        )}
      </div>

      {reports.data && reports.data.length > 0 ? (
        <div className="grid">
          {reports.data.map((r) => (
            <div className="card card-pad stack gap-12" key={r.id}>
              <div className="row">
                <span className="badge badge-blue">{r.slide_count} slide{r.slide_count === 1 ? "" : "s"}</span>
                {can("report:delete") && (
                  <button
                    className="btn btn-ghost btn-sm right"
                    title="Delete report"
                    aria-label="Delete report"
                    onClick={() => {
                      if (confirm(`Delete "${r.title}" and all its slides?`))
                        deleteReport.mutate(r.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="stack gap-8" style={{ minHeight: 60 }}>
                <Link to={`/reports/${r.id}`} style={{ fontSize: 16, fontWeight: 650 }}>
                  {r.title}
                </Link>
                <span className="muted small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {r.description || "No description"}
                </span>
              </div>
              <div className="row small muted" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <span>Updated {formatDate(r.updated_at)}</span>
                <Link to={`/reports/${r.id}`} className="right row gap-8">
                  Open <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card empty">
          <FolderOpen size={40} className="empty-icon" />
          <p>No reports yet.</p>
          {can("report:create") && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              Create your first report
            </button>
          )}
        </div>
      )}

      {showCreate && (
        <Modal
          title="New report"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={createReport.isPending || !title}>
                {createReport.isPending ? "Creating…" : "Create report"}
              </button>
            </>
          }
        >
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label className="label">Title</label>
              <input className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Case 2024-001 — Liver biopsy" />
            </div>
            <div className="field">
              <label className="label">Description</label>
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Clinical notes, findings, context…" />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
