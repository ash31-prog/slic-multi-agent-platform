# SLIC — Multi-Agent Data Intelligence Platform

Ask a plain-English question. A router agent picks specialist agents
(SQL / Stats / Viz / Doc) to answer it, and a live "evidence board"
shows exactly which agent did what, in real time.

**What changed from the original plan:** added a **DocAgent** with automatic
RAG ingestion — upload a PDF/DOCX/TXT once and it's chunked + embedded
automatically, so you never hand-load Supabase rows again. Structured
data (CSV) still goes through SQLAgent/StatsAgent against a real Postgres
table, also created automatically on upload.

---

## 0. What you need (all free tier)

| Service | What it's for | Get it here |
|---|---|---|
| Groq | LLM inference (Llama 3.3 70B) | https://console.groq.com/keys |
| Supabase | Postgres + pgvector + Realtime | https://supabase.com/dashboard |
| Vercel | Hosting | https://vercel.com |

Embeddings for DocAgent run **locally in Node** via `@xenova/transformers`
(no API key, no cost — first call downloads a small model and caches it).

---

## 1. Local setup, step by step

```bash
# 1. unzip and install
cd slic
npm install

# 2. copy env template
cp .env.example .env.local
```

### Create the Supabase project
1. New project at supabase.com → note the **Project URL** and **anon public key** (Settings → API), and the **service_role key** (same page, keep secret).
2. Open **SQL Editor** → paste the entire contents of `supabase/schema.sql` → Run.
   This creates the `traces`, `datasets`, `documents`, `document_chunks` tables, the pgvector similarity search function, and the safe read-only SQL execution function.
3. Go to **Database → Replication** and confirm the `traces` table has Realtime enabled (the schema script already does this via `alter publication supabase_realtime add table traces`, but double-check the toggle is on).

### Fill in `.env.local`
```
GROQ_API_KEY=gsk_xxxxxxxx
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx...
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx...
```

### Run it
```bash
npm run dev
```
Open http://localhost:3000. Drop a CSV or a PDF, then ask a question.

---

## 2. Deploy (GitHub + Vercel)

```bash
git init && git add -A && git commit -m "init"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/slic-multi-agent-platform.git
git push -u origin main
```
Then in Vercel: **New Project → import the repo → add the same 5 env vars from `.env.local` → Deploy.**

---

## 3. How a question flows through the system

1. `ChatPanel` posts `{ question, sessionId }` to `/api/chat`.
2. `router.ts` asks Groq to classify intent → picks one or more of `sql`, `stats`, `viz`, `doc`, based on what datasets/documents actually exist.
3. Each chosen agent runs (`lib/agents/*.ts`), and **every step writes a row to `traces`** via `logTrace()`.
4. Because `traces` has Supabase Realtime on, `EvidenceBoard.tsx` (subscribed client-side) gets each insert/update instantly and pins a new card — no polling.
5. A final "summary" step merges all specialist outputs into one answer, which streams back to the chat.

## 4. Why DocAgent solves the "keep adding datasets" problem

Previously every new piece of context meant manually inserting rows into
Supabase. Now:
- **CSV** → `/api/upload` creates a real Postgres table on the fly (`create_dataset_table` RPC) and bulk-inserts rows. SQLAgent/StatsAgent query it with real SQL.
- **PDF / DOCX / TXT** → text is extracted, split into ~800-char chunks, embedded locally (`Xenova/all-MiniLM-L6-v2`, 384-dim, free), and stored in `document_chunks` with a pgvector column. DocAgent does cosine similarity search (`match_document_chunks` RPC) and answers with citations back to the source chunk.

You just drag a file in — no schema design, no manual rows.

## 5. Known limitations (be upfront about these in your writeup)

- The dynamic `CREATE TABLE` approach stores every CSV column as `text`; cast to `numeric`/`date` in your generated SQL if you need real math (SQLAgent already does simple casts when asked).
- `@xenova/transformers` runs the embedding model inside the Node serverless function. First request after a cold start is slow (~5-10s) while it downloads/caches the model; subsequent requests are fast. On Vercel's Hobby tier this works but isn't instant — fine for a demo/hackathon, worth swapping for a hosted embeddings API if you scale up.
- RLS policies here are wide open (`using (true)`) for demo speed. Before showing this to anyone outside your own testing, tighten policies or add Supabase Auth (the schema already has an `auth (optional)` hook via Supabase Auth if you want it).
- `execute_readonly_sql` blocks multi-statement and non-SELECT queries at the DB layer, but always sanity-check generated SQL yourself before trusting it on real data.

## 6. Project structure

```
app/
  api/chat/route.ts       orchestrator: router → specialist agents → summary
  api/upload/route.ts     CSV → table, PDF/DOCX/TXT → embedded chunks
  page.tsx                split layout: ChatPanel | EvidenceBoard
lib/
  agents/router.ts        intent classification
  agents/sqlAgent.ts       NL → SQL → execute → summarize
  agents/statsAgent.ts     NL → aggregate SQL → narrate
  agents/vizAgent.ts       rows → chart spec JSON
  agents/docAgent.ts       question → embed → pgvector search → cited answer
  tools/sqlExecutor.ts     safe SELECT-only execution
  tools/embeddings.ts      local free embeddings + chunker
  tools/trace.ts           writes every agent step to `traces`
  supabase.ts / groq.ts    client setup
components/
  ChatPanel.tsx            chat UI + suggestions + upload
  EvidenceBoard.tsx         React Flow, live via Supabase Realtime
  ChartRenderer.tsx        Recharts wrapper for VizAgent output
  UploadDropzone.tsx        drag/drop → /api/upload
supabase/schema.sql        run this once in the SQL Editor
```

## 7. LinkedIn post checklist (Phase 6 from the original plan)

- 20–30s screen capture of the evidence board pinning cards live while you ask a question
- Hook: "$0/month multi-agent analyst that shows its work" + hackathon context if relevant
- What it does → 1 GIF → tech stack table → GitHub link
- Tags: `#buildinpublic #AI #LLM #hackathon`
