import { groq, MODEL } from "@/lib/groq";
import { listDatasets } from "@/lib/tools/sqlExecutor";
import { supabaseAdmin } from "@/lib/supabase";

export type AgentName = "sql" | "stats" | "viz" | "doc";

// Router looks at the question + what data actually exists (tables AND
// uploaded documents) and decides which specialist agent(s) should run.
// It can pick more than one — e.g. "chart the trend" fires both
// StatsAgent and VizAgent.
export async function routeQuery(question: string): Promise<{
  agents: AgentName[];
  reasoning: string;
}> {
  const datasets = await listDatasets();
  const { data: docs } = await supabaseAdmin.from("documents").select("file_name");

  const systemPrompt = `You are the router for a multi-agent data analyst.
Available structured datasets (query-able via SQL): ${JSON.stringify(
    datasets?.map((d) => ({ name: d.name, columns: d.columns })) ?? []
  )}
Available uploaded documents (query-able via retrieval): ${JSON.stringify(
    docs?.map((d) => d.file_name) ?? []
  )}

Decide which agents should handle the user's question. Options:
- "sql": question needs exact rows/filters/aggregates from a structured dataset
- "stats": question needs trends, correlations, summary statistics
- "viz": question explicitly or implicitly wants a chart/visual
- "doc": question is about content inside an uploaded document (PDF/DOCX/TXT)

Respond ONLY with JSON: {"agents": ["sql"], "reasoning": "one short sentence"}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    const agents = (parsed.agents ?? []).filter((a: string) =>
      ["sql", "stats", "viz", "doc"].includes(a)
    );
    return {
      agents: agents.length ? agents : ["doc"],
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    return { agents: ["doc"], reasoning: "fallback: defaulting to document search" };
  }
}
