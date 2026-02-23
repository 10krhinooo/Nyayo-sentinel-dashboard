 "use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { KenyaHeatmap, type HeatmapCounty } from "../../components/KenyaHeatmap";

interface HeatmapResponse {
  counties: HeatmapCounty[];
}

export default function HeatmapPage() {
  const [data, setData] = useState<HeatmapCounty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<HeatmapResponse>("/counties/heatmap");
        setData(res.data.counties);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to load heatmap", err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <>
      <h1 className="page-title">County-Level Sentiment Heatmap</h1>
      <div className="card">
        {loading && <div>Loading heatmap...</div>}
        {!loading && (
          <>
            <KenyaHeatmap data={data} />
            <div style={{ marginTop: "1rem" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>County</th>
                    <th>Sentiment Score</th>
                    <th>Negative Share</th>
                    <th>Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.countyId}>
                      <td>{c.countyName}</td>
                      <td>{c.avgScore.toFixed(2)}</td>
                      <td>{Math.round(c.negativeRatio * 100)}%</td>
                      <td>{c.volume}</td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={4}>No sentiment data available yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

