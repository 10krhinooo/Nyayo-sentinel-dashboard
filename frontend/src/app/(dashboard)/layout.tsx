"use client";

import { AuthGuard } from "../../components/AuthGuard";
import { Sidebar } from "../../components/Sidebar";
import { Topbar } from "../../components/Topbar";
import { SidebarProvider } from "../../lib/sidebarContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <div className="layout-root">
          <Sidebar />
          <div className="main-content">
            <Topbar />
            <main className="page-container">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </AuthGuard>
  );
}
