import { groq, MODEL } from "@/lib/groq";
import { runReadonlySQL, listDatasets } from "@/lib/tools/sqlExecutor";

// StatsAgent reuses the same NL->SQL step as SQLAgent but asks for
// aggregates (avg/min/max/stddev/count, grouped trends) instead of raw
// rows, then narrates what the numbers mean.
export async function runStatsAgent(question: string) {
  const datasets = await listDatasets();
  if (!datasets.length) {
    return { sql: null, rows: [], summary: "No datasets uploaded yet — nothing to compute statistics on." };
  }

  const schemaDescription = datasets
    .map((d) => `table "${d.table_name}" (${d.name}) columns: ${JSON.stringify(d.columns)}`)
    .join("\n");

  const genSql = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Write ONE PostgreSQL SELECT that computes aggregate statistics (count/avg/min/max/stddev, or GROUP BY trends over time) to answer the question.
Schema:
${schemaDescription}
Output raw SQL only, no markdown.`,
      },
      { role: "user", content: question },
    ],
  });

  const sql = (genSql.choices[0].message.content ?? "").trim();
  const rows = await runReadonlySQL(sql);

  const narrate = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: "You're a data analyst. Explain what these statistics mean in 2-4 sentences, calling out the most notable pattern.",
      },
      { role: "user", content: `Question: ${question}\nStats result: ${JSON.stringify(rows).slice(0, 4000)}` },
    ],
  });

  return { sql, rows, summary: narrate.choices[0].message.content ?? "" };
}
