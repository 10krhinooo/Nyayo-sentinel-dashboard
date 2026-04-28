"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { api } from "../../../lib/api";
import { getUser, setUser } from "../../../lib/auth";

interface UserPayload {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: "NATIONAL_ADMIN" | "COUNTY_OFFICIAL" | "ANALYST";
  countyId: string | null;
}

interface LoginResponse {
  requiresOtp?: boolean;
  user?: UserPayload;
}

interface VerifyOtpResponse {
  user: UserPayload;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (getUser()) router.replace("/");
  }, [router]);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login", { email, password });
      if (res.data.requiresOtp) {
        setStep("otp");
      } else if (res.data.user) {
        setUser(res.data.user);
        router.push("/");
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; requiresPasswordSetup?: boolean } } })?.response?.data;
      if (data?.requiresPasswordSetup) {
        setWarning("This account has not been activated yet. Please check your email inbox (including spam) for an invite link to set your password.");
        return;
      }
      setError(data?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<VerifyOtpResponse>("/auth/verify-otp", { email, otp: otpCode });
      setUser(res.data.user);
      router.push("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Invalid code";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      {/* Left branding panel */}
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
          <p className="login-brand-desc">
            National Early Warning System for public sentiment monitoring across all 47 counties.
          </p>
          <div className="login-brand-chips">
            <span className="login-chip">Real-time Alerts</span>
            <span className="login-chip">County Heatmap</span>
            <span className="login-chip">Topic Analysis</span>
          </div>
        </div>
        <div className="login-brand-footer">
          Ministry of Interior &amp; National Administration
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel">
        <div className="login-form-card">
          {step === "credentials" ? (
            <>
              <div className="login-form-header">
                <h2 className="login-form-title">Sign in</h2>
                <p className="login-form-subtitle">Enter your credentials to access the dashboard</p>
              </div>

              {warning && (
                <div style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d", padding: "0.75rem 1rem", borderRadius: "0.4rem", marginBottom: "0.75rem", fontSize: "0.85rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span>{warning}</span>
                </div>
              )}
              {error && <div className="login-error">{error}</div>}

              <form onSubmit={(e) => void handleCredentials(e)} className="login-form">
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

                <div className="login-field">
                  <label htmlFor="password" className="login-label">Password</label>
                  <div className="login-input-wrap">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      className="login-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="login-eye"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
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

                <div style={{ textAlign: "right" }}>
                  <Link href="/forgot-password" style={{ fontSize: "0.825rem", color: "var(--color-primary)", fontWeight: 500 }}>
                    Forgot password?
                  </Link>
                </div>

                <button type="submit" className="login-btn" disabled={loading}>
                  {loading ? <span className="login-spinner" /> : "Sign in"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="login-form-header">
                <h2 className="login-form-title">Verify your identity</h2>
                <p className="login-form-subtitle">
                  A 6-digit code was sent to <strong>{email}</strong>. It expires in 10 minutes.
                </p>
              </div>

              {error && <div className="login-error">{error}</div>}

              <form onSubmit={(e) => void handleOtp(e)} className="login-form">
                <div className="login-field">
                  <label htmlFor="otp" className="login-label">Verification code</label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    className="login-input"
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    style={{ letterSpacing: "0.4rem", fontSize: "1.4rem", textAlign: "center" }}
                  />
                  <span className="login-hint">Check your email inbox (and spam folder).</span>
                </div>

                <button type="submit" className="login-btn" disabled={loading}>
                  {loading ? <span className="login-spinner" /> : "Verify"}
                </button>

                <button
                  type="button"
                  className="login-btn"
                  style={{ background: "transparent", color: "var(--color-primary)", border: "1px solid var(--color-primary)", marginTop: "0.5rem" }}
                  onClick={() => { setStep("credentials"); setOtpCode(""); setError(null); }}
                >
                  Back
                </button>
              </form>
            </>
          )}

          <p className="login-disclaimer">
            Authorised government personnel only. All access is logged and audited.
          </p>
        </div>
      </div>
    </div>
  );
}
