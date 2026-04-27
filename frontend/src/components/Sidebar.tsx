"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getUser, clearUser } from "../lib/auth";
import { api } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useSidebar } from "../lib/sidebarContext";

type Role = "NATIONAL_ADMIN" | "COUNTY_OFFICIAL" | "ANALYST";

const ALL_LINKS = [
  {
    href: "/",
    label: "Dashboard",
    roles: ["NATIONAL_ADMIN", "COUNTY_OFFICIAL", "ANALYST"] as Role[],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    )
  },
  {
    href: "/heatmap",
    label: "Heatmap",
    roles: ["NATIONAL_ADMIN", "COUNTY_OFFICIAL", "ANALYST"] as Role[],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
      </svg>
    )
  },
  {
    href: "/topics",
    label: "Topics",
    roles: ["NATIONAL_ADMIN", "COUNTY_OFFICIAL", "ANALYST"] as Role[],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    )
  },
  {
    href: "/alerts",
    label: "Alerts",
    roles: ["NATIONAL_ADMIN", "COUNTY_OFFICIAL", "ANALYST"] as Role[],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    )
  },
  {
    href: "/reports",
    label: "Reports",
    roles: ["NATIONAL_ADMIN", "ANALYST"] as Role[],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    )
  },
  {
    href: "/admin",
    label: "Admin",
    roles: ["NATIONAL_ADMIN"] as Role[],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M4.93 19.07l1.41-1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/>
      </svg>
    )
  }
];

const ROLE_LABELS: Record<Role, string> = {
  NATIONAL_ADMIN: "National Admin",
  COUNTY_OFFICIAL: "County Official",
  ANALYST: "Analyst"
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const role = (user?.role ?? "ANALYST") as Role;
  const { open, close } = useSidebar();

  const visibleLinks = ALL_LINKS.filter((l) => l.roles.includes(role));

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // proceed regardless
    }
    disconnectSocket();
    clearUser();
    router.push("/login");
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="sidebar-backdrop"
          onClick={close}
          aria-hidden="true"
        />
      )}
    <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <div className="sidebar-brand">Nyayo Sentinel</div>
          <div className="sidebar-brand-sub">Republic of Kenya</div>
        </div>
      </div>

      <div className="sidebar-divider" />

      {/* Nav links */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>
        {visibleLinks.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`sidebar-link${active ? " sidebar-link-active" : ""}`}
            >
              <span className="sidebar-link-icon">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User card + logout */}
      <div className="sidebar-divider" />
      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {(user?.email?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-email">{user?.email ?? "—"}</div>
          <div className="sidebar-role-pill">{ROLE_LABELS[role]}</div>
        </div>
      </div>
      <button className="sidebar-logout" onClick={() => void handleLogout()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign out
      </button>
    </aside>
    </>
  );
}
