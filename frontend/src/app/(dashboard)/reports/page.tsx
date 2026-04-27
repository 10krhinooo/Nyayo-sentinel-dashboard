"use client";

import { useState } from "react";
import { api } from "../../../lib/api";

async function downloadCsv(endpoint: string, filename: string) {
  const res = await api.get(endpoint, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(endpoint: string, filename: string) {
    setDownloading(filename);
    setError(null);
    try {
      await downloadCsv(endpoint, filename);
    } catch {
      setError("Download failed. Please ensure you are signed in and try again.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <h1 className="page-title">Analytics &amp; Reports</h1>
      <div className="card">
        <p className="card-subtitle">
          Download weekly and county comparison reports as CSV for offline analysis or briefing
          documents.
        </p>

        {error && <div className="error-banner">{error}</div>}

        <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <li>
            <button
              className="btn-download"
              disabled={downloading === "weekly-summary.csv"}
              onClick={() => void handleDownload("/reports/weekly-summary", "weekly-summary.csv")}
            >
              {downloading === "weekly-summary.csv" ? "Downloading…" : "Weekly Sentiment Summary (CSV)"}
            </button>
          </li>
          <li>
            <button
              className="btn-download"
              disabled={downloading === "county-comparison.csv"}
              onClick={() => void handleDownload("/reports/county-comparison", "county-comparison.csv")}
            >
              {downloading === "county-comparison.csv" ? "Downloading…" : "County Comparison (CSV)"}
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}
