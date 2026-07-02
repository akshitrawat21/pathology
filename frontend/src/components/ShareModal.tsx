import { useState } from "react";
import { Plus } from "lucide-react";
import { useCreateShare, useRevokeShare, useShares } from "../api/hooks";
import { apiError } from "../api/client";
import { Modal, Spinner, formatDate } from "./ui";
import type { Share } from "../api/types";

function shareUrl(token: string) {
  return `${location.origin}/shared/${token}`;
}

function shareState(s: Share): { label: string; cls: string; active: boolean } {
  if (s.revoked) return { label: "revoked", cls: "badge-red", active: false };
  if (s.expires_at && new Date(s.expires_at) < new Date())
    return { label: "expired", cls: "badge-amber", active: false };
  return { label: "active", cls: "badge-green", active: true };
}

export default function ShareModal({
  slideId,
  slideName,
  onClose,
}: {
  slideId: string;
  slideName: string;
  onClose: () => void;
}) {
  const shares = useShares(slideId, true);
  const create = useCreateShare(slideId);
  const revoke = useRevokeShare(slideId);
  const [expiry, setExpiry] = useState<string>("0"); // hours; 0 = never
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    try {
      const hours = Number(expiry);
      await create.mutateAsync({ expires_in_hours: hours > 0 ? hours : null });
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(shareUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  }

  const active = (shares.data ?? []).filter((s) => shareState(s).active);

  return (
    <Modal title={`Share “${slideName}”`} onClose={onClose} wide>
      {error && <div className="alert alert-error">{error}</div>}
      <p className="muted" style={{ marginTop: 0 }}>
        Anyone with an active link can view this slide in the browser — no account
        required. Links are unguessable and can be revoked anytime.
      </p>

      <div className="row gap-12" style={{ marginBottom: 18 }}>
        <div className="stack grow">
          <label className="label">Link expiry</label>
          <select className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="0">Never expires</option>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
            <option value="720">30 days</option>
          </select>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-end" }} onClick={onCreate} disabled={create.isPending}>
          {create.isPending ? "Creating…" : (<><Plus size={15} /> Create link</>)}
        </button>
      </div>

      {shares.isLoading ? (
        <Spinner />
      ) : active.length + (shares.data?.length ?? 0) === 0 ? (
        <div className="muted small">No share links yet.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Link</th>
              <th>Status</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shares.data!.map((s) => {
              const st = shareState(s);
              return (
                <tr key={s.id}>
                  <td className="mono small" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shareUrl(s.token)}
                  </td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td className="muted small">{s.expires_at ? formatDate(s.expires_at) : "Never"}</td>
                  <td>
                    <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                      {st.active && (
                        <button className="btn btn-sm" onClick={() => copy(s.token)}>
                          {copied === s.token ? "Copied!" : "Copy"}
                        </button>
                      )}
                      {!s.revoked && (
                        <button className="btn btn-sm btn-ghost" title="Revoke" onClick={() => revoke.mutate(s.id)}>
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
