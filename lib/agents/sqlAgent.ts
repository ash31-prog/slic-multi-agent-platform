import { groq, MODEL } from "@/lib/groq";
import { runReadonlySQL, listDatasets } from "@/lib/tools/sqlExecutor";

export async function runSQLAgent(question: string) {
  const datasets = await listDatasets();

  const schemaDescription = datasets
    .map((d) => `table "${d.table_name}" (${d.name}) columns: ${JSON.stringify(d.columns)}`)
    .join("\n");

  const genSql = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You write a single PostgreSQL SELECT statement to answer the user's question.
Schema:
${schemaDescription || "(no datasets uploaded yet)"}

Rules:
- Output ONLY the raw SQL, no markdown fences, no explanation.
- SELECT statements only. Never write/alter/delete data.
- Always add a LIMIT (max 200) unless the question needs an aggregate.`,
      },
      { role: "user", content: question },
    ],
  });

  const sql = (genSql.choices[0].message.content ?? "").trim();

  if (!datasets.length) {
    return {
      sql: null,
      rows: [],
      summary: "No datasets are uploaded yet — upload a CSV first so SQLAgent has something to query.",
    };
  }

  const rows = await runReadonlySQL(sql);

  const summarize = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: "Summarize this query result for the user in 2-3 plain sentences. Be specific with numbers.",
      },
      { role: "user", content: `Question: ${question}\nSQL: ${sql}\nResult: ${JSON.stringify(rows).slice(0, 4000)}` },
    ],
  });

  return {
    sql,
    rows,
    summary: summarize.choices[0].message.content ?? "",
  };
}
