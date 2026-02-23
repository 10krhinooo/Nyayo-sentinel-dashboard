 "use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api, type SentimentOverview } from "../lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

export default function DashboardPage() {
  const [data, setData] = useState<SentimentOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<SentimentOverview>("/dashboard/overview");
        setData(res.data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to load dashboard", err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const trendData =
    data?.trendByDay.map((d) => ({
      day: d.day,
      score: d.avg_score
    })) ?? [];

  const pieData =
    data == null
      ? []
      : [
          { name: "Positive", value: data.distribution.positive },
          { name: "Neutral", value: data.distribution.neutral },
          { name: "Negative", value: data.distribution.negative }
        ];

  const PIE_COLORS = ["#2f855a", "#718096", "#c53030"];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <Image
          src="/gok-emblem.png"
          alt="Government of Kenya emblem"
          width={64}
          height={64}
        />
        <div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0B3D91" }}>
            Nyayo Sentinel Dashboard
          </div>
          <div className="card-subtitle">Republic of Kenya – Early Warning System</div>
        </div>
      </div>
      <h1 className="page-title">National Sentiment Overview</h1>
      {loading && <div>Loading dashboard...</div>}
      {!loading && data && (
        <>
          <section className="card-grid">
            <div className="card">
              <div className="card-title">Positive</div>
              <div className="card-value">{data.distribution.positive}%</div>
              <div className="card-subtitle">Share of sentiment events</div>
            </div>
            <div className="card">
              <div className="card-title">Neutral</div>
              <div className="card-value">{data.distribution.neutral}%</div>
              <div className="card-subtitle">Share of sentiment events</div>
            </div>
            <div className="card">
              <div className="card-title">Negative</div>
              <div className="card-value">{data.distribution.negative}%</div>
              <div className="card-subtitle">Share of sentiment events</div>
            </div>
            <div className="card">
              <div className="card-title">Real-time Sentiment Score</div>
              <div className="card-value">{data.sentimentScore.toFixed(2)}</div>
              <div className="card-subtitle">Rolling average across recent events</div>
            </div>
            <div className="card">
              <div className="card-title">Sentiment Distribution</div>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={50}
                      label
                    >
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

          <section className="two-column">
            <div className="card">
              <div className="card-title">Sentiment Trend (last 7 days)</div>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#0b3d91"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Top Emerging Negative Topics</div>
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
                      <td>{t.negativeCount}</td>
                    </tr>
                  ))}
                  {data.topEmergingTopics.length === 0 && (
                    <tr>
                      <td colSpan={2}>No emerging topics detected.</td>
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

