import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, Clock, Microscope, Trash2, UploadCloud } from "lucide-react";
import { api, apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  useDeleteReport,
  useDeleteSlide,
  useReport,
  useUpdateReport,
} from "../api/hooks";
import AuthImage from "../components/AuthImage";
import ShareModal from "../components/ShareModal";
import { CenterSpinner, Modal, StatusBadge, formatBytes } from "../components/ui";
import type { Slide } from "../api/types";

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

const ACCEPT = ".svs,.tif,.tiff,.ndpi,.scn,.mrxs,.svslide,.vms";

export default function ReportDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const report = useReport(id);
  const updateReport = useUpdateReport(id);
  const deleteReport = useDeleteReport();
  const deleteSlide = useDeleteSlide(id);

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [shareSlide, setShareSlide] = useState<Slide | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const localId = crypto.randomUUID();
      setUploads((u) => [...u, { id: localId, name: file.name, progress: 0, status: "uploading" }]);
      const form = new FormData();
      form.append("file", file);
      try {
        await api.post(`/reports/${id}/slides`, form, {
          onUploadProgress: (e) => {
            const p = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            setUploads((u) => u.map((it) => (it.id === localId ? { ...it, progress: p } : it)));
          },
        });
        setUploads((u) => u.map((it) => (it.id === localId ? { ...it, progress: 100, status: "done" } : it)));
        report.refetch();
        setTimeout(() => setUploads((u) => u.filter((it) => it.id !== localId)), 2500);
      } catch (e) {
        setUploads((u) =>
          u.map((it) => (it.id === localId ? { ...it, status: "error", error: apiError(e) } : it)),
        );
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  if (report.isLoading) return <CenterSpinner />;
  if (report.isError || !report.data)
    return (
      <div className="content">
        <div className="alert alert-error">Report not found.</div>
        <Link to="/reports" className="btn"><ArrowLeft size={15} /> Back to reports</Link>
      </div>
    );

  const r = report.data;
  const canUpload = can("slide:upload");

  return (
    <div className="content">
      <Link to="/reports" className="muted small row gap-8">
        <ArrowLeft size={14} /> Reports
      </Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div className="stack gap-8">
          <h1>{r.title}</h1>
          <span className="muted">{r.description || "No description"}</span>
        </div>
        <div className="row gap-8 right">
          {can("report:edit") && (
            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          )}
          {can("report:delete") && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (confirm(`Delete "${r.title}" and all ${r.slide_count} slide(s)?`))
                  deleteReport.mutateAsync(r.id).then(() => navigate("/reports"));
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Upload zone */}
      {canUpload && (
        <div
          className="card card-pad"
          style={{
            border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
            background: dragOver ? "var(--primary-soft)" : "var(--surface)",
            textAlign: "center",
            marginBottom: 22,
            cursor: "pointer",
          }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            style={{ display: "none" }}
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
          <UploadCloud size={30} className="muted" style={{ margin: "0 auto" }} />
          <div style={{ fontWeight: 600, marginTop: 6 }}>Drop .svs files here or click to browse</div>
          <div className="muted small">You can upload multiple whole-slide images at once.</div>
        </div>
      )}

      {/* Active uploads */}
      {uploads.length > 0 && (
        <div className="card card-pad stack gap-12" style={{ marginBottom: 22 }}>
          {uploads.map((u) => (
            <div className="stack gap-8" key={u.id}>
              <div className="row small">
                <span style={{ fontWeight: 600 }}>{u.name}</span>
                <span className="right muted row gap-8" style={{ justifyContent: "flex-end" }}>
                  {u.status === "error" ? (
                    `Failed: ${u.error}`
                  ) : u.status === "done" ? (
                    <>
                      <Check size={14} /> Done
                    </>
                  ) : u.progress < 100 ? (
                    `${u.progress}%`
                  ) : (
                    "Processing…"
                  )}
                </span>
              </div>
              <div className="progress">
                <span
                  style={{
                    width: `${u.progress}%`,
                    background: u.status === "error" ? "var(--danger)" : undefined,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slides grid */}
      <h3 style={{ marginBottom: 14 }}>Whole Slide Images ({r.slides.length})</h3>
      {r.slides.length === 0 ? (
        <div className="card empty">
          <Microscope size={40} className="empty-icon" />
          No slides yet.{canUpload ? " Upload an .svs file to get started." : ""}
        </div>
      ) : (
        <div className="grid">
          {r.slides.map((s) => (
            <div className="card card-pad stack gap-12" key={s.id}>
              {s.status === "ready" ? (
                <Link to={`/slides/${s.id}`}>
                  <AuthImage
                    path={`/slides/${s.id}/thumbnail`}
                    className="slide-thumb"
                    alt={s.original_filename}
                    fallback={<div className="thumb-fallback"><Microscope size={30} /></div>}
                  />
                </Link>
              ) : (
                <div className="thumb-fallback">
                  {s.status === "error" ? <AlertTriangle size={30} /> : <Clock size={30} />}
                </div>
              )}

              <div className="stack gap-8">
                <div className="row gap-8">
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.original_filename}
                  </span>
                  <span className="right"><StatusBadge status={s.status} /></span>
                </div>
                <div className="small muted">
                  {s.width && s.height ? `${s.width.toLocaleString()} × ${s.height.toLocaleString()} px · ` : ""}
                  {formatBytes(s.size_bytes)}
                </div>
                {s.status === "error" && <div className="small" style={{ color: "var(--danger)" }}>{s.error}</div>}
              </div>

              <div className="row gap-8" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                {s.status === "ready" && can("slide:view") && (
                  <Link to={`/slides/${s.id}`} className="btn btn-sm btn-primary">View</Link>
                )}
                {s.status === "ready" && can("slide:share") && (
                  <button className="btn btn-sm" onClick={() => setShareSlide(s)}>Share</button>
                )}
                {can("slide:delete") && (
                  <button
                    className="btn btn-sm btn-ghost right"
                    title="Delete slide"
                    aria-label="Delete slide"
                    onClick={() => confirm(`Delete "${s.original_filename}"?`) && deleteSlide.mutate(s.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditReportModal
          initial={{ title: r.title, description: r.description }}
          busy={updateReport.isPending}
          onClose={() => setEditing(false)}
          onSave={async (body) => {
            await updateReport.mutateAsync(body);
            setEditing(false);
          }}
        />
      )}

      {shareSlide && (
        <ShareModal
          slideId={shareSlide.id}
          slideName={shareSlide.original_filename}
          onClose={() => setShareSlide(null)}
        />
      )}
    </div>
  );
}

function EditReportModal({
  initial,
  onClose,
  onSave,
  busy,
}: {
  initial: { title: string; description: string };
  onClose: () => void;
  onSave: (body: { title: string; description: string }) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  return (
    <Modal
      title="Edit report"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !title} onClick={() => onSave({ title, description })}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Description</label>
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  );
}
