"use client";

export default function ReportsPage() {
  const apiBase =
    (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000") + "/api/reports";

  return (
    <>
      <h1 className="page-title">Analytics & Reports</h1>
      <div className="card">
        <p className="card-subtitle">
          Download weekly and county comparison reports as CSV for offline analysis or briefing
          documents.
        </p>
        <ul>
          <li>
            <a href={`${apiBase}/weekly-summary`} target="_blank" rel="noreferrer">
              Weekly Sentiment Summary (CSV)
            </a>
          </li>
          <li>
            <a href={`${apiBase}/county-comparison`} target="_blank" rel="noreferrer">
              County Comparison (CSV)
            </a>
          </li>
        </ul>
      </div>
    </>
  );
}

