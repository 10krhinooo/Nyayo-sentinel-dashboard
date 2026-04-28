"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { setUser } from "../../../lib/auth";

type Role = "NATIONAL_ADMIN" | "COUNTY_OFFICIAL" | "ANALYST";

interface ProfileData {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  countyId: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  county?: { name: string } | null;
}

const ROLE_LABELS: Record<Role, string> = {
  NATIONAL_ADMIN: "National Admin",
  COUNTY_OFFICIAL: "County Official",
  ANALYST: "Analyst"
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ user: ProfileData }>("/profile");
      setProfile(res.data.user);
      setFirstName(res.data.user.firstName ?? "");
      setLastName(res.data.user.lastName ?? "");
    } catch {
      setError("Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProfile(); }, []);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSaving(true);
    try {
      const res = await api.patch<{ user: ProfileData }>("/profile", { firstName, lastName });
      setProfile((p) => p ? { ...p, firstName: res.data.user.firstName, lastName: res.data.user.lastName } : p);
      setUser({ id: res.data.user.id, email: res.data.user.email, firstName: res.data.user.firstName, lastName: res.data.user.lastName, role: res.data.user.role, countyId: res.data.user.countyId });
      setEditingProfile(false);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch {
      setProfileError("Failed to save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPassword !== confirmPassword) { setPwError("Passwords do not match."); return; }
    if (newPassword.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    setPwSaving(true);
    try {
      await api.post("/profile/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to change password.";
      setPwError(msg);
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <h1 className="page-title">My Profile</h1>
        <div className="card">
          <div className="skeleton-block" style={{ height: 80, marginBottom: "0.75rem" }} />
          <div className="skeleton-block" style={{ height: 40 }} />
        </div>
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <h1 className="page-title">My Profile</h1>
        <div className="card"><p className="card-subtitle">{error ?? "Profile unavailable."}</p></div>
      </>
    );
  }

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email;
  const initials = (profile.firstName?.[0] ?? profile.email[0]).toUpperCase();

  return (
    <>
      <h1 className="page-title">My Profile</h1>

      {/* Account Info */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{displayName}</div>
            <div style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>{profile.email}</div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
              <span className="sidebar-role-pill">{ROLE_LABELS[profile.role]}</span>
              {profile.county && (
                <span className="badge" style={{ background: "var(--color-bg)", color: "var(--color-muted)", border: "1px solid var(--color-border)", padding: "0.15rem 0.6rem", borderRadius: "9999px", fontSize: "0.75rem" }}>
                  {profile.county.name}
                </span>
              )}
            </div>
          </div>
          {!editingProfile && (
            <button className="btn-secondary" style={{ marginLeft: "auto", padding: "0.4rem 1rem" }} onClick={() => setEditingProfile(true)}>
              Edit
            </button>
          )}
        </div>

        {profileSuccess && (
          <div style={{ background: "#dcfce7", color: "#15803d", padding: "0.6rem 0.9rem", borderRadius: "0.4rem", marginBottom: "1rem", fontSize: "0.85rem" }}>
            Profile updated successfully.
          </div>
        )}

        {editingProfile ? (
          <form onSubmit={(e) => void handleProfileSave(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 420 }}>
            {profileError && <div className="error-banner">{profileError}</div>}
            <label>
              <span className="form-label">First name</span>
              <input className="form-input" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" maxLength={64} />
            </label>
            <label>
              <span className="form-label">Last name</span>
              <input className="form-input" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" maxLength={64} />
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="btn-primary" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save"}</button>
              <button type="button" className="btn-secondary" onClick={() => { setEditingProfile(false); setProfileError(null); setFirstName(profile.firstName ?? ""); setLastName(profile.lastName ?? ""); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 2rem", maxWidth: 480, fontSize: "0.875rem" }}>
            <div><span style={{ color: "var(--color-muted)" }}>First name</span><br /><strong>{profile.firstName || "—"}</strong></div>
            <div><span style={{ color: "var(--color-muted)" }}>Last name</span><br /><strong>{profile.lastName || "—"}</strong></div>
            <div><span style={{ color: "var(--color-muted)" }}>Email</span><br /><strong>{profile.email}</strong></div>
            <div><span style={{ color: "var(--color-muted)" }}>Last login</span><br /><strong>{profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : "—"}</strong></div>
            <div><span style={{ color: "var(--color-muted)" }}>Member since</span><br /><strong>{new Date(profile.createdAt).toLocaleDateString()}</strong></div>
            <div><span style={{ color: "var(--color-muted)" }}>2FA</span><br /><strong style={{ color: "var(--color-success)" }}>Email OTP — Active</strong></div>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="card">
        <div className="card-title">Change Password</div>
        {pwSuccess && (
          <div style={{ background: "#dcfce7", color: "#15803d", padding: "0.6rem 0.9rem", borderRadius: "0.4rem", marginBottom: "1rem", fontSize: "0.85rem" }}>
            Password changed successfully. A confirmation email has been sent.
          </div>
        )}
        {pwError && <div className="error-banner">{pwError}</div>}
        <form onSubmit={(e) => void handlePasswordChange(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 420 }}>
          <label>
            <span className="form-label">Current password</span>
            <div className="login-input-wrap">
              <input
                className="form-input"
                type={showCurrentPw ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={{ paddingRight: "2.5rem" }}
              />
              <button type="button" className="login-eye" style={{ top: "50%", transform: "translateY(-50%)" }} onClick={() => setShowCurrentPw((v) => !v)} aria-label="Toggle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showCurrentPw ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                </svg>
              </button>
            </div>
          </label>
          <label>
            <span className="form-label">New password (min. 8 characters)</span>
            <div className="login-input-wrap">
              <input
                className="form-input"
                type={showNewPw ? "text" : "password"}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ paddingRight: "2.5rem" }}
              />
              <button type="button" className="login-eye" style={{ top: "50%", transform: "translateY(-50%)" }} onClick={() => setShowNewPw((v) => !v)} aria-label="Toggle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showNewPw ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                </svg>
              </button>
            </div>
          </label>
          <label>
            <span className="form-label">Confirm new password</span>
            <input
              className="form-input"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          <div>
            <button type="submit" className="btn-primary" disabled={pwSaving}>{pwSaving ? "Saving…" : "Change Password"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
