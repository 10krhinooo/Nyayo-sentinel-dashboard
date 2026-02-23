flowchart LR
    subgraph Client[Government Users]
        A[Browser<br/>(National Admin / County Official / Analyst)]
    end

    subgraph Frontend[Next.js Frontend]
        B[React UI<br/>Dashboard / Heatmap / Topics / Alerts / Reports]
        WS[WebSocket Client]
    end

    subgraph API[Backend API (Node.js/Express)]
        G[Auth & MFA<br/>JWT + RBAC]
        H[Sentiment & Analytics<br/>Aggregation Services]
        I[Alert Engine<br/>Threshold & Spike Detection]
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
        P[Email/SMS Gateway<br/>(Gov-approved)]
        Q[External Data Pipelines<br/>(Social, Call Center, etc.)]
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