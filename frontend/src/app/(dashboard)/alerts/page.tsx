"use client";

import { useEffect, useState } from "react";
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

const PAGE_LIMIT = 20;

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function updateStatus(id: string, status: Status) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
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
                  <tr key={a.id}>
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
                          onClick={() => void updateStatus(a.id, "ACKNOWLEDGED")}
                        >
                          Acknowledge
                        </button>
                      )}
                      {a.status === "ACKNOWLEDGED" && (
                        <button
                          className="btn-action"
                          onClick={() => void updateStatus(a.id, "RESOLVED")}
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                    <td>{a.summary}</td>
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
    </>
  );
}
