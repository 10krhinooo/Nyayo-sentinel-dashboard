"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { getSocket } from "../../../lib/socket";

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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [drawerDetails, setDrawerDetails] = useState<AlertDetails | null | "loading">(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<AlertsResponse>(`/alerts?page=${page}&limit=${PAGE_LIMIT}`);
        setAlerts(res.data.alerts);
        setTotal(res.data.total);
      } catch {
        setError("Failed to load alerts. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [page]);

  useEffect(() => {
    const socket = getSocket();
    socket.on("alert:new", (alert: Alert) => {
      if (page === 1) {
        setAlerts((prev) => [alert, ...prev.slice(0, PAGE_LIMIT - 1)]);
        setTotal((prev) => prev + 1);
      }
    });
    return () => {
      socket.off("alert:new");
    };
  }, [page]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selected) {
      setDrawerDetails(null);
      return;
    }
    setDrawerDetails("loading");
    api
      .get<AlertDetails>(`/alerts/${selected.id}/details`)
      .then((res) => setDrawerDetails(res.data))
      .catch(() => setDrawerDetails(null));
  }, [selected]);

  async function updateStatus(id: string, status: Status) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status } : prev);
    try {
      await api.patch(`/alerts/${id}/status`, { status });
    } catch {
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: a.status } : a))
      );
    }
  }

  const badgeClass = (severity: Severity) => {
    const map: Record<Severity, string> = {
      LOW: "badge badge-low",
      MEDIUM: "badge badge-medium",
      HIGH: "badge badge-high",
      CRITICAL: "badge badge-critical"
    };
    return map[severity] ?? "badge";
  };

  const totalPages = Math.ceil(total / PAGE_LIMIT);

  return (
    <>
      <h1 className="page-title">Early Warning Alerts</h1>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <p className="card-subtitle">
          Automatic alerts based on negative sentiment thresholds and complaint volume spikes.
          Click any row to view full details.
        </p>

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
                  <th>Type</th>
                  <th>Status</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr
                    key={a.id}
                    className="clickable-row"
                    onClick={() => setSelected(a)}
                  >
                    <td>{new Date(a.triggeredAt).toLocaleString()}</td>
                    <td>{a.county?.name ?? a.countyId}</td>
                    <td>{a.topic?.name ?? "All topics"}</td>
                    <td>
                      <span className={badgeClass(a.severity)}>{a.severity}</span>
                    </td>
                    <td>{a.triggerType}</td>
                    <td>
                      <span className={`badge badge-status-${a.status.toLowerCase()}`}>
                        {a.status}
                      </span>
                      {a.status === "OPEN" && (
                        <button
                          className="btn-action"
                          onClick={(e) => { e.stopPropagation(); void updateStatus(a.id, "ACKNOWLEDGED"); }}
                        >
                          Acknowledge
                        </button>
                      )}
                      {a.status === "ACKNOWLEDGED" && (
                        <button
                          className="btn-action"
                          onClick={(e) => { e.stopPropagation(); void updateStatus(a.id, "RESOLVED"); }}
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.summary}
                    </td>
                  </tr>
                ))}
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      No alerts on this page. System is monitoring in the background.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn-action"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Prev
                </button>
                <span>
                  Page {page} of {totalPages} ({total} alerts)
                </span>
                <button
                  className="btn-action"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <div className="drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="Alert details">
            <div className="drawer-header">
              <h2 className="drawer-title">Alert Details</h2>
              <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close">
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
                      <span
                        className={badgeClass(selected.severity)}
                        style={{ borderLeft: `3px solid ${SEVERITY_COLORS[selected.severity]}` }}
                      >
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
                      <span className={`badge badge-status-${selected.status.toLowerCase()}`}>
                        {selected.status}
                      </span>
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
                  <div className="drawer-trigger-box" style={{ background: "var(--color-info-bg, #eff6ff)", borderLeft: "3px solid #3b82f6", color: "#1e3a5f" }}>
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

              {/* Alert Statistics — skeleton while loading */}
              {drawerDetails === "loading" && (
                <div>
                  <p className="drawer-section-title">Alert Statistics</p>
                  <div className="skeleton-block" style={{ height: 72, borderRadius: 8 }} />
                </div>
              )}

              {/* Alert Statistics — data */}
              {drawerDetails !== "loading" && drawerDetails && drawerDetails.eventCount > 0 && (
                <div>
                  <p className="drawer-section-title">Alert Statistics (24h window)</p>
                  <div className="drawer-stats-grid">
                    {([
                      { label: "Total Events", value: String(drawerDetails.eventCount), color: undefined },
                      { label: "Negative",     value: `${drawerDetails.negativePercent}% (${drawerDetails.negativeCount})`, color: "var(--color-danger)" },
                      { label: "Neutral",      value: `${drawerDetails.neutralPercent}%`,  color: undefined },
                      { label: "Positive",     value: `${drawerDetails.positivePercent}%`, color: "var(--color-success)" },
                      { label: "Avg Score",    value: drawerDetails.avgScore.toFixed(2),   color: undefined },
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
                          <li
                            key={s.source}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "0.25rem 0",
                              fontSize: "0.82rem",
                              borderBottom: "1px solid var(--color-border)"
                            }}
                          >
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
                      <button
                        className="btn-action"
                        onClick={() => void updateStatus(selected.id, "ACKNOWLEDGED")}
                      >
                        Acknowledge
                      </button>
                    )}
                    {selected.status === "ACKNOWLEDGED" && (
                      <button
                        className="btn-action"
                        onClick={() => void updateStatus(selected.id, "RESOLVED")}
                      >
                        Mark as Resolved
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Reference ID */}
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
