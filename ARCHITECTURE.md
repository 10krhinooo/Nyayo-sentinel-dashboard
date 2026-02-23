flowchart LR
    subgraph Client[Government Users]
        A[Browser - National Admin / County Official / Analyst]
    end

    subgraph Frontend[Next.js Frontend]
        B[React UI - Dashboard / Heatmap / Topics / Alerts / Reports]
        WS[WebSocket Client]
    end

    subgraph API[Backend API Node.js Express]
        G[Auth and MFA - JWT + RBAC]
        H[Sentiment and Analytics - Aggregation Services]
        I[Alert Engine - Threshold and Spike Detection]
        J[Audit Logger]
    end

    subgraph DB[PostgreSQL Encrypted]
        K[(Users and Roles)]
        L[(Counties and Topics)]
        M[(Sentiment Events)]
        N[(Alerts and Thresholds)]
        O[(Audit Logs)]
    end

    subgraph Integrations[Secure Integrations]
        P[Email or SMS Gateway Gov Approved]
        Q[External Data Pipelines Social Call Center]
    end

    A <--> B
    B <--> WS
    B -->|REST HTTPS| G
    B -->|REST HTTPS| H
    B -->|REST HTTPS| I

    WS <--> I

    G --> K
    H --> L
    H --> M
    I --> M
    I --> N
    I --> P
    J --> O

    Q -->|ingest| H