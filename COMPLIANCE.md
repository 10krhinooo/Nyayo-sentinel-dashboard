## Compliance Outline – Kenya Data Protection Act, 2019

This document describes how the Nyayo Sentinel Dashboard is designed to support compliance with the Kenya Data Protection Act, 2019 (KDPA). It is not legal advice and should be complemented by formal legal review and organisational policies.

### 1. Data Minimisation and Purpose Limitation

- The system ingests and stores **aggregated sentiment events**, not personal data.
- `SentimentEvent` records contain:
  - County, topic, timestamp, sentiment score/label, source, and volume weight.
  - **No national ID, phone number, name, or free-text PII** is stored.
- External ingestion pipelines must strip PII before sending events to the backend API.
- Purpose of processing is limited to **public sentiment monitoring and early warning**, as documented in the README and architecture docs.

### 2. Lawful Basis and Transparency

- The deploying government entity is responsible for:
  - Determining lawful basis (e.g., public interest) for analytics on public sentiment.
  - Publishing clear privacy notices describing:
    - What data is processed (aggregated, anonymised).
    - For what purposes and under which legal basis.
    - Data subject rights and contact details for the Data Protection Officer.
- The system supports transparency by:
  - Making data models, processing flows, and access controls explicit in this repository.

### 3. Data Subject Rights

- Since no identifiable personal data is stored:
  - Data subject access, rectification, or erasure requests typically apply to upstream systems (e.g., call centres, social media pipelines).
- The dashboard should be referenced in the organisation’s internal DPIA and records of processing activities so that:
  - Its role in the data processing chain is clear.
  - Any subject-right request workflows can consider its outputs where appropriate.

### 4. Security of Processing

- **Authentication and MFA**
  - Username/password with MFA support (TOTP) for all users.
  - Short-lived JWT access tokens; refresh tokens for longer sessions.
- **RBAC**
  - `National Admin`: full national visibility and administrative settings.
  - `County Official`: access limited to their own county’s data and alerts.
  - `Analyst`: read-only analytics across authorised scope.
  - RBAC is enforced at the API layer and reflected in the UI.
- **Encryption**
  - All traffic is designed to run over HTTPS/TLS in production.
  - PostgreSQL stored on encrypted volumes; option for column-level encryption.
- **Network Security**
  - Backend and database are only accessible on private networks.
  - Optional air-gapped deployment for high-security environments.

### 5. Access Control and Audit Logging

- All sensitive endpoints are protected by authentication middleware.
- Role-based restrictions ensure users can only see data within their mandate (e.g., county scoping).
- Comprehensive audit logging:
  - Login/logout attempts and MFA setup.
  - Dashboard, heatmap, topics, alerts, and report export actions.
  - Admin changes such as alert threshold updates.
- Audit logs are designed as append-only records in the database and can be exported to WORM storage if required by policy.

### 6. Data Retention and Deletion

- Retention policies for sentiment events, alerts, and audit logs should be defined by the deploying organisation.
- The system can support:
  - Scheduled deletion or aggregation (e.g., beyond a certain age).
  - Export of historical data to cold storage prior to deletion.

### 7. Air-Gapped / High-Security Deployment

- All components (frontend, backend, database) are containerised and can run entirely inside an isolated network with:
  - No outbound internet connectivity.
  - Local/on-premise gateways for SMS/Email notifications.
- Dependencies and Docker images should be vetted and mirrored into an internal registry before deployment.

### 8. Operational and Organisational Measures

- To complete KDPA compliance, the deploying organisation should:
  - Perform a Data Protection Impact Assessment (DPIA) covering upstream data sources and the dashboard.
  - Define and document:
    - User provisioning and deprovisioning processes.
    - Incident response and breach notification procedures.
    - Training for officials who will access the dashboard.
  - Maintain records of processing activities referencing Nyayo Sentinel as a system component.

