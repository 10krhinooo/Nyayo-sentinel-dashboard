"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { KenyaHeatmap, type HeatmapCounty } from "../../../components/KenyaHeatmap";
import { ConstituencyHeatmap, type ConstituencyData } from "../../../components/ConstituencyHeatmap";
import { SubCountyHeatmap, type SubCountyData } from "../../../components/SubCountyHeatmap";

interface HeatmapResponse {
  counties: HeatmapCounty[];
}

interface ConstituencyResponse {
  constituencies: ConstituencyData[];
}

interface SubCountyResponse {
  subcounties: SubCountyData[];
}

export default function HeatmapPage() {
  const user = getUser();
  const isCountyOfficial = user?.role === "COUNTY_OFFICIAL";

  const [data, setData] = useState<HeatmapCounty[]>([]);
  const [constituencyData, setConstituencyData] = useState<ConstituencyData[]>([]);
  const [countyName, setCountyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<{ countyId: string; countyName: string } | null>(null);
  const [subCountyData, setSubCountyData] = useState<SubCountyData[]>([]);
  const [subCountyLoading, setSubCountyLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<HeatmapResponse>("/counties/heatmap");
        setData(res.data.counties);

        if (isCountyOfficial && user?.countyId) {
          // Find the county name from the heatmap data
          const county = res.data.counties.find((c) => c.countyId === user.countyId);
          if (county) setCountyName(county.countyName);

          const constRes = await api.get<ConstituencyResponse>(
            `/counties/${user.countyId}/constituencies/heatmap`
          );
          setConstituencyData(constRes.data.constituencies);
        }
      } catch {
        setError("Failed to load heatmap data. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCountyClick(countyId: string, name: string) {
    setDrillDown({ countyId, countyName: name });
    setSubCountyLoading(true);
    try {
      const res = await api.get<SubCountyResponse>(`/counties/${countyId}/subcounties/heatmap`);
      setSubCountyData(res.data.subcounties);
    } catch {
      setSubCountyData([]);
    } finally {
      setSubCountyLoading(false);
    }
  }

  return (
    <>
      <h1 className="page-title">
        {drillDown
          ? `${drillDown.countyName} — Subcounties`
          : isCountyOfficial && countyName
          ? `${countyName} County Heatmap`
          : "County-Level Sentiment Heatmap"}
      </h1>

      {error && <div className="error-banner">{error}</div>}

      {/* Constituency heatmap for county officials */}
      {isCountyOfficial && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-title">Constituency Breakdown — {countyName}</div>
          {loading ? (
            <div className="skeleton-block" style={{ height: 420 }} />
          ) : (
            <>
              <ConstituencyHeatmap
                countyName={countyName}
                data={constituencyData}
              />
              <div style={{ marginTop: "1rem" }}>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Constituency</th>
                        <th>Sentiment Score</th>
                        <th>Negative Share</th>
                        <th>Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {constituencyData
                        .sort((a, b) => b.negativeRatio - a.negativeRatio)
                        .map((c) => (
                          <tr key={c.constituencyId}>
                            <td>{c.name}</td>
                            <td>{c.avgScore.toFixed(2)}</td>
                            <td>{Math.round(c.negativeRatio * 100)}%</td>
                            <td>{c.volume}</td>
                          </tr>
                        ))}
                      {constituencyData.length === 0 && (
                        <tr>
                          <td colSpan={4}>No constituency data available yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* National heatmap — zoomed to county for county officials, with subcounty drill-down */}
      <div className="card">
        <div className="card-title">
          {drillDown
            ? `${drillDown.countyName} — Subcounty View`
            : isCountyOfficial && countyName
            ? `${countyName} — County Map View`
            : "Kenya — Click a county to see its subcounties"}
        </div>
        {loading ? (
          <>
            <div className="skeleton-block" style={{ height: 400, marginBottom: "1rem" }} />
            <div className="skeleton-block" style={{ height: 120 }} />
          </>
        ) : drillDown ? (
          <>
            {subCountyLoading ? (
              <div className="skeleton-block" style={{ height: 400, marginBottom: "1rem" }} />
            ) : (
              <SubCountyHeatmap
                countyName={drillDown.countyName}
                data={subCountyData}
                onBack={() => { setDrillDown(null); setSubCountyData([]); }}
              />
            )}
            <div style={{ marginTop: "1rem" }}>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Subcounty</th>
                      <th>Sentiment Score</th>
                      <th>Negative Share</th>
                      <th>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subCountyData
                      .sort((a, b) => b.negativeRatio - a.negativeRatio)
                      .map((s) => (
                        <tr key={s.subCountyId}>
                          <td>{s.name}</td>
                          <td>{s.avgScore.toFixed(2)}</td>
                          <td>{Math.round(s.negativeRatio * 100)}%</td>
                          <td>{s.volume}</td>
                        </tr>
                      ))}
                    {subCountyData.length === 0 && (
                      <tr>
                        <td colSpan={4}>No subcounty data available yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            <KenyaHeatmap
              data={data}
              zoomToCounty={isCountyOfficial ? countyName : undefined}
              onCountyClick={handleCountyClick}
            />
            <div style={{ marginTop: "1rem" }}>
              <div className="table-wrapper">
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
            </div>
          </>
        )}
      </div>
    </>
  );
}
