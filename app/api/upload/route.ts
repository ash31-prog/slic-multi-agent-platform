import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { chunkText, embedBatch } from "@/lib/tools/embeddings";

export const runtime = "nodejs";
export const maxDuration = 60;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Right after `create_dataset_table` creates a new table, PostgREST
// (Supabase's REST layer) doesn't know about it yet — its schema cache
// only refreshes after the pg_notify('pgrst', 'reload schema') call the
// function fires, which is asynchronous. An insert that races ahead of
// that reload fails with "Could not find the table ... in the schema
// cache" even though the table genuinely exists. Retrying with a short
// backoff gives the cache time to catch up instead of failing outright.
async function insertWithSchemaCacheRetry(
  tableName: string,
  rows: Record<string, string>[],
  maxAttempts = 5
) {
  let lastError: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { error } = await supabaseAdmin.from(tableName).insert(rows);
    if (!error) return;
    lastError = error;
    if (!error.message?.includes("schema cache")) throw new Error(`Row insert failed: ${error.message}`);
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1))); // 300ms, 600ms, 900ms...
  }
  throw new Error(`Row insert failed after retries: ${lastError?.message}`);
}

// Everything funnels through this one endpoint: CSV -> a queryable
// Supabase table (SQLAgent/StatsAgent territory). PDF/DOCX/TXT -> chunked
// + embedded into document_chunks (DocAgent territory). This is the
// "automate the ingestion" piece — no manual Supabase row-adding.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  const baseName = slugify(file.name) || "dataset";

  try {
    if (ext === "csv") {
      const text = await file.text();
      const [headerLine, ...lines] = text.trim().split("\n");
      const columns = headerLine.split(",").map((c) => c.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
      const tableName = `ds_${baseName}_${Date.now().toString(36)}`;

      const { error: createErr } = await supabaseAdmin.rpc("create_dataset_table", {
        p_table_name: tableName,
        p_columns: columns,
      });
      if (createErr) throw new Error(`Table creation failed: ${createErr.message}`);

      const rows = lines
        .filter((l) => l.trim().length)
        .map((line) => {
          const values = line.split(",");
          const row: Record<string, string> = {};
          columns.forEach((col, i) => (row[col] = (values[i] ?? "").trim()));
          return row;
        });

      // batch insert, 500 rows at a time. The first batch uses retry logic
      // since it's the one most likely to race the schema-cache reload
      // right after table creation; subsequent batches hit an already-warm
      // cache so they go through the retry wrapper too, cheaply (it just
      // succeeds on the first attempt).
      for (let i = 0; i < rows.length; i += 500) {
        await insertWithSchemaCacheRetry(tableName, rows.slice(i, i + 500));
      }

      await supabaseAdmin.from("datasets").insert({
        name: file.name,
        table_name: tableName,
        columns,
        row_count: rows.length,
      });

      return NextResponse.json({ type: "dataset", tableName, rowCount: rows.length, columns });
    }

    if (ext === "pdf" || ext === "docx" || ext === "txt") {
      let extractedText = "";
      const buffer = Buffer.from(await file.arrayBuffer());

      if (ext === "pdf") {
        const pdfParse = (await import("pdf-parse")).default;
        extractedText = (await pdfParse(buffer)).text;
      } else if (ext === "docx") {
        const mammoth = await import("mammoth");
        extractedText = (await mammoth.extractRawText({ buffer })).value;
      } else {
        extractedText = buffer.toString("utf-8");
      }

      const { data: doc, error: docErr } = await supabaseAdmin
        .from("documents")
        .insert({ file_name: file.name })
        .select()
        .single();
      if (docErr) throw new Error(docErr.message);

      const chunks = chunkText(extractedText);
      const embeddings = await embedBatch(chunks);

      const chunkRows = chunks.map((content, i) => ({
        document_id: doc.id,
        chunk_index: i,
        content,
        embedding: embeddings[i],
      }));

      for (let i = 0; i < chunkRows.length; i += 100) {
        const { error: chunkErr } = await supabaseAdmin.from("document_chunks").insert(chunkRows.slice(i, i + 100));
        if (chunkErr) throw new Error(chunkErr.message);
      }

      return NextResponse.json({ type: "document", documentId: doc.id, chunkCount: chunks.length });
    }

    return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 });
  } catch (err: any) {
    console.error(err);
    // "fetch failed" here almost always means the embedding step
    // (lib/tools/embeddings.ts) couldn't download the local model from
    // Hugging Face on its first run — usually a firewall/proxy/VPN
    // blocking huggingface.co, not a bug in the upload itself.
    const message =
      err.message === "fetch failed"
        ? "Couldn't download the local embedding model (first-use only, ~90MB from huggingface.co). Check your network/firewall/VPN isn't blocking huggingface.co, then try the upload again."
        : err.message ?? "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
