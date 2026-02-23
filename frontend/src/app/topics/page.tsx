"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

type SentimentLabel = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

interface TopicSummary {
  topicId: string;
  name: string;
  counts: Record<SentimentLabel, number>;
  total: number;
}

interface TopicsResponse {
  topics: TopicSummary[];
}

export default function TopicsPage() {
  const [data, setData] = useState<TopicSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<TopicsResponse>("/topics/summary");
        setData(res.data.topics);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to load topics", err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const chartData = data.map((t) => ({
    name: t.name,
    Positive: t.counts.POSITIVE,
    Neutral: t.counts.NEUTRAL,
    Negative: t.counts.NEGATIVE
  }));

  return (
    <>
      <h1 className="page-title">Topic Analysis</h1>
      <div className="two-column">
        <div className="card">
          <p className="card-subtitle">
            Topic sentiment distribution across Positive, Neutral, and Negative categories.
          </p>
          {loading && <div>Loading topics...</div>}
          {!loading && (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Positive" stackId="a" fill="#2f855a" />
                  <Bar dataKey="Neutral" stackId="a" fill="#718096" />
                  <Bar dataKey="Negative" stackId="a" fill="#c53030" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <p className="card-subtitle">Detailed topic counts by sentiment label.</p>
          {loading && <div>Loading topics...</div>}
          {!loading && (
            <table className="table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Positive</th>
                  <th>Neutral</th>
                  <th>Negative</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.topicId}>
                    <td>{t.name}</td>
                    <td>{t.counts.POSITIVE}</td>
                    <td>{t.counts.NEUTRAL}</td>
                    <td>{t.counts.NEGATIVE}</td>
                    <td>{t.total}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={5}>No topic data available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

