"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

export interface SubCountyData {
  subCountyId: string;
  name: string;
  avgScore: number;
  negativeRatio: number;
  volume: number;
}

interface Props {
  countyName: string;
  data: SubCountyData[];
  onBack: () => void;
}

const subGeoUrl = "/geo/kenya-subcounties.geojson";

// GADM NAME_1 values that differ from DB county names
const DB_TO_GADM: Record<string, string> = {
  "Homa Bay": "HomaBay",
  "Taita-Taveta": "TaitaTaveta",
  "Tana River": "TanaRiver",
  "Trans-Nzoia": "TransNzoia",
  "Uasin Gishu": "UasinGishu",
  "West Pokot": "WestPokot",
};

interface ProjConfig { center: [number, number]; scale: number; }

const KENYA_SCALE = 2500;
const KENYA_SPAN_DEG = 14;

function computeBboxFromFeatures(features: GeoJSON.Feature[]): ProjConfig {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const feat of features) {
    const geom = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const rings: GeoJSON.Position[][] =
      geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  const center: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  const span = Math.max(maxLon - minLon, maxLat - minLat, 0.05);
  const scale = Math.round(KENYA_SCALE * (KENYA_SPAN_DEG / span) * 0.75);
  return { center, scale };
}

function colorForNegativeRatio(ratio: number) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const start = { r: 255, g: 205, b: 200 };
  const end = { r: 139, g: 0, b: 0 };
  const r = Math.round(start.r + (end.r - start.r) * clamped);
  const g = Math.round(start.g + (end.g - start.g) * clamped);
  const b = Math.round(start.b + (end.b - start.b) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export const SubCountyHeatmap: React.FC<Props> = ({ countyName, data, onBack }) => {
  const [projConfig, setProjConfig] = useState<ProjConfig>({
    center: [37.9062, -0.0236],
    scale: KENYA_SCALE,
  });

  // The GADM NAME_1 value for this county
  const gadmName = DB_TO_GADM[countyName] ?? countyName;

  useEffect(() => {
    fetch(subGeoUrl)
      .then((r) => r.json())
      .then((geo: GeoJSON.FeatureCollection) => {
        const features = geo.features.filter(
          (f) => f.properties?.NAME_1 === gadmName
        );
        if (features.length > 0) setProjConfig(computeBboxFromFeatures(features));
      })
      .catch(() => {});
  }, [gadmName]);

  // Map subcounty display name → data (case-insensitive)
  const subCountyMap = useMemo(() => {
    const map = new Map<string, SubCountyData>();
    data.forEach((s) => map.set(s.name.toUpperCase().trim(), s));
    return map;
  }, [data]);

  // Normalise GADM NAME_2 (CamelCase) to display name with spaces
  function toDisplayName(name2: string): string {
    return name2.replace(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g, " ");
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          marginBottom: "1rem",
          padding: "0.4rem 1rem",
          background: "var(--color-surface, #f8fafc)",
          border: "1px solid var(--color-border, #e2e8f0)",
          borderRadius: "0.5rem",
          cursor: "pointer",
          fontSize: "0.875rem",
          color: "var(--color-text, #1e293b)",
        }}
      >
        ← Back to national view
      </button>

      <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={projConfig}
            style={{
              width: "100%",
              height: "auto",
              background: "#f8fafc",
              borderRadius: "0.75rem",
              border: "1px solid #e2e8f0",
            }}
          >
            <Geographies geography={subGeoUrl}>
              {({ geographies }) =>
                geographies
                  .filter((geo) => geo.properties.NAME_1 === gadmName)
                  .map((geo) => {
                    const displayName = toDisplayName(geo.properties.NAME_2 as string ?? "");
                    const subData = subCountyMap.get(displayName.toUpperCase().trim());

                    const fillColor = subData
                      ? colorForNegativeRatio(subData.negativeRatio)
                      : "#e2e8f0";

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fillColor}
                        stroke="#ffffff"
                        strokeWidth={0.5}
                        style={{
                          default: { outline: "none" },
                          hover: {
                            fill: subData ? "#ff4d4d" : "#d1d5db",
                            outline: "none",
                          },
                          pressed: { outline: "none" },
                        }}
                      >
                        <title>
                          {subData
                            ? `${displayName}\nSentiment score: ${subData.avgScore.toFixed(2)}\nNegative share: ${Math.round(subData.negativeRatio * 100)}%\nReports: ${subData.volume}`
                            : `${displayName} (no data)`}
                        </title>
                      </Geography>
                    );
                  })
              }
            </Geographies>
          </ComposableMap>
        </div>

        {/* Legend */}
        <div style={{ fontSize: "0.9rem" }}>
          <div style={{ marginBottom: "0.75rem", fontWeight: 600 }}>Legend</div>
          {[0.1, 0.5, 0.9].map((v, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: colorForNegativeRatio(v),
                  display: "inline-block",
                }}
              />
              <span>
                {v < 0.3
                  ? "Low negative sentiment"
                  : v < 0.7
                  ? "Moderate negative sentiment"
                  : "High negative sentiment"}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.5rem",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: "#e2e8f0",
                display: "inline-block",
              }}
            />
            <span>No data</span>
          </div>
        </div>
      </div>
    </div>
  );
};
