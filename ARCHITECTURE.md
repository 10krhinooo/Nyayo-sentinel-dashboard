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
        LLM[LLM Service - Claude Haiku Alert Summaries]
    end

    subgraph DB[PostgreSQL Encrypted]
        K[(Users and Roles)]
        L[(Counties and Topics)]
        M[(Sentiment Events + Headlines)]
        N[(Alerts + AI Summaries)]
        O[(Audit Logs)]
    end

    subgraph Integrations[Secure Integrations]
        P[Email Gateway - Gmail SMTP]
        Q[External Data Pipelines - RSS / Reddit / Facebook / Instagram]
        R[Anthropic Claude API]
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
    I --> LLM
    LLM -->|generateAlertSummary| R
    LLM --> N
    I --> P
    J --> O

    Q -->|ingest with headlines| H
