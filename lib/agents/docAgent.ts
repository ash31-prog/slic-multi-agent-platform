import { groq, MODEL } from "@/lib/groq";
import { supabaseAdmin } from "@/lib/supabase";
import { embedText } from "@/lib/tools/embeddings";

// This is the piece that removes the "manually add every dataset to
// Supabase" chore: upload a PDF/DOCX once (see /api/upload), it gets
// chunked + embedded automatically, and from then on DocAgent can
// answer questions grounded in it via similarity search.
export async function runDocAgent(question: string) {
  const { data: docCount } = await supabaseAdmin.from("documents").select("id", { count: "exact", head: true });

  const queryEmbedding = await embedText(question);

  const { data: matches, error } = await supabaseAdmin.rpc("match_document_chunks", {
    query_embedding: queryEmbedding,
    match_count: 5,
  });

  if (error) throw new Error(`DocAgent retrieval error: ${error.message}`);

  if (!matches?.length) {
    return {
      matches: [],
      summary: "No relevant documents found — upload a PDF/DOCX/TXT first so DocAgent has something to search.",
    };
  }

  const context = matches
    .map((m: any, i: number) => `[Source ${i + 1}, similarity ${m.similarity.toFixed(2)}]\n${m.content}`)
    .join("\n\n");

  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `Answer the user's question using ONLY the provided source excerpts. Cite sources inline like [Source 1]. If the excerpts don't contain the answer, say so plainly.`,
      },
      { role: "user", content: `Question: ${question}\n\nSource excerpts:\n${context}` },
    ],
  });

  return {
    matches: matches.map((m: any) => ({ content: m.content, similarity: m.similarity })),
    summary: completion.choices[0].message.content ?? "",
  };
}
