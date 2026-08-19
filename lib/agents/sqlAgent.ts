import { groq, MODEL } from "@/lib/groq";
import { runReadonlySQL, listDatasets } from "@/lib/tools/sqlExecutor";

const SYSTEM_PROMPT_BASE = (schemaDescription: string) => `You write a single PostgreSQL SELECT statement to answer the user's question.
Schema:
${schemaDescription || "(no datasets uploaded yet)"}

Rules:
- Output ONLY the raw SQL, no markdown fences, no explanation.
- SELECT statements only. Never write/alter/delete data.
- Always add a LIMIT (max 200) unless the question needs an aggregate.
- IMPORTANT: every column in these tables is stored as PostgreSQL \`text\`,
  even ones that look numeric or date-like, because the upload pipeline
  doesn't try to guess types. If you need to do math (avg, sum, min, max,
  comparisons, ORDER BY on a numeric-looking column) or date logic, you
  MUST explicitly cast first, e.g. avg(price::numeric), sum(qty::numeric),
  or column::date. Casting is your responsibility — Postgres will not do
  it implicitly on a text column.`;

async function generateSql(schemaDescription: string, question: string, priorError?: string) {
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT_BASE(schemaDescription) },
    { role: "user", content: question },
  ];
  if (priorError) {
    messages.push({
      role: "user",
      content: `That query failed with this Postgres error:\n${priorError}\n\nFix the SQL (most likely a missing ::numeric or ::date cast on a text column) and output only the corrected raw SQL.`,
    });
  }
  const genSql = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages,
  });
  const raw = (genSql.choices[0].message.content ?? "").trim();
  return raw
   .replace(/^```sql\s*|^```\s*|```$/gim, "")
   .trim()
   .replace(/;+\s*$/, "");
}

export async function runSQLAgent(question: string) {
  const datasets = await listDatasets();

  if (!datasets.length) {
    return {
      sql: null,
      rows: [],
      summary: "No datasets are uploaded yet — upload a CSV first so SQLAgent has something to query.",
    };
  }

  const schemaDescription = datasets
    .map((d) => `table "${d.table_name}" (${d.name}) columns: ${JSON.stringify(d.columns)}`)
    .join("\n");

  let sql = await generateSql(schemaDescription, question);
  let rows;
  try {
    rows = await runReadonlySQL(sql);
  } catch (firstErr: any) {
    // One self-correction attempt: hand the real Postgres error back to
    // the model (usually a missing ::numeric/::date cast on a text
    // column) and let it fix its own query, instead of failing outright.
    sql = await generateSql(schemaDescription, question, firstErr.message);
    rows = await runReadonlySQL(sql); // if this also fails, it throws and the route's catch handles it
  }

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
