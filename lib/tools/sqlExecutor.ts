import { supabaseAdmin } from "@/lib/supabase";

export async function runReadonlySQL(query: string) {
  const { data, error } = await supabaseAdmin.rpc("execute_readonly_sql", { query });
  if (error) throw new Error(`SQL error: ${error.message}`);
  return data;
}

export async function listDatasets() {
  const { data, error } = await supabaseAdmin
    .from("datasets")
    .select("name, table_name, columns, row_count")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  return data;
}

// Includes real sample rows per table so the LLM can tell numeric columns
// apart from categorical/text ones (column names alone aren't enough —
// this is what was causing it to try averaging a label column).
export async function describeSchemaWithSamples(datasets: { table_name: string; name: string; columns: string[] }[]) {
  const parts = await Promise.all(
    datasets.map(async (d) => {
      let sampleLine = "";
      try {
        const sample = await runReadonlySQL(`select * from ${d.table_name} limit 3`);
        if (Array.isArray(sample) && sample.length) sampleLine = `\n  sample rows: ${JSON.stringify(sample)}`;
      } catch {}
      return `table "${d.table_name}" (${d.name}) columns: ${JSON.stringify(d.columns)}${sampleLine}`;
    })
  );
  return parts.join("\n");
}