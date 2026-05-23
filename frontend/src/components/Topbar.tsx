"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useSidebar } from "../lib/sidebarContext";

interface AlertSummary {
  id: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  county?: { name: string };
  topic?: { name: string };
  triggeredAt: string;
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
  "/admin":   "Admin Panel",
  "/profile": "My Profile"
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEVERITY_COLOR: Record<string, string> = {
  LOW: "#10b981", MEDIUM: "#f59e0b", HIGH: "#ef4444", CRITICAL: "#7c3aed"
};

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toggle } = useSidebar();
  const [recentAlerts, setRecentAlerts] = useState<AlertSummary[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const title = PAGE_TITLES[pathname] ?? "Dashboard";

  useEffect(() => {
    async function loadAlerts() {
      try {
        const res = await api.get<AlertsResponse>("/alerts?limit=20");
        const open = res.data.alerts.filter((a) => a.status === "OPEN");
        setOpenCount(open.length);
        setRecentAlerts(open.slice(0, 5));
      } catch {
        setOpenCount(0);
      }
    }
    void loadAlerts();

    const socket = getSocket();
    socket.on("alert:new", (alert: AlertSummary) => {
      if (alert.status === "OPEN") {
        setOpenCount((n) => n + 1);
        setRecentAlerts((prev) => [alert, ...prev].slice(0, 5));
      }
    });
    return () => { socket.off("alert:new"); };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [dropdownOpen]);

  function openAlertInDrawer(alertId: string) {
    setDropdownOpen(false);
    router.push(`/alerts?alertId=${alertId}`);
  }

  return (
    <header className="topbar">
      <button className="topbar-hamburger" onClick={toggle} aria-label="Toggle navigation">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <h2 className="topbar-title">{title}</h2>
      <div className="topbar-right">
        {openCount > 0 && (
          <div className="notif-wrapper" ref={dropdownRef}>
            <button
              className="topbar-alert-badge notif-badge"
              onClick={() => setDropdownOpen((v) => !v)}
              aria-label={`${openCount} open alert${openCount !== 1 ? "s" : ""}. Click to see recent alerts.`}
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <span className="topbar-alert-dot" aria-hidden="true" />
              <span>{openCount} open alert{openCount !== 1 ? "s" : ""}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: 2, opacity: 0.7 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="notif-dropdown" role="menu" aria-label="Recent open alerts">
                <div className="notif-header">Recent open alerts</div>
                {recentAlerts.map((a) => (
                  <button
                    key={a.id}
                    className="notif-item"
                    role="menuitem"
                    onClick={() => openAlertInDrawer(a.id)}
                  >
                    <div className="notif-item-county">
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: SEVERITY_COLOR[a.severity] ?? "#64748b", marginRight: 6 }} aria-hidden="true" />
                      {a.county?.name ?? "Unknown county"}
                    </div>
                    <div className="notif-item-meta">
                      {a.topic?.name ?? "All topics"} · {a.severity} · {timeAgo(a.triggeredAt)}
                    </div>
                  </button>
                ))}
                <button className="notif-footer" onClick={() => { setDropdownOpen(false); router.push("/alerts"); }}>
                  View all alerts →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
