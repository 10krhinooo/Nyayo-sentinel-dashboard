"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "../../../lib/api";
import { getUser, setUser } from "../../../lib/auth";

interface LoginResponse {
  user: {
    id: string;
    email: string;
    role: "NATIONAL_ADMIN" | "COUNTY_OFFICIAL" | "ANALYST";
    countyId: string | null;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getUser()) router.replace("/");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
        ...(requiresMfa && mfaCode ? { mfaCode } : {})
      });
      setUser(res.data.user);
      router.push("/");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Login failed";
      if (msg.toLowerCase().includes("mfa") || msg.toLowerCase().includes("totp")) {
        setRequiresMfa(true);
        setError("Please enter your MFA code.");
      } else {
        setError(msg);
      }
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
          <div className="login-form-header">
            <h2 className="login-form-title">Sign in</h2>
            <p className="login-form-subtitle">Enter your credentials to access the dashboard</p>
          </div>

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

            {requiresMfa && (
              <div className="login-field">
                <label htmlFor="mfa" className="login-label">MFA Code</label>
                <input
                  id="mfa"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="login-input"
                  placeholder="6-digit code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
                <span className="login-hint">Enter the 6-digit code from your authenticator app.</span>
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <span className="login-spinner" />
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="login-disclaimer">
            Authorised government personnel only. All access is logged and audited.
          </p>
        </div>
      </div>
    </div>
  );
}
