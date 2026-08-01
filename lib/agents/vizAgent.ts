import { groq, MODEL } from "@/lib/groq";

// VizAgent doesn't generate an image — it emits a small declarative
// chart spec {type, xKey, yKey, data} that ChartRenderer.tsx turns
// into a Recharts chart. Feeding it rows from SQL/StatsAgent (via
// `sourceRows`) keeps the numbers grounded instead of hallucinated.
export async function runVizAgent(question: string, sourceRows: any[]) {
  if (!sourceRows?.length) {
    return { chartSpec: null, summary: "No rows to chart yet — run SQLAgent or StatsAgent first." };
  }

  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Given the user's question and a JSON array of rows, output ONLY JSON:
{"type": "bar" | "line" | "pie", "xKey": "<field>", "yKey": "<field>", "title": "<short title>"}
Pick xKey/yKey from the actual field names present in the rows.`,
      },
      {
        role: "user",
        content: `Question: ${question}\nRows: ${JSON.stringify(sourceRows).slice(0, 3000)}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  try {
    const spec = JSON.parse(completion.choices[0].message.content ?? "{}");
    return { chartSpec: { ...spec, data: sourceRows }, summary: `Rendered a ${spec.type} chart.` };
  } catch {
    return { chartSpec: null, summary: "Couldn't derive a chart spec from that result." };
  }
}
