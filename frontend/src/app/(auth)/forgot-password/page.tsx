"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "../../../lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
        <div className="login-form-card">
          <div className="login-form-header">
            <h2 className="login-form-title">Reset your password</h2>
            <p className="login-form-subtitle">Enter your email and we will send you a reset link.</p>
          </div>

          {sent ? (
            <div>
              <div style={{ background: "#dcfce7", color: "#15803d", padding: "0.75rem 1rem", borderRadius: "0.4rem", marginBottom: "1.5rem" }}>
                If that email is registered, a reset link has been sent. Check your inbox.
              </div>
              <button className="login-btn" onClick={() => router.push("/login")}>Back to Sign In</button>
            </div>
          ) : (
            <>
              {error && <div className="login-error">{error}</div>}
              <form onSubmit={(e) => void handleSubmit(e)} className="login-form">
                <div className="login-field">
                  <label htmlFor="email" className="login-label">Email address</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="login-input"
                    placeholder="you@example.ke"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <button type="submit" className="login-btn" disabled={loading}>
                  {loading ? <span className="login-spinner" /> : "Send Reset Link"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="login-btn"
                  style={{ background: "transparent", color: "var(--color-primary)", border: "1px solid var(--color-primary)", marginTop: "0.5rem" }}
                >
                  Back to Sign In
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
