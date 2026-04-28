"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

export interface HeatmapCounty {
  countyId: string;
  countyName: string;
  avgScore: number;
  negativeRatio: number;
  volume: number;
}

interface Props {
  data: HeatmapCounty[];
  zoomToCounty?: string;
  onCountyClick?: (countyId: string, countyName: string) => void;
}

const geoUrl = "/geo/kenya-counties.geojson";
const KENYA_SCALE = 2500;
const KENYA_SPAN_DEG = 14;

interface ProjConfig { center: [number, number]; scale: number; }

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

// Red color gradient for negative sentiment
function colorForNegativeRatio(ratio: number) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const start = { r: 255, g: 205, b: 200 }; // light red
  const end = { r: 139, g: 0, b: 0 }; // dark red
  const r = Math.round(start.r + (end.r - start.r) * clamped);
  const g = Math.round(start.g + (end.g - start.g) * clamped);
  const b = Math.round(start.b + (end.b - start.b) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export const KenyaHeatmap: React.FC<Props> = ({ data, zoomToCounty, onCountyClick }) => {
  const [projConfig, setProjConfig] = useState<ProjConfig>({
    center: [37.9062, -0.0236],
    scale: KENYA_SCALE,
  });

  useEffect(() => {
    if (!zoomToCounty) {
      setProjConfig({ center: [37.9062, -0.0236], scale: KENYA_SCALE });
      return;
    }
    fetch(geoUrl)
      .then((r) => r.json())
      .then((geo: GeoJSON.FeatureCollection) => {
        const features = geo.features.filter(
          (f) =>
            (f.properties?.COUNTY_NAM as string)?.toUpperCase() ===
            zoomToCounty.toUpperCase()
        );
        if (features.length > 0) setProjConfig(computeBboxFromFeatures(features));
      })
      .catch(() => {});
  }, [zoomToCounty]);

  const countyMap = useMemo(() => {
    const map = new Map<string, HeatmapCounty>();
    data.forEach((county) => {
      map.set(county.countyName.toUpperCase().trim(), county);
    });
    return map;
  }, [data]);

  return (
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
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const countyName = geo.properties.COUNTY_NAM || "";
                const countyData = countyMap.get(countyName.toUpperCase().trim());

                const fillColor = countyData
                  ? colorForNegativeRatio(countyData.negativeRatio)
                  : "#ffffff"; // white for counties with no data

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillColor}
                    stroke="#ffffff"
                    strokeWidth={0.5}
                    onClick={() => {
                      if (countyData && onCountyClick)
                        onCountyClick(countyData.countyId, countyData.countyName);
                    }}
                    style={{
                      default: { outline: "none", cursor: countyData && onCountyClick ? "pointer" : "default" },
                      hover: {
                        fill: countyData ? "#ff4d4d" : "#f0f0f0",
                        outline: "none",
                        cursor: countyData && onCountyClick ? "pointer" : "default",
                      },
                      pressed: { outline: "none" },
                    }}
                  >
                    <title>
                      {countyData
                        ? `${countyName}
Sentiment score: ${countyData.avgScore.toFixed(2)}
Negative share: ${Math.round(countyData.negativeRatio * 100)}%
Reports: ${countyData.volume}`
                        : `${countyName} (no data)`}
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
      </div>
    </div>
  );
};