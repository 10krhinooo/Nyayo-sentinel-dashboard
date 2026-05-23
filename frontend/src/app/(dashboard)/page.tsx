"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { api, type SentimentOverview } from "../../lib/api";
import { getUser } from "../../lib/auth";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

const PIE_COLORS = ["#2f855a", "#718096", "#c53030"];

interface Kpis {
  eventsToday: number;
  eventsYesterday: number;
  openAlerts: number;
  countiesAtRisk: number;
  mostActiveCounty: string | null;
  countiesWithData: number;
}

interface DashboardData extends SentimentOverview {
  kpis: Kpis | null;
}

function DeltaBadge({ today, yesterday }: { today: number; yesterday: number }) {
  if (yesterday === 0) return null;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return <span className="card-delta card-delta-flat">— flat</span>;
  return pct > 0
    ? <span className="card-delta card-delta-up">↑ {pct}% vs yesterday</span>
    : <span className="card-delta card-delta-down">↓ {Math.abs(pct)}% vs yesterday</span>;
}

export default function DashboardPage() {
  const user = getUser();
  const isAdmin = user?.role === "NATIONAL_ADMIN" || user?.role === "ANALYST";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DashboardData>("/dashboard/overview");
      setData(res.data);
    } catch {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Fetch AI briefing for admins/analysts once data is loaded
  useEffect(() => {
    if (!isAdmin || !data) return;
    setBriefingLoading(true);
    api.get<{ briefing: string | null }>("/dashboard/briefing")
      .then((res) => setBriefing(res.data.briefing))
      .catch(() => setBriefing(null))
      .finally(() => setBriefingLoading(false));
  }, [isAdmin, data]);

  const trendData = useMemo(
    () => data?.trendByDay.map((d) => ({ day: d.day, score: d.avg_score })) ?? [],
    [data]
  );

  const pieData = useMemo(
    () => data == null ? [] : [
      { name: "Positive", value: data.distribution.positive },
      { name: "Neutral",  value: data.distribution.neutral  },
      { name: "Negative", value: data.distribution.negative }
    ],
    [data]
  );

  const kpis = data?.kpis ?? null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <Image src="/gok-emblem.png" alt="Government of Kenya emblem" width={64} height={64} />
        <div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0B3D91" }}>
            Nyayo Sentinel Dashboard
          </div>
          <div className="card-subtitle">Republic of Kenya – Early Warning System</div>
        </div>
      </div>
      <h1 className="page-title">National Sentiment Overview</h1>

      {error && (
        <div className="retry-banner">
          <span>{error}</span>
          <button className="btn-action" onClick={() => void load()}>Retry</button>
        </div>
      )}

      {loading && (
        <div>
          <div className="skeleton-block" style={{ height: 100, marginBottom: "1rem" }} />
          <div className="skeleton-block" style={{ height: 260 }} />
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Admin KPI row ──────────────────────────────────────────────── */}
          {isAdmin && kpis && (
            <section className="card-grid" style={{ marginBottom: "0.25rem" }}>
              <div className="card">
                <div className="card-title">Events Today</div>
                <div className="card-value">{kpis.eventsToday.toLocaleString()}</div>
                <div className="card-subtitle">
                  <DeltaBadge today={kpis.eventsToday} yesterday={kpis.eventsYesterday} />
                </div>
              </div>
              <div className={`card${kpis.openAlerts > 0 ? " card-kpi-danger" : ""}`}>
                <div className="card-title">Open Alerts</div>
                <div className="card-value">{kpis.openAlerts}</div>
                <div className="card-subtitle">Require attention</div>
              </div>
              <div className={`card${kpis.countiesAtRisk > 5 ? " card-kpi-warning" : ""}`}>
                <div className="card-title">Counties at Risk</div>
                <div className="card-value">{kpis.countiesAtRisk}</div>
                <div className="card-subtitle">{">"} 40% negative in last 24h</div>
              </div>
              <div className="card">
                <div className="card-title">Most Active County</div>
                <div className="card-value" style={{ fontSize: "1.1rem" }}>{kpis.mostActiveCounty ?? "—"}</div>
                <div className="card-subtitle">Highest event volume today</div>
              </div>
              <div className="card">
                <div className="card-title">Counties Reporting</div>
                <div className="card-value">{kpis.countiesWithData} <span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--color-muted)" }}>/ 47</span></div>
                <div className="card-subtitle">With data in last 24h</div>
              </div>
            </section>
          )}

          {/* ── AI Daily Briefing ──────────────────────────────────────────── */}
          {isAdmin && (
            <div className="ai-briefing">
              <div className="ai-briefing-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                AI Daily Briefing
              </div>
              {briefingLoading && <div className="skeleton-block" style={{ height: 56, borderRadius: 6 }} />}
              {!briefingLoading && briefing && <p style={{ margin: 0 }}>{briefing}</p>}
              {!briefingLoading && !briefing && (
                <p style={{ margin: 0, color: "var(--color-muted)", fontStyle: "italic" }}>
                  Briefing unavailable — set OPENAI_API_KEY to enable AI summaries.
                </p>
              )}
            </div>
          )}

          {/* ── Sentiment distribution cards ──────────────────────────────── */}
          <section className="card-grid">
            <div className="card">
              <div className="card-title">Positive</div>
              <div className="card-value card-kpi-success" style={{ color: "var(--color-success)" }}>{data.distribution.positive}%</div>
              <div className="card-subtitle">Share of all sentiment events</div>
            </div>
            <div className="card">
              <div className="card-title">Neutral</div>
              <div className="card-value">{data.distribution.neutral}%</div>
              <div className="card-subtitle">Share of all sentiment events</div>
            </div>
            <div className="card">
              <div className="card-title">Negative</div>
              <div className="card-value" style={{ color: "var(--color-danger)" }}>{data.distribution.negative}%</div>
              <div className="card-subtitle">Share of all sentiment events</div>
            </div>
            <div className="card">
              <div className="card-title">Sentiment Score</div>
              <div className="card-value" style={{ color: data.sentimentScore < -0.1 ? "var(--color-danger)" : data.sentimentScore > 0.1 ? "var(--color-success)" : "var(--color-text)" }}>
                {data.sentimentScore.toFixed(2)}
              </div>
              <div className="card-subtitle">Rolling avg (−1 very negative → +1 very positive)</div>
            </div>
            <div className="card">
              <div className="card-title">Sentiment Distribution</div>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} label>
                      {pieData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ── Trend + Topics ─────────────────────────────────────────────── */}
          <section className="two-column">
            <div className="card">
              <div className="card-title">Sentiment Trend (last 7 days)</div>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#0b3d91" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Top Emerging Negative Topics</div>
              <div className="card-subtitle" style={{ marginBottom: "0.5rem" }}>Topics with the most negative events in the last 7 days</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Negative Events</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topEmergingTopics.map((t) => (
                    <tr key={t.topicId}>
                      <td>{t.name}</td>
                      <td>{t.negativeCount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.topEmergingTopics.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ color: "var(--color-muted)" }}>No negative topics detected in the last 7 days.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
