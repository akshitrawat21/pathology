import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Spinner() {
  return <div className="spinner" />;
}

export function CenterSpinner() {
  return (
    <div className="center-screen">
      <Spinner />
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  footer,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal${wide ? " modal-lg" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm right" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, src }: { name: string; src?: string | null }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="avatar">{src ? <img src={src} alt={name} /> : initials || "?"}</div>
  );
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: "badge-green",
    active: "badge-green",
    processing: "badge-amber",
    uploading: "badge-amber",
    invited: "badge-blue",
    error: "badge-red",
  };
  return <span className={`badge ${map[status] ?? ""}`}>{status}</span>;
}
