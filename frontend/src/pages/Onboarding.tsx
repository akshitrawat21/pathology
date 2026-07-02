import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { TokenResponse } from "../api/types";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Onboarding() {
  const { onboardingToken, completeOnboarding, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = (
        await api.post<TokenResponse>(
          "/auth/onboarding",
          { name, slug },
          { headers: { Authorization: `Bearer ${onboardingToken}` } },
        )
      ).data;
      await completeOnboarding(resp);
      navigate("/", { replace: true });
    } catch (e) {
      setError(apiError(e, "Could not create organization"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel" style={{ minHeight: "100vh" }}>
      <div className="auth-card card card-pad" style={{ maxWidth: 440 }}>
        <div className="badge badge-blue" style={{ marginBottom: 14 }}>
          Welcome — first sign-in
        </div>
        <h2 style={{ fontSize: 22, marginBottom: 6 }}>Create your organization</h2>
        <p className="muted" style={{ marginBottom: 22 }}>
          You're the first user, so you'll be set up as the organization admin.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label className="label">Organization name</label>
            <input
              className="input"
              required
              placeholder="Acme Pathology Labs"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="field">
            <label className="label">Slug / identifier</label>
            <input
              className="input mono"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="acme-labs"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
            <p className="hint">Lowercase letters, numbers, and dashes. Must be unique.</p>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !name || !slug}>
            {busy ? "Creating…" : "Create organization"}
          </button>
        </form>

        <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={logout}>
          Cancel and sign out
        </button>
      </div>
    </div>
  );
}
