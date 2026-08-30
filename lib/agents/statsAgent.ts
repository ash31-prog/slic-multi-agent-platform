import { groq, MODEL } from "@/lib/groq";
import { runReadonlySQL, listDatasets, describeSchemaWithSamples } from "@/lib/tools/sqlExecutor";

function systemPrompt(schemaDescription: string) {
  return `Write ONE PostgreSQL SELECT that computes aggregate statistics (count/avg/min/max/stddev, or GROUP BY trends over time) to answer the question.
Schema (including a few real sample rows per table — use these to tell which columns are actually numeric/date vs categorical text before writing SQL):
${schemaDescription}

- Every column is stored as PostgreSQL \`text\`, even numeric/date-looking
  ones. Aggregate functions (avg/sum/stddev) will fail on text unless you
  explicitly cast, e.g. avg(price::numeric), or column::date for date
  grouping/trends.
- Only cast/aggregate a column if its sample values actually look numeric.
  If a column's sample values are words or labels, it is categorical —
  never try to cast or average it.
- If the question doesn't name a specific column and multiple numeric
  columns exist, pick the one whose name best matches the question's
  intent; otherwise the most relevant numeric column.

Output raw SQL only, no markdown.`;
}

async function generateSql(schemaDescription: string, question: string, priorErrors: string[] = []) {
  const messages: any[] = [
    { role: "system", content: systemPrompt(schemaDescription) },
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

export async function runStatsAgent(question: string) {
  const datasets = await listDatasets();
  if (!datasets.length) {
    return { sql: null, rows: [], summary: "No datasets uploaded yet — nothing to compute statistics on." };
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
        return { sql, rows: [], summary: `StatsAgent couldn't compute this after a couple of tries — the last error was: ${err.message}. Try rephrasing with the exact column name you mean.` };
      }
      sql = await generateSql(schemaDescription, question, priorErrors);
    }
  }

  const narrate = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      { role: "system", content: "You're a data analyst. Explain what these statistics mean in 2-4 sentences, calling out the most notable pattern." },
      { role: "user", content: `Question: ${question}\nStats result: ${JSON.stringify(rows).slice(0, 4000)}` },
    ],
  });

  return { sql, rows, summary: narrate.choices[0].message.content ?? "" };
}