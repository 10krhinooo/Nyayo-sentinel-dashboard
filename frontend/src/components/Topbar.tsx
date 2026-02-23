"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

type Role = "NATIONAL_ADMIN" | "COUNTY_OFFICIAL" | "ANALYST" | "GUEST";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Status = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

interface AlertSummary {
  id: string;
  severity: Severity;
  status: Status;
}

interface AlertsResponse {
  alerts: AlertSummary[];
}

export function Topbar() {
  const [role] = useState<Role>("NATIONAL_ADMIN"); // TODO: wire to real auth
  const [activeAlerts, setActiveAlerts] = useState<number>(0);

  useEffect(() => {
    async function loadAlerts() {
      try {
        const res = await api.get<AlertsResponse>("/alerts");
        const openCount = res.data.alerts.filter((a) => a.status === "OPEN").length;
        setActiveAlerts(openCount);
      } catch {
        // swallow; counter will just show 0 if request fails
        setActiveAlerts(0);
      }
    }

    void loadAlerts();

    const socket = getSocket();
    socket.on("alert:new", (alert: AlertSummary) => {
      if (alert.status === "OPEN") {
        setActiveAlerts((prev) => prev + 1);
      }
    });

    return () => {
      socket.off("alert:new");
    };
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-role">Signed in as: {role.replace("_", " ")}</div>
      <div className="topbar-notifications">
        Active alerts: <strong>{activeAlerts}</strong>
      </div>
    </header>
  );
}

