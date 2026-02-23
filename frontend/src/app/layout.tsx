import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "../components/Sidebar";
import { Topbar } from "../components/Topbar";

export const metadata: Metadata = {
  title: "Nyayo Sentinel Dashboard",
  description: "Early Warning System for public sentiment across Kenya"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="layout-root">
          <Sidebar />
          <div className="main-content">
            <Topbar />
            <main className="page-container">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

