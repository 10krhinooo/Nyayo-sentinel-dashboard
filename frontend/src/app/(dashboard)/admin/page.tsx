"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type MetricType = "NEGATIVE_PERCENT" | "SPIKE_FACTOR";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Role = "NATIONAL_ADMIN" | "COUNTY_OFFICIAL" | "ANALYST";

interface Threshold {
  id: string;
  metricType: MetricType;
  thresholdVal: number;
  severity: Severity;
  active: boolean;
  county?: { name: string } | null;
  topic?: { name: string } | null;
}

interface UserRecord {
  id: string;
  email: string;
  role: Role;
  countyId: string | null;
  mfaEnabled: boolean;
  createdAt: string;
  county?: { name: string } | null;
}

// ─── Threshold tab ────────────────────────────────────────────────────────────

const defaultThresholdForm = {
  metricType: "NEGATIVE_PERCENT" as MetricType,
  thresholdVal: "",
  severity: "MEDIUM" as Severity,
  countyId: "",
  topicId: "",
};

function ThresholdsTab() {
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultThresholdForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadThresholds() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ thresholds: Threshold[] }>("/alerts/thresholds");
      setThresholds(res.data.thresholds);
    } catch {
      setError("Failed to load thresholds.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadThresholds(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const val = parseFloat(form.thresholdVal);
    if (isNaN(val) || val <= 0) { setFormError("Threshold value must be a positive number."); return; }
    if (form.metricType === "NEGATIVE_PERCENT" && (val < 0 || val > 100)) { setFormError("NEGATIVE_PERCENT must be between 0 and 100."); return; }
    if (form.metricType === "SPIKE_FACTOR" && val <= 1) { setFormError("SPIKE_FACTOR must be greater than 1."); return; }

    setSubmitting(true);
    try {
      await api.post("/alerts/thresholds", {
        metricType: form.metricType,
        thresholdVal: val,
        severity: form.severity,
        countyId: form.countyId.trim() || undefined,
        topicId: form.topicId.trim() || undefined,
      });
      setForm(defaultThresholdForm);
      await loadThresholds();
    } catch {
      setFormError("Failed to create threshold. Please check your inputs and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Alert Thresholds</div>
        {loading ? (
          <>
            <div className="skeleton-block" style={{ height: 36, marginBottom: "0.5rem" }} />
            <div className="skeleton-block" style={{ height: 36 }} />
          </>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Metric</th><th>Value</th><th>Severity</th><th>County</th><th>Topic</th><th>Active</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((t) => (
                  <tr key={t.id}>
                    <td>{t.metricType}</td>
                    <td>{t.metricType === "NEGATIVE_PERCENT" ? `${t.thresholdVal}%` : `${t.thresholdVal}x`}</td>
                    <td><span className={`badge badge-${t.severity.toLowerCase()}`}>{t.severity}</span></td>
                    <td>{t.county?.name ?? "All counties"}</td>
                    <td>{t.topic?.name ?? "All topics"}</td>
                    <td>{t.active ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {thresholds.length === 0 && (
                  <tr><td colSpan={6}>No thresholds configured yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Add Alert Threshold</div>
        {formError && <div className="error-banner">{formError}</div>}
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 480 }}>
          <label>
            <span className="form-label">Metric Type</span>
            <select className="form-input" value={form.metricType} onChange={(e) => setForm((f) => ({ ...f, metricType: e.target.value as MetricType }))}>
              <option value="NEGATIVE_PERCENT">NEGATIVE_PERCENT (0–100%)</option>
              <option value="SPIKE_FACTOR">SPIKE_FACTOR (&gt;1x)</option>
            </select>
          </label>
          <label>
            <span className="form-label">Threshold Value{form.metricType === "NEGATIVE_PERCENT" ? " (%)" : " (factor)"}</span>
            <input className="form-input" type="number" step="0.1" min="0" value={form.thresholdVal}
              onChange={(e) => setForm((f) => ({ ...f, thresholdVal: e.target.value }))}
              placeholder={form.metricType === "NEGATIVE_PERCENT" ? "e.g. 40" : "e.g. 2.5"} required />
          </label>
          <label>
            <span className="form-label">Severity</span>
            <select className="form-input" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Severity }))}>
              <option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option>
            </select>
          </label>
          <label>
            <span className="form-label">County ID (optional)</span>
            <input className="form-input" type="text" value={form.countyId} onChange={(e) => setForm((f) => ({ ...f, countyId: e.target.value }))} placeholder="County cuid" />
          </label>
          <label>
            <span className="form-label">Topic ID (optional)</span>
            <input className="form-input" type="text" value={form.topicId} onChange={(e) => setForm((f) => ({ ...f, topicId: e.target.value }))} placeholder="Topic cuid" />
          </label>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Creating…" : "Create Threshold"}</button>
        </form>
      </div>
    </>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

const defaultUserForm = { email: "", password: "", role: "ANALYST" as Role, countyId: "" };

function UsersTab() {
  const currentUser = getUser();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultUserForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ role: Role; countyId: string }>({ role: "ANALYST", countyId: "" });

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ users: UserRecord[] }>("/users");
      setUsers(res.data.users);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post("/users", {
        email: form.email,
        password: form.password,
        role: form.role,
        countyId: form.role === "COUNTY_OFFICIAL" ? form.countyId || undefined : undefined,
      });
      setForm(defaultUserForm);
      setShowForm(false);
      await loadUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setFormError(msg ?? "Failed to create user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(id: string) {
    try {
      await api.patch(`/users/${id}`, {
        role: editForm.role,
        countyId: editForm.role === "COUNTY_OFFICIAL" ? editForm.countyId || null : null,
      });
      setEditingId(null);
      await loadUsers();
    } catch {
      alert("Failed to update user.");
    }
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${id}`);
      await loadUsers();
    } catch {
      alert("Failed to delete user.");
    }
  }

  const ROLE_LABELS: Record<Role, string> = {
    NATIONAL_ADMIN: "National Admin",
    COUNTY_OFFICIAL: "County Official",
    ANALYST: "Analyst",
  };

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div className="card-title" style={{ marginBottom: 0 }}>System Users</div>
          <button className="btn-primary" style={{ padding: "0.4rem 1rem" }} onClick={() => { setShowForm((v) => !v); setFormError(null); }}>
            {showForm ? "Cancel" : "+ Add User"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 480, marginBottom: "1.5rem", padding: "1rem", background: "var(--color-bg)", borderRadius: "0.5rem" }}>
            {formError && <div className="error-banner">{formError}</div>}
            <label>
              <span className="form-label">Email</span>
              <input className="form-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required placeholder="user@example.ke" />
            </label>
            <label>
              <span className="form-label">Password (min 8 characters)</span>
              <input className="form-input" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
            </label>
            <label>
              <span className="form-label">Role</span>
              <select className="form-input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
                <option value="NATIONAL_ADMIN">National Admin</option>
                <option value="ANALYST">Analyst</option>
                <option value="COUNTY_OFFICIAL">County Official</option>
              </select>
            </label>
            {form.role === "COUNTY_OFFICIAL" && (
              <label>
                <span className="form-label">County ID</span>
                <input className="form-input" type="text" value={form.countyId} onChange={(e) => setForm((f) => ({ ...f, countyId: e.target.value }))} placeholder="County cuid (required for County Official)" required />
              </label>
            )}
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Creating…" : "Create User"}</button>
          </form>
        )}

        {loading ? (
          <>
            <div className="skeleton-block" style={{ height: 36, marginBottom: "0.5rem" }} />
            <div className="skeleton-block" style={{ height: 36 }} />
          </>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Email</th><th>Role</th><th>County</th><th>MFA</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>
                      {editingId === u.id ? (
                        <select className="form-input" style={{ padding: "0.2rem 0.4rem", fontSize: "0.8rem" }}
                          value={editForm.role}
                          onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))}>
                          <option value="NATIONAL_ADMIN">National Admin</option>
                          <option value="ANALYST">Analyst</option>
                          <option value="COUNTY_OFFICIAL">County Official</option>
                        </select>
                      ) : (
                        <span className="sidebar-role-pill">{ROLE_LABELS[u.role]}</span>
                      )}
                    </td>
                    <td>
                      {editingId === u.id && editForm.role === "COUNTY_OFFICIAL" ? (
                        <input className="form-input" style={{ padding: "0.2rem 0.4rem", fontSize: "0.8rem", width: 140 }}
                          value={editForm.countyId}
                          onChange={(e) => setEditForm((f) => ({ ...f, countyId: e.target.value }))}
                          placeholder="County cuid" />
                      ) : (
                        u.county?.name ?? "—"
                      )}
                    </td>
                    <td>{u.mfaEnabled ? "Enabled" : "Off"}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      {u.id === currentUser?.id ? (
                        <span style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>You</span>
                      ) : editingId === u.id ? (
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button className="btn-primary" style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }} onClick={() => void handleUpdate(u.id)}>Save</button>
                          <button className="btn-secondary" style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button className="btn-secondary" style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                            onClick={() => { setEditingId(u.id); setEditForm({ role: u.role, countyId: u.countyId ?? "" }); }}>
                            Edit
                          </button>
                          <button style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem", background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: "0.375rem", cursor: "pointer" }}
                            onClick={() => void handleDelete(u.id, u.email)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6}>No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const user = getUser();
  const [activeTab, setActiveTab] = useState<"users" | "thresholds">("users");

  if (user?.role !== "NATIONAL_ADMIN") {
    return (
      <>
        <h1 className="page-title">Admin Panel</h1>
        <div className="card">
          <p className="card-subtitle">Admin access required. This page is only available to National Administrators.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Admin Panel</h1>

      <div className="admin-tabs">
        <button
          className={`admin-tab${activeTab === "users" ? " admin-tab-active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          className={`admin-tab${activeTab === "thresholds" ? " admin-tab-active" : ""}`}
          onClick={() => setActiveTab("thresholds")}
        >
          Alert Thresholds
        </button>
      </div>

      {activeTab === "users" ? <UsersTab /> : <ThresholdsTab />}
    </>
  );
}
