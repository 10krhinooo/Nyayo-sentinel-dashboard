"use client";

export default function AdminPage() {
  return (
    <>
      <h1 className="page-title">Administration</h1>
      <div className="card">
        <p className="card-subtitle">
          This section is reserved for National Admins to manage users, roles, counties, and alert
          thresholds. Wire this view to secure backend endpoints with RBAC enforcement.
        </p>
        <ul>
          <li>User and role management (admins, county officials, analysts)</li>
          <li>Configure alert thresholds and severity levels</li>
          <li>View audit log summaries</li>
        </ul>
      </div>
    </>
  );
}

