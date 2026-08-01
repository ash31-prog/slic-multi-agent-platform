"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  Background, Controls, Node, Edge, Handle, Position, MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { getBrowserSupabase } from "@/lib/supabase";
import { useSlicStore } from "@/lib/store";

const AGENT_COLOR: Record<string, string> = {
  router: "#FFB86B",
  sql: "#7FE7C4",
  stats: "#7FE7C4",
  viz: "#5FD1E5",
  doc: "#FF8FA3",
  summary: "#F2F3F5",
};

function TraceCard({ data }: { data: any }) {
  const color = AGENT_COLOR[data.agent_id] ?? "#9096A8";
  return (
    <div
      className="w-64 rounded-lg border bg-panel px-3 py-2.5 shadow-card"
      style={{ borderColor: `${color}55` }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color, border: "none" }} />
      <div className="mb-1 flex items-center justify-between">
        <span
          className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
          style={{ color, background: `${color}1A` }}
        >
          {data.agent_id}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${data.status === "running" ? "animate-pulseline" : ""}`} style={{ background: data.status === "error" ? "#FF8FA3" : color }} />
      </div>
      <p className="font-display text-xs text-paper">{data.step}</p>
      {data.output && (
        <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted">{data.output}</p>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color, border: "none" }} />
    </div>
  );
}

const nodeTypes = { trace: TraceCard };

export default function EvidenceBoard() {
  const sessionId = useSlicStore((s) => s.sessionId);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const columnCounters = useRef<Record<string, number>>({});

  const upsertNode = useCallback((row: any) => {
    setNodes((prev) => {
      const existing = prev.find((n) => n.id === row.id);
      if (existing) {
        return prev.map((n) => (n.id === row.id ? { ...n, data: { ...row } } : n));
      }
      const col = row.parent_step_id ? 1 : 0;
      const rowIndex = columnCounters.current[col] ?? 0;
      columnCounters.current[col] = rowIndex + 1;
      const newNode: Node = {
        id: row.id,
        type: "trace",
        position: { x: col * 300, y: rowIndex * 110 },
        data: { ...row },
      };
      return [...prev, newNode];
    });

    if (row.parent_step_id) {
      setEdges((prev) => {
        if (prev.find((e) => e.id === `${row.parent_step_id}-${row.id}`)) return prev;
        return [
          ...prev,
          {
            id: `${row.parent_step_id}-${row.id}`,
            source: row.parent_step_id,
            target: row.id,
            className: "dashed-string",
            style: { stroke: "#7FE7C4", strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#7FE7C4", width: 14, height: 14 },
          },
        ];
      });
    }
  }, []);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    supabase
      .from("traces")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .then(({ data }: any) => data?.forEach(upsertNode));

    const channel = supabase
      .channel(`traces-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "traces", filter: `session_id=eq.${sessionId}` },
        (payload: any) => upsertNode(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, upsertNode]);

  if (!nodes.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Evidence board</p>
        <p className="max-w-xs text-sm text-muted">
          Ask a question — every agent step will pin itself here in real time.
        </p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
      className="bg-transparent"
    >
      <Background color="#2C2F3D" gap={22} size={1} />
      <Controls className="!bg-panel !border-line [&>button]:!bg-panel [&>button]:!border-line [&>button]:!text-paper" />
    </ReactFlow>
  );
}
