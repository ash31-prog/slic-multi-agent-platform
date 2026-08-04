import { groq, MODEL } from "@/lib/groq";
import { runReadonlySQL, listDatasets } from "@/lib/tools/sqlExecutor";

// StatsAgent reuses the same NL->SQL step as SQLAgent but asks for
// aggregates (avg/min/max/stddev, grouped trends) instead of raw rows,
// then narrates what the numbers mean.

function systemPrompt(schemaDescription: string) {
  return `Write ONE PostgreSQL SELECT that computes aggregate statistics (count/avg/min/max/stddev, or GROUP BY trends over time) to answer the question.
Schema:
${schemaDescription}

IMPORTANT: every column in these tables is stored as PostgreSQL \`text\`,
even ones that look numeric or date-like, because the upload pipeline
doesn't try to guess types. Aggregate functions like avg()/sum()/stddev()
will fail on text unless you explicitly cast first, e.g.
avg(price::numeric), stddev(qty::numeric), or column::date for date
grouping/trends. Cast every numeric-looking column you aggregate over.

Output raw SQL only, no markdown.`;
}

async function generateSql(schemaDescription: string, question: string, priorError?: string) {
  const messages: any[] = [
    { role: "system", content: systemPrompt(schemaDescription) },
    { role: "user", content: question },
  ];
  if (priorError) {
    messages.push({
      role: "user",
      content: `That query failed with this Postgres error:\n${priorError}\n\nFix the SQL (most likely a missing ::numeric or ::date cast on a text column) and output only the corrected raw SQL.`,
    });
  }
  const genSql = await groq.chat.completions.create({ model: MODEL, temperature: 0, messages });
  return (genSql.choices[0].message.content ?? "").trim();
}

export async function runStatsAgent(question: string) {
  const datasets = await listDatasets();
  if (!datasets.length) {
    return { sql: null, rows: [], summary: "No datasets uploaded yet — nothing to compute statistics on." };
  }

  const schemaDescription = datasets
    .map((d) => `table "${d.table_name}" (${d.name}) columns: ${JSON.stringify(d.columns)}`)
    .join("\n");

  let sql = await generateSql(schemaDescription, question);
  let rows;
  try {
    rows = await runReadonlySQL(sql);
  } catch (firstErr: any) {
    // One self-correction attempt using the real Postgres error — usually
    // a missing ::numeric/::date cast on a text column.
    sql = await generateSql(schemaDescription, question, firstErr.message);
    rows = await runReadonlySQL(sql);
  }

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
