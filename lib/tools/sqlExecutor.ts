import { supabaseAdmin } from "@/lib/supabase";

// Runs a SELECT-only query through the execute_readonly_sql() Postgres
// function defined in supabase/schema.sql. Any non-SELECT or multi
// statement query is rejected at the DB layer, not just here.
export async function runReadonlySQL(query: string) {
  const { data, error } = await supabaseAdmin.rpc("execute_readonly_sql", {
    query,
  });
  if (error) throw new Error(`SQL error: ${error.message}`);
  return data;
}

export async function listDatasets() {
  const { data, error } = await supabaseAdmin
    .from("datasets")
    .select("name, table_name, columns, row_count");
  if (error) throw new Error(error.message);
  return data;
}
