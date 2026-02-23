## System Architecture

### Logical View

```mermaid
flowchart LR
    subgraph Client[Government Users]
        A[Browser\n(National Admin / County Official / Analyst)]
    end

    subgraph Frontend[Next.js Frontend]
        B[React UI\nDashboard / Heatmap / Topics / Alerts / Reports]
        WS[WebSocket Client]
    end

    subgraph API[Backend API (Node.js/Express)]
        G[Auth & MFA\nJWT + RBAC]
        H[Sentiment & Analytics\nAggregation Services]
        I[Alert Engine\nThreshold & Spike Detection]
        J[Audit Logger]
    end

    subgraph DB[PostgreSQL (Encrypted)]
        K[(Users & Roles)]
        L[(Counties & Topics)]
        M[(Sentiment Events)]
        N[(Alerts & Thresholds)]
        O[(Audit Logs)]
    end

    subgraph Integrations[Secure Integrations]
        P[Email/SMS Gateway\n(Gov-approved)]
        Q[External Data Pipelines\n(Social, Call Center, etc.)]
    end

    A <--> B
    B <--> WS
    B -->|REST/HTTPS| G
    B -->|REST/HTTPS| H
    B -->|REST/HTTPS| I

    WS <--> I

    G --> K
    H --> L
    H --> M
    I --> M
    I --> N
    I --> P
    J --> O

    Q -->|ingest| H
```

### Deployment View

- **Frontend**
  - Next.js app served behind a government HTTPS reverse proxy or load balancer.
  - Deployed as a Docker container (`frontend` service) on an internal Kubernetes cluster or VM.

- **Backend API**
  - Node.js + Express + Socket.io (`backend` service).
  - Exposes `/api/*` endpoints and WebSocket endpoint.
  - Talks to PostgreSQL over a private network only.
  - All external notifications (Email/SMS) go through vetted, on-premise gateways.

- **Database**
  - PostgreSQL (`postgres` service) with encrypted volumes.
  - Optional column-level encryption for sensitive configuration and secrets.
  - No PII in sentiment events, alerts, or analytics tables.

- **Security Controls**
  - TLS termination at the reverse proxy.
  - Network security groups/firewalls limiting access to API and DB.
  - Optional air-gapped deployment with no outbound internet access.

