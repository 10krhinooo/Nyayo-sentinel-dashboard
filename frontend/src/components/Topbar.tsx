"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useSidebar } from "../lib/sidebarContext";

interface AlertSummary {
  id: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
}

interface AlertsResponse {
  alerts: AlertSummary[];
  total: number;
}

const PAGE_TITLES: Record<string, string> = {
  "/":        "National Overview",
  "/heatmap": "County Heatmap",
  "/topics":  "Topic Analysis",
  "/alerts":  "Early Warning Alerts",
  "/reports": "Analytics & Reports",
  "/admin":   "Admin Panel"
};

export function Topbar() {
  const pathname = usePathname();
  const [openAlerts, setOpenAlerts] = useState<number>(0);
  const { toggle } = useSidebar();

  const title = PAGE_TITLES[pathname] ?? "Dashboard";

  useEffect(() => {
    async function loadAlerts() {
      try {
        const res = await api.get<AlertsResponse>("/alerts?limit=100");
        setOpenAlerts(res.data.alerts.filter((a) => a.status === "OPEN").length);
      } catch {
        setOpenAlerts(0);
      }
    }
    void loadAlerts();

    const socket = getSocket();
    socket.on("alert:new", (alert: AlertSummary) => {
      if (alert.status === "OPEN") setOpenAlerts((n) => n + 1);
    });
    return () => { socket.off("alert:new"); };
  }, []);

  return (
    <header className="topbar">
      <button className="topbar-hamburger" onClick={toggle} aria-label="Toggle navigation">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <h2 className="topbar-title">{title}</h2>
      <div className="topbar-right">
        {openAlerts > 0 && (
          <div className="topbar-alert-badge">
            <span className="topbar-alert-dot" />
            <span>{openAlerts} open alert{openAlerts !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </header>
  );
}
