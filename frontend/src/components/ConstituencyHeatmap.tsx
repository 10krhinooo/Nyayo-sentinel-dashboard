"use client";

import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine,
} from "recharts";

export interface ConstituencyData {
  constituencyId: string;
  name: string;
  avgScore: number;
  negativeRatio: number;
  volume: number;
}

interface Props {
  countyName: string;
  data: ConstituencyData[];
}

function negRatioColor(ratio: number) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const start = { r: 251, g: 146, b: 60 };   // orange-400
  const end   = { r: 185, g:  28, b:  28 };   // red-700
  const r = Math.round(start.r + (end.r - start.r) * clamped);
  const g = Math.round(start.g + (end.g - start.g) * clamped);
  const b = Math.round(start.b + (end.b - start.b) * clamped);
  return `rgb(${r},${g},${b})`;
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: ConstituencyData }[];
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.6rem 0.9rem", fontSize: "0.8rem", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div>Negative: <strong>{Math.round(d.negativeRatio * 100)}%</strong></div>
      <div>Avg score: <strong>{d.avgScore.toFixed(2)}</strong></div>
      <div>Reports: <strong>{d.volume}</strong></div>
    </div>
  );
}

export const ConstituencyHeatmap: React.FC<Props> = ({ countyName, data }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.negativeRatio - a.negativeRatio),
    [data]
  );

  if (data.length === 0) {
    return (
      <div style={{ color: "var(--color-muted)", padding: "1.5rem 0", textAlign: "center", fontSize: "0.875rem" }}>
        No constituency data available for {countyName} yet.
      </div>
    );
  }

  const avgNeg = data.reduce((s, d) => s + d.negativeRatio, 0) / data.length;

  return (
    <div>
      <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "var(--color-muted)" }}>
        Negative sentiment by constituency — bars sorted highest to lowest. Average: <strong>{Math.round(avgNeg * 100)}%</strong>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(220, sorted.length * 28)}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 4, right: 40, bottom: 4, left: 100 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            fontSize={11}
            tick={{ fill: "var(--color-muted)" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            fontSize={11}
            tick={{ fill: "var(--color-text)" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={avgNeg} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: "avg", position: "top", fontSize: 10, fill: "#94a3b8" }} />
          <Bar dataKey="negativeRatio" radius={[0, 3, 3, 0]}>
            {sorted.map((entry) => (
              <Cell key={entry.constituencyId} fill={negRatioColor(entry.negativeRatio)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
