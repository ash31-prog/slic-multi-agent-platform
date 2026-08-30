import { groq, MODEL } from "@/lib/groq";
import { runReadonlySQL, listDatasets, describeSchemaWithSamples } from "@/lib/tools/sqlExecutor";

const SYSTEM_PROMPT_BASE = (schemaDescription: string) => `You write a single PostgreSQL SELECT statement to answer the user's question.
Schema (including a few real sample rows per table — use these to tell which columns are actually numeric/date vs categorical text before writing SQL):
${schemaDescription || "(no datasets uploaded yet)"}

Rules:
- Output ONLY the raw SQL, no markdown fences, no explanation.
- SELECT statements only. Never write/alter/delete data.
- Always add a LIMIT (max 200) unless the question needs an aggregate.
- Every column is stored as PostgreSQL \`text\`, even numeric/date-looking
  ones. For math (avg/sum/min/max, comparisons, numeric ORDER BY) or date
  logic, cast explicitly: avg(price::numeric), column::date, etc.
- Only cast/aggregate a column if its sample values actually look numeric.
  If a column's sample values are words or labels (e.g. "Rounded", "Back",
  "Pointed"), it is categorical — never try to cast or average it.
- If the question doesn't name a specific column and multiple numeric
  columns exist, pick the one whose name best matches the question's
  intent (e.g. "average value" → a column literally named like value/
  amount/score if one exists; otherwise the most relevant numeric column).`;

async function generateSql(schemaDescription: string, question: string, priorErrors: string[] = []) {
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT_BASE(schemaDescription) },
    { role: "user", content: question },
  ];
  for (const err of priorErrors) {
    messages.push({
      role: "user",
      content: `That query failed with this Postgres error:\n${err}\n\nRe-check the sample rows in the schema above, fix the SQL (likely picked a non-numeric column, or is missing a ::numeric/::date cast), and output only the corrected raw SQL.`,
    });
  }
  const genSql = await groq.chat.completions.create({ model: MODEL, temperature: 0, messages });
  const raw = (genSql.choices[0].message.content ?? "").trim();
  return raw.replace(/^```sql\s*|^```\s*|```$/gim, "").trim().replace(/;+\s*$/, "");
}

export async function runSQLAgent(question: string) {
  const datasets = await listDatasets();
  if (!datasets.length) {
    return { sql: null, rows: [], summary: "No datasets are uploaded yet — upload a CSV first so SQLAgent has something to query." };
  }

  const schemaDescription = await describeSchemaWithSamples(datasets as any);
  const priorErrors: string[] = [];
  let sql = await generateSql(schemaDescription, question);
  let rows;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      rows = await runReadonlySQL(sql);
      break;
    } catch (err: any) {
      priorErrors.push(err.message);
      if (attempt === 2) {
        return { sql, rows: [], summary: `SQLAgent couldn't answer this after a couple of tries — the last error was: ${err.message}. Try rephrasing with the exact column name you mean.` };
      }
      sql = await generateSql(schemaDescription, question, priorErrors);
    }
  }

  const summarize = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      { role: "system", content: "Summarize this query result for the user in 2-3 plain sentences. Be specific with numbers." },
      { role: "user", content: `Question: ${question}\nSQL: ${sql}\nResult: ${JSON.stringify(rows).slice(0, 4000)}` },
    ],
  });

  return { sql, rows, summary: summarize.choices[0].message.content ?? "" };
}