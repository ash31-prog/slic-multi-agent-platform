"use client";

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const COLORS = ["#7FE7C4", "#FFB86B", "#FF8FA3", "#9096A8", "#5FD1E5"];

export default function ChartRenderer({ spec }: { spec: any }) {
  if (!spec) return null;
  const { type, xKey, yKey, title, data } = spec;

  return (
    <div className="mt-3 rounded-xl border border-line bg-panel2 p-4 animate-rise">
      {title && <p className="mb-2 font-display text-sm text-muted">{title}</p>}
      <ResponsiveContainer width="100%" height={220}>
        {type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid stroke="#2C2F3D" strokeDasharray="3 3" />
            <XAxis dataKey={xKey} stroke="#9096A8" fontSize={11} />
            <YAxis stroke="#9096A8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#1C1E29", border: "1px solid #2C2F3D", fontSize: 12 }} />
            <Line type="monotone" dataKey={yKey} stroke="#7FE7C4" strokeWidth={2} dot={false} />
          </LineChart>
        ) : type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey={yKey} nameKey={xKey} outerRadius={80}>
              {data.map((_: any, i: number) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "#1C1E29", border: "1px solid #2C2F3D", fontSize: 12 }} />
          </PieChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid stroke="#2C2F3D" strokeDasharray="3 3" />
            <XAxis dataKey={xKey} stroke="#9096A8" fontSize={11} />
            <YAxis stroke="#9096A8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#1C1E29", border: "1px solid #2C2F3D", fontSize: 12 }} />
            <Bar dataKey={yKey} fill="#7FE7C4" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
