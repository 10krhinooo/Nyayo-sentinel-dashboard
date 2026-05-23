"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { KenyaHeatmap, type HeatmapCounty } from "../../../components/KenyaHeatmap";
import { ConstituencyHeatmap, type ConstituencyData } from "../../../components/ConstituencyHeatmap";
import { SubCountyHeatmap, type SubCountyData } from "../../../components/SubCountyHeatmap";

interface HeatmapResponse { counties: HeatmapCounty[]; }
interface ConstituencyResponse { constituencies: ConstituencyData[]; }
interface SubCountyResponse { subcounties: SubCountyData[]; }

export default function HeatmapPage() {
  const user = getUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCountyOfficial = user?.role === "COUNTY_OFFICIAL";

  const [data, setData] = useState<HeatmapCounty[]>([]);
  const [constituencyData, setConstituencyData] = useState<ConstituencyData[]>([]);
  const [countyName, setCountyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subCountyData, setSubCountyData] = useState<SubCountyData[]>([]);
  const [subCountyLoading, setSubCountyLoading] = useState(false);

  // Drill-down state from URL
  const drillCountyId = searchParams.get("county");
  const drillCountyName = searchParams.get("countyName") ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<HeatmapResponse>("/counties/heatmap");
      setData(res.data.counties);

      if (isCountyOfficial && user?.countyId) {
        const county = res.data.counties.find((c) => c.countyId === user.countyId);
        if (county) setCountyName(county.countyName);
        const constRes = await api.get<ConstituencyResponse>(`/counties/${user.countyId}/constituencies/heatmap`);
        setConstituencyData(constRes.data.constituencies);
      }
    } catch {
      setError("Failed to load heatmap data.");
    } finally {
      setLoading(false);
    }
  }, [isCountyOfficial, user?.countyId]);

  useEffect(() => { void load(); }, [load]);

  // Load sub-county data when drill-down county changes via URL
  useEffect(() => {
    if (!drillCountyId) { setSubCountyData([]); return; }
    setSubCountyLoading(true);
    api.get<SubCountyResponse>(`/counties/${drillCountyId}/subcounties/heatmap`)
      .then((res) => setSubCountyData(res.data.subcounties))
      .catch(() => setSubCountyData([]))
      .finally(() => setSubCountyLoading(false));
  }, [drillCountyId]);

  function handleCountyClick(countyId: string, name: string) {
    router.push(`/heatmap?county=${countyId}&countyName=${encodeURIComponent(name)}`);
  }

  function handleBack() {
    router.push("/heatmap");
  }

  const drillDown = drillCountyId ? { countyId: drillCountyId, countyName: drillCountyName } : null;

  return (
    <>
      <h1 className="page-title">
        {drillDown
          ? `${drillDown.countyName} — Subcounties`
          : isCountyOfficial && countyName
          ? `${countyName} County Heatmap`
          : "County-Level Sentiment Heatmap"}
      </h1>

      {error && (
        <div className="retry-banner">
          <span>{error}</span>
          <button className="btn-action" onClick={() => void load()}>Retry</button>
        </div>
      )}

      {/* Constituency heatmap for county officials */}
      {isCountyOfficial && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-title">Constituency Breakdown — {countyName}</div>
          {loading ? (
            <div className="skeleton-block" style={{ height: 420 }} />
          ) : (
            <>
              <ConstituencyHeatmap countyName={countyName} data={constituencyData} />
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
                        <tr><td colSpan={4}>No constituency data available yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* National heatmap with drill-down */}
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
                onBack={handleBack}
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
                        <tr key={s.subCountyId}
                          tabIndex={0}
                          style={{ cursor: "default" }}
                        >
                          <td>{s.name}</td>
                          <td>{s.avgScore.toFixed(2)}</td>
                          <td>{Math.round(s.negativeRatio * 100)}%</td>
                          <td>{s.volume}</td>
                        </tr>
                      ))}
                    {subCountyData.length === 0 && (
                      <tr><td colSpan={4}>No subcounty data available yet.</td></tr>
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
                      <tr
                        key={c.countyId}
                        className="clickable-row"
                        tabIndex={0}
                        onClick={() => handleCountyClick(c.countyId, c.countyName)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCountyClick(c.countyId, c.countyName); } }}
                      >
                        <td>{c.countyName}</td>
                        <td>{c.avgScore.toFixed(2)}</td>
                        <td>{Math.round(c.negativeRatio * 100)}%</td>
                        <td>{c.volume}</td>
                      </tr>
                    ))}
                    {data.length === 0 && (
                      <tr><td colSpan={4}>No sentiment data available yet.</td></tr>
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
