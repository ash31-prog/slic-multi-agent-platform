// Free, zero-API-key embeddings using transformers.js (runs the model
// in the Node process, downloads + caches on first call). This is what
// lets DocAgent do RAG without paying for an embeddings API.
//
// NOTE: this needs the Node.js runtime (not Vercel Edge). Both
// app/api/upload/route.ts and app/api/chat/route.ts declare
// `export const runtime = "nodejs"` for this reason.

import { pipeline } from "@xenova/transformers";

let embedderPromise: Promise<any> | null = null;

function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedderPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const embedder = await getEmbedder();
  const results: number[][] = [];
  for (const t of texts) {
    const output = await embedder(t, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data as Float32Array));
  }
  return results;
}

// Simple fixed-size chunker with overlap — good enough for PDFs/DOCX
// text extraction without pulling in a heavier splitter library.
export function chunkText(text: string, chunkSize = 800, overlap = 120): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks.filter((c) => c.length > 20);
}
