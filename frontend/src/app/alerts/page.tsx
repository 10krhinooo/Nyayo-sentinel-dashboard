"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";

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
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<AlertsResponse>("/alerts");
        setAlerts(res.data.alerts);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to load alerts", err);
      }
    }
    void load();

    const socket = getSocket();
    socket.on("alert:new", (alert: Alert) => {
      setAlerts((prev) => [alert, ...prev]);
    });
    return () => {
      socket.off("alert:new");
    };
  }, []);

  const badgeClass = (severity: Severity) => {
    switch (severity) {
      case "LOW":
        return "badge badge-low";
      case "MEDIUM":
        return "badge badge-medium";
      case "HIGH":
        return "badge badge-high";
      case "CRITICAL":
        return "badge badge-critical";
      default:
        return "badge";
    }
  };

  return (
    <>
      <h1 className="page-title">Early Warning Alerts</h1>
      <div className="card">
        <p className="card-subtitle">
          Automatic alerts based on negative sentiment thresholds and complaint volume spikes.
        </p>
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
                <td>{a.status}</td>
                <td>{a.summary}</td>
              </tr>
            ))}
            {alerts.length === 0 && (
              <tr>
                <td colSpan={7}>No alerts yet. System is monitoring in the background.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

