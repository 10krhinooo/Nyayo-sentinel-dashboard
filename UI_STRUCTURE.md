## UI Structure

### Global Layout

- **Sidebar navigation**
  - `Dashboard` (`/`)
  - `Heatmap` (`/heatmap`)
  - `Topics` (`/topics`)
  - `Alerts` (`/alerts`)
  - `Reports` (`/reports`)
  - `Admin` (`/admin`)
- **Topbar**
  - Shows current user role (Admin / County Official / Analyst).
  - Quick view of active alerts or notifications.

### Pages and Components

- **Dashboard (`/`)**
  - **Cards**
    - National sentiment distribution (positive / neutral / negative).
    - Real-time sentiment score (rolling window).
  - **Trend Chart**
    - Line chart of average sentiment score over recent days.
  - **Emerging Topics Table**
    - Top negative topics with counts.

- **Heatmap (`/heatmap`)**
  - County-level sentiment table (placeholder for SVG map).
  - Columns: County, Sentiment Score, Negative Share, Volume.
  - For County Officials, scoped to their own county only.

- **Topics (`/topics`)**
  - Topic sentiment breakdown table.
  - Columns: Topic, Positive, Neutral, Negative, Total.
  - Future enhancements:
    - Filters for county, date range, topic, sentiment level.
    - Bar/pie charts for topic distribution.

- **Alerts (`/alerts`)**
  - Alerts table with:
    - Triggered time, county, topic, severity, type (Threshold/Spike), status, summary.
  - Live updates via WebSocket:
    - New alerts pushed in real time to this view.

- **Reports (`/reports`)**
  - Download links:
    - Weekly Sentiment Summary (CSV).
    - County Comparison (CSV).
  - Future enhancements:
    - On-demand PDF generation and scheduling (weekly/monthly).

- **Admin (`/admin`)**
  - Placeholder for:
    - User and role management (National Admin, County Official, Analyst).
    - Alert threshold configuration.
    - Audit log views.

