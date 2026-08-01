import { supabaseAdmin } from "@/lib/supabase";

export type TraceStatus = "running" | "done" | "error";

// Every agent calls this before + after doing work. Because `traces`
// has Realtime enabled, each insert/update streams straight to the
// React Flow evidence board on the frontend — no polling needed.
export async function logTrace(params: {
  sessionId: string;
  agentId: string;
  step: string;
  input?: string;
  output?: string;
  status?: TraceStatus;
  parentStepId?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("traces")
    .insert({
      session_id: params.sessionId,
      agent_id: params.agentId,
      step: params.step,
      input: params.input ?? null,
      output: params.output ?? null,
      status: params.status ?? "running",
      parent_step_id: params.parentStepId ?? null,
    })
    .select()
    .single();

  if (error) console.error("logTrace error:", error.message);
  return data;
}

export async function updateTrace(
  id: string,
  patch: { output?: string; status?: TraceStatus }
) {
  const { error } = await supabaseAdmin.from("traces").update(patch).eq("id", id);
  if (error) console.error("updateTrace error:", error.message);
}
