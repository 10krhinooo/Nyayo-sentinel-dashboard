"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { getSocket } from "../../../lib/socket";
import { useToast } from "../../../lib/toastContext";
import { ConfirmModal } from "../../../components/ConfirmModal";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Status = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

interface Alert {
  id: string;
  countyId: string;
  severity: Severity;
  triggerType: "THRESHOLD" | "SPIKE";
  triggeredAt: string;
  status: Status;
  summary: string;
  county?: { name: string };
  topic?: { name: string };
}

interface AlertsResponse {
  alerts: Alert[];
  total: number;
  page: number;
  limit: number;
}

interface AlertSource {
  source: string;
  count: number;
}

interface TopicContext {
  description: string;
  keyAreas: string[];
}

interface AlertDetails {
  eventCount: number;
  negativeCount: number;
  neutralCount: number;
  positiveCount: number;
  negativePercent: number;
  neutralPercent: number;
  positivePercent: number;
  avgScore: number;
  sources: AlertSource[];
  topicContext: TopicContext | null;
  triggerExplanation: string;
  llmSummary: string | null;
}

const PAGE_LIMIT = 20;

const TRIGGER_DESCRIPTIONS: Record<Alert["triggerType"], string> = {
  THRESHOLD: "Triggered when the percentage of negative sentiment exceeded a configured threshold over the last 24 hours.",
  SPIKE: "Triggered when complaint volume increased significantly compared to the previous 24-hour baseline period.",
};

const SEVERITY_COLORS: Record<Severity, string> = {
  LOW: "#10b981",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
  CRITICAL: "#7c3aed",
};

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [active, ref]);
}

export default function AlertsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [drawerDetails, setDrawerDetails] = useState<AlertDetails | null | "loading">(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Confirm modal state
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: Status; label: string } | null>(null);

  useFocusTrap(drawerRef, selected !== null);

  // Open alert from ?alertId= query param
  useEffect(() => {
    const alertId = searchParams.get("alertId");
    if (alertId && alerts.length > 0) {
      const found = alerts.find((a) => a.id === alertId);
      if (found) setSelected(found);
    }
  }, [searchParams, alerts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
      });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await api.get<AlertsResponse>(`/alerts?${params.toString()}`);
      setAlerts(res.data.alerts);
      setTotal(res.data.total);
    } catch {
      setError("Failed to load alerts.");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, startDate, endDate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    socket.on("alert:new", (alert: Alert) => {
      if (page === 1) {
        setAlerts((prev) => [alert, ...prev.slice(0, PAGE_LIMIT - 1)]);
        setTotal((prev) => prev + 1);
      }
    });
    return () => { socket.off("alert:new"); };
  }, [page]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selected) { setDrawerDetails(null); return; }
    setDrawerDetails("loading");
    api
      .get<AlertDetails>(`/alerts/${selected.id}/details`)
      .then((res) => setDrawerDetails(res.data))
      .catch(() => setDrawerDetails(null));
  }, [selected]);

  async function updateStatus(id: string, status: Status) {
    const prev = alerts.find((a) => a.id === id)?.status;
    setAlerts((cur) => cur.map((a) => (a.id === id ? { ...a, status } : a)));
    if (selected?.id === id) setSelected((s) => s ? { ...s, status } : s);
    try {
      await api.patch(`/alerts/${id}/status`, { status });
      showToast(`Alert ${status.toLowerCase()}.`);
    } catch {
      if (prev) setAlerts((cur) => cur.map((a) => (a.id === id ? { ...a, status: prev } : a)));
      showToast("Failed to update alert status.", "error");
    }
  }

  function requestStatusChange(id: string, status: Status, label: string) {
    setConfirmAction({ id, status, label });
  }

  const badgeClass = (severity: Severity) => ({
    LOW: "badge badge-low", MEDIUM: "badge badge-medium",
    HIGH: "badge badge-high", CRITICAL: "badge badge-critical"
  })[severity] ?? "badge";

  const totalPages = Math.ceil(total / PAGE_LIMIT);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, startDate, endDate]);

  function openAlert(a: Alert) {
    setSelected(a);
    router.replace(`/alerts?alertId=${a.id}`, { scroll: false });
  }

  function closeDrawer() {
    setSelected(null);
    router.replace("/alerts", { scroll: false });
  }

  return (
    <>
      <h1 className="page-title">Early Warning Alerts</h1>

      {error && (
        <div className="retry-banner">
          <span>{error}</span>
          <button className="btn-action" onClick={() => void load()}>Retry</button>
        </div>
      )}

      <div className="card">
        <p className="card-subtitle">
          Automatic alerts based on negative sentiment thresholds and complaint volume spikes.
          Click any row to view full details.
        </p>

        {/* Filter bar */}
        <div className="filter-bar">
          <input
            type="search"
            className="form-input"
            placeholder="Search county or topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search alerts"
          />
          <select
            className="form-input"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Status | "")}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          <input
            type="date"
            className="form-input"
            style={{ width: "auto" }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
          />
          <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", flexShrink: 0 }}>to</span>
          <input
            type="date"
            className="form-input"
            style={{ width: "auto" }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date"
          />
          {(search || statusFilter || startDate || endDate) && (
            <button
              className="btn-secondary"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem", flexShrink: 0 }}
              onClick={() => { setSearch(""); setStatusFilter(""); setStartDate(""); setEndDate(""); }}
            >
              Clear
            </button>
          )}
        </div>

        {loading && (
          <>
            <div className="skeleton-block" style={{ height: 40, marginBottom: "0.5rem" }} />
            <div className="skeleton-block" style={{ height: 40, marginBottom: "0.5rem" }} />
            <div className="skeleton-block" style={{ height: 40 }} />
          </>
        )}

        {!loading && (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Triggered</th>
                    <th>County</th>
                    <th>Topic</th>
                    <th>Severity</th>
                    <th className="col-hide-mobile">Type</th>
                    <th>Status</th>
                    <th className="col-hide-mobile">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr
                      key={a.id}
                      className="clickable-row"
                      tabIndex={0}
                      onClick={() => openAlert(a)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAlert(a); } }}
                      aria-label={`Alert: ${a.county?.name ?? ""} ${a.topic?.name ?? ""} ${a.severity}`}
                    >
                      <td>{new Date(a.triggeredAt).toLocaleString()}</td>
                      <td>{a.county?.name ?? a.countyId}</td>
                      <td>{a.topic?.name ?? "All topics"}</td>
                      <td><span className={badgeClass(a.severity)}>{a.severity}</span></td>
                      <td className="col-hide-mobile">{a.triggerType}</td>
                      <td>
                        <span className={`badge badge-status-${a.status.toLowerCase()}`}>{a.status}</span>
                        {a.status === "OPEN" && (
                          <button
                            className="btn-action"
                            onClick={(e) => { e.stopPropagation(); requestStatusChange(a.id, "ACKNOWLEDGED", "Acknowledge this alert?"); }}
                          >
                            Acknowledge
                          </button>
                        )}
                        {a.status === "ACKNOWLEDGED" && (
                          <button
                            className="btn-action"
                            onClick={(e) => { e.stopPropagation(); requestStatusChange(a.id, "RESOLVED", "Mark this alert as resolved?"); }}
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                      <td className="col-hide-mobile" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.summary}
                      </td>
                    </tr>
                  ))}
                  {alerts.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", color: "var(--color-muted)", padding: "2rem 0" }}>
                        {search || statusFilter || startDate || endDate
                          ? "No alerts match your filters."
                          : "No alerts yet. The system is monitoring in the background."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button className="btn-action" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                <span>Page {page} of {totalPages} ({total} alerts)</span>
                <button className="btn-action" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <ConfirmModal
          title="Confirm action"
          body={confirmAction.label}
          confirmLabel={confirmAction.status === "ACKNOWLEDGED" ? "Acknowledge" : "Resolve"}
          onConfirm={() => {
            void updateStatus(confirmAction.id, confirmAction.status);
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Alert detail drawer */}
      {selected && (
        <>
          <div className="drawer-backdrop" onClick={closeDrawer} />
          <div
            className="drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Alert details"
          >
            <div className="drawer-header">
              <h2 className="drawer-title">Alert Details</h2>
              <button className="drawer-close" onClick={closeDrawer} aria-label="Close alert details">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              {/* Summary */}
              <div>
                <p className="drawer-section-title">Summary</p>
                <div className="drawer-summary">{selected.summary}</div>
              </div>

              {/* Metadata grid */}
              <div>
                <p className="drawer-section-title">Details</p>
                <div className="drawer-meta">
                  <div className="drawer-meta-item">
                    <span className="drawer-meta-label">Triggered</span>
                    <span className="drawer-meta-value">
                      {new Date(selected.triggeredAt).toLocaleDateString("en-KE", {
                        weekday: "short", year: "numeric", month: "short", day: "numeric"
                      })}
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>
                      {new Date(selected.triggeredAt).toLocaleTimeString("en-KE")}
                    </span>
                  </div>
                  <div className="drawer-meta-item">
                    <span className="drawer-meta-label">County</span>
                    <span className="drawer-meta-value">{selected.county?.name ?? selected.countyId}</span>
                  </div>
                  <div className="drawer-meta-item">
                    <span className="drawer-meta-label">Topic</span>
                    <span className="drawer-meta-value">{selected.topic?.name ?? "All topics"}</span>
                  </div>
                  <div className="drawer-meta-item">
                    <span className="drawer-meta-label">Severity</span>
                    <span>
                      <span className={badgeClass(selected.severity)} style={{ borderLeft: `3px solid ${SEVERITY_COLORS[selected.severity]}` }}>
                        {selected.severity}
                      </span>
                    </span>
                  </div>
                  <div className="drawer-meta-item">
                    <span className="drawer-meta-label">Trigger type</span>
                    <span className="drawer-meta-value">{selected.triggerType}</span>
                  </div>
                  <div className="drawer-meta-item">
                    <span className="drawer-meta-label">Current status</span>
                    <span>
                      <span className={`badge badge-status-${selected.status.toLowerCase()}`}>{selected.status}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Trigger explanation */}
              <div>
                <p className="drawer-section-title">What triggered this?</p>
                <div className="drawer-trigger-box">
                  {drawerDetails !== "loading" && drawerDetails?.triggerExplanation
                    ? drawerDetails.triggerExplanation
                    : TRIGGER_DESCRIPTIONS[selected.triggerType]}
                </div>
              </div>

              {/* AI Analysis */}
              {drawerDetails === "loading" && (
                <div>
                  <p className="drawer-section-title">AI Analysis</p>
                  <div className="skeleton-block" style={{ height: 60, borderRadius: 8 }} />
                </div>
              )}
              {drawerDetails !== "loading" && drawerDetails?.llmSummary && (
                <div>
                  <p className="drawer-section-title">AI Analysis</p>
                  <div className="drawer-trigger-box" style={{ background: "#eff6ff", borderLeft: "3px solid #3b82f6", color: "#1e3a5f" }}>
                    {drawerDetails.llmSummary}
                  </div>
                </div>
              )}

              {/* Topic Context */}
              {drawerDetails !== "loading" && drawerDetails?.topicContext && (
                <div>
                  <p className="drawer-section-title">Topic Context</p>
                  <div className="drawer-topic-context">
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", lineHeight: 1.55 }}>
                      {drawerDetails.topicContext.description}
                    </p>
                    <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--color-muted)" }}>
                      Key areas: {drawerDetails.topicContext.keyAreas.join(" · ")}
                    </p>
                  </div>
                </div>
              )}

              {/* Alert Statistics */}
              {drawerDetails === "loading" && (
                <div>
                  <p className="drawer-section-title">Alert Statistics</p>
                  <div className="skeleton-block" style={{ height: 72, borderRadius: 8 }} />
                </div>
              )}
              {drawerDetails !== "loading" && drawerDetails && drawerDetails.eventCount > 0 && (
                <div>
                  <p className="drawer-section-title">Alert Statistics (24h window)</p>
                  <div className="drawer-stats-grid">
                    {([
                      { label: "Total Events", value: String(drawerDetails.eventCount), color: undefined },
                      { label: "Negative",     value: `${drawerDetails.negativePercent}% (${drawerDetails.negativeCount})`, color: "var(--color-danger)" },
                      { label: "Neutral",      value: `${drawerDetails.neutralPercent}%`, color: undefined },
                      { label: "Positive",     value: `${drawerDetails.positivePercent}%`, color: "var(--color-success)" },
                      { label: "Avg Score",    value: drawerDetails.avgScore.toFixed(2), color: undefined },
                    ] as { label: string; value: string; color: string | undefined }[]).map(({ label, value, color }) => (
                      <div key={label} className="drawer-stat-item">
                        <span className="drawer-meta-label">{label}</span>
                        <span className="drawer-meta-value" style={color ? { color } : undefined}>{value}</span>
                      </div>
                    ))}
                  </div>
                  {drawerDetails.sources.length > 0 && (
                    <div style={{ marginTop: "0.875rem" }}>
                      <p className="drawer-section-title" style={{ marginBottom: "0.375rem" }}>Top Sources</p>
                      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                        {drawerDetails.sources.map((s) => (
                          <li key={s.source} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", fontSize: "0.82rem", borderBottom: "1px solid var(--color-border)" }}>
                            <span>{s.source}</span>
                            <span style={{ fontWeight: 600 }}>{s.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              {selected.status !== "RESOLVED" && (
                <div>
                  <p className="drawer-section-title">Actions</p>
                  <div className="drawer-actions">
                    {selected.status === "OPEN" && (
                      <button className="btn-action" onClick={() => requestStatusChange(selected.id, "ACKNOWLEDGED", "Acknowledge this alert?")}>
                        Acknowledge
                      </button>
                    )}
                    {selected.status === "ACKNOWLEDGED" && (
                      <button className="btn-action" onClick={() => requestStatusChange(selected.id, "RESOLVED", "Mark this alert as resolved?")}>
                        Mark as Resolved
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="drawer-section-title">Alert ID</p>
                <span className="drawer-id">{selected.id}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
