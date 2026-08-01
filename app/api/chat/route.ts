import { NextRequest, NextResponse } from "next/server";
import { routeQuery } from "@/lib/agents/router";
import { runSQLAgent } from "@/lib/agents/sqlAgent";
import { runStatsAgent } from "@/lib/agents/statsAgent";
import { runVizAgent } from "@/lib/agents/vizAgent";
import { runDocAgent } from "@/lib/agents/docAgent";
import { logTrace, updateTrace } from "@/lib/tools/trace";
import { groq, MODEL } from "@/lib/groq";

// DocAgent's embeddings run in-process (transformers.js), so this
// route needs the Node runtime, not the Edge runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { question, sessionId } = await req.json();

  if (!question || !sessionId) {
    return NextResponse.json({ error: "question and sessionId are required" }, { status: 400 });
  }

  try {
    // 1. Router step
    const routerTrace = await logTrace({
      sessionId,
      agentId: "router",
      step: "Classifying intent",
      input: question,
    });
    const { agents, reasoning } = await routeQuery(question);
    await updateTrace(routerTrace!.id, { output: `→ ${agents.join(", ")} · ${reasoning}`, status: "done" });

    // 2. Run each chosen specialist agent, logging a trace per step
    const results: Record<string, any> = {};

    if (agents.includes("sql")) {
      const t = await logTrace({ sessionId, agentId: "sql", step: "Querying dataset", input: question, parentStepId: routerTrace!.id });
      const r = await runSQLAgent(question);
      results.sql = r;
      await updateTrace(t!.id, { output: r.summary, status: "done" });
    }

    if (agents.includes("stats")) {
      const t = await logTrace({ sessionId, agentId: "stats", step: "Computing statistics", input: question, parentStepId: routerTrace!.id });
      const r = await runStatsAgent(question);
      results.stats = r;
      await updateTrace(t!.id, { output: r.summary, status: "done" });
    }

    if (agents.includes("viz")) {
      const t = await logTrace({ sessionId, agentId: "viz", step: "Building chart spec", input: question, parentStepId: routerTrace!.id });
      const sourceRows = results.stats?.rows ?? results.sql?.rows ?? [];
      const r = await runVizAgent(question, sourceRows);
      results.viz = r;
      await updateTrace(t!.id, { output: r.summary, status: "done" });
    }

    if (agents.includes("doc")) {
      const t = await logTrace({ sessionId, agentId: "doc", step: "Searching documents", input: question, parentStepId: routerTrace!.id });
      const r = await runDocAgent(question);
      results.doc = r;
      await updateTrace(t!.id, { output: r.summary, status: "done" });
    }

    // 3. Summary agent — merges whatever the specialists found into one answer
    const summaryTrace = await logTrace({ sessionId, agentId: "summary", step: "Composing final answer", parentStepId: routerTrace!.id });

    const combined = Object.entries(results)
      .map(([agent, r]) => `${agent.toUpperCase()}: ${r.summary}`)
      .join("\n\n");

    const final = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: "Merge these specialist agent findings into one clear, direct answer for the user. Keep it concise. If findings conflict, say so." },
        { role: "user", content: `Question: ${question}\n\nFindings:\n${combined || "No specialist agent had data to work with."}` },
      ],
    });

    const answer = final.choices[0].message.content ?? "";
    await updateTrace(summaryTrace!.id, { output: answer, status: "done" });

    return NextResponse.json({
      answer,
      agentsUsed: agents,
      chartSpec: results.viz?.chartSpec ?? null,
      sql: results.sql?.sql ?? null,
      docMatches: results.doc?.matches ?? null,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "Something went wrong" }, { status: 500 });
  }
}
