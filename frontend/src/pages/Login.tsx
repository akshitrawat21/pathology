import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { Building2, Microscope, ShieldCheck } from "lucide-react";
import { api, apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { TokenResponse } from "../api/types";
import { Spinner } from "../components/ui";

export default function Login() {
  const { config, handleLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");

  async function finish(resp: TokenResponse) {
    await handleLogin(resp);
    navigate(resp.needs_onboarding ? "/onboarding" : "/", { replace: true });
  }

  async function onGoogle(credential: string) {
    setBusy(true);
    setError(null);
    try {
      const resp = (await api.post<TokenResponse>("/auth/google", { credential })).data;
      await finish(resp);
    } catch (e) {
      setError(apiError(e, "Google Sign-In failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDev(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = (
        await api.post<TokenResponse>("/auth/dev", { email: devEmail, name: devName || null })
      ).data;
      await finish(resp);
    } catch (e) {
      setError(apiError(e, "Login failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <h1>Whole-slide pathology,<br />built for teams.</h1>
        <p>
          Securely manage organizations, users, and reports — and view multi-gigabyte
          Whole Slide Images right in your browser, no downloads required.
        </p>
        <div style={{ marginTop: 26 }}>
          {[
            { Icon: ShieldCheck, text: "Google Sign-In & role-based access control" },
            { Icon: Building2, text: "Isolated multi-tenant workspaces" },
            { Icon: Microscope, text: "Deep-zoom WSI viewer with sharing" },
          ].map(({ Icon, text }) => (
            <div className="feat" key={text}>
              <span className="dot"><Icon size={14} /></span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <h2 style={{ fontSize: 22, marginBottom: 6 }}>Sign in</h2>
          <p className="muted" style={{ marginBottom: 22 }}>
            Continue to your PathoSlide workspace.
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          {!config ? (
            <Spinner />
          ) : (
            <>
              {config.google_enabled && config.google_client_id ? (
                <GoogleOAuthProvider clientId={config.google_client_id}>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <GoogleLogin
                      onSuccess={(cr) => cr.credential && onGoogle(cr.credential)}
                      onError={() => setError("Google Sign-In was cancelled or failed")}
                      useOneTap={false}
                      width="340"
                    />
                  </div>
                </GoogleOAuthProvider>
              ) : (
                <div className="alert alert-info">
                  Google Sign-In is not configured. Set <b>GOOGLE_CLIENT_ID</b> on the
                  backend to enable it. Use dev login below for now.
                </div>
              )}

              {config.dev_login_enabled && (
                <>
                  <div className="divider">
                    {config.google_enabled ? "or continue with dev login" : "dev login"}
                  </div>
                  <form onSubmit={onDev}>
                    <div className="field">
                      <label className="label">Email</label>
                      <input
                        className="input"
                        type="email"
                        required
                        placeholder="you@lab.com"
                        value={devEmail}
                        onChange={(e) => setDevEmail(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Name (optional)</label>
                      <input
                        className="input"
                        placeholder="Dr. Jane Doe"
                        value={devName}
                        onChange={(e) => setDevName(e.target.value)}
                      />
                    </div>
                    <button className="btn btn-primary btn-block" disabled={busy}>
                      {busy ? "Signing in…" : "Continue"}
                    </button>
                    <p className="hint">
                      Dev login bypasses Google for local testing and is disabled in
                      production.
                    </p>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
