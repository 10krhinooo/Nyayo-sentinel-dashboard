"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { api } from "../../../lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to reset password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-form-card">
        <div className="login-form-header">
          <h2 className="login-form-title">Invalid Link</h2>
          <p className="login-form-subtitle">This reset link is invalid. Please request a new one.</p>
        </div>
        <button className="login-btn" onClick={() => router.push("/forgot-password")} style={{ marginTop: "1rem" }}>
          Request New Link
        </button>
      </div>
    );
  }

  return (
    <div className="login-form-card">
      <div className="login-form-header">
        <h2 className="login-form-title">Set New Password</h2>
        <p className="login-form-subtitle">Choose a new secure password for your account.</p>
      </div>

      {success ? (
        <div style={{ background: "#dcfce7", color: "#15803d", padding: "0.75rem 1rem", borderRadius: "0.4rem" }}>
          Password reset successfully. Redirecting to login…
        </div>
      ) : (
        <>
          {error && <div className="login-error">{error}</div>}
          <form onSubmit={(e) => void handleSubmit(e)} className="login-form">
            <div className="login-field">
              <label htmlFor="password" className="login-label">New password</label>
              <div className="login-input-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required minLength={8}
                  className="login-input"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="login-eye" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle">
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="login-field">
              <label htmlFor="confirm" className="login-label">Confirm password</label>
              <input
                id="confirm"
                type="password"
                required minLength={8}
                className="login-input"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <span className="login-spinner" /> : "Reset Password"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="login-root">
      <div className="login-brand">
        <div className="login-brand-inner">
          <div className="login-flag-bar">
            <span style={{ background: "#006600" }} />
            <span style={{ background: "#ffffff" }} />
            <span style={{ background: "#BB0000" }} />
            <span style={{ background: "#ffffff" }} />
            <span style={{ background: "#000000" }} />
          </div>
          <div className="login-brand-logo">
            <Image src="/gok-emblem.png" alt="Government of Kenya" width={80} height={80} />
          </div>
          <h1 className="login-brand-title">Nyayo Sentinel</h1>
          <p className="login-brand-subtitle">Republic of Kenya</p>
        </div>
        <div className="login-brand-footer">Ministry of Interior &amp; National Administration</div>
      </div>
      <div className="login-form-panel">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
