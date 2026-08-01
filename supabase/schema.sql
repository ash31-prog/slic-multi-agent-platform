-- ===================================================================
-- SLIC schema — run this in Supabase SQL Editor (Project > SQL Editor)
-- ===================================================================

-- 0. Extensions
create extension if not exists "uuid-ossp";
create extension if not exists vector;   -- pgvector, needed for DocAgent RAG

-- 1. Evidence trace log — every agent step gets a row here in real time
create table if not exists traces (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null,              -- one per chat/case
  agent_id text not null,                -- 'router' | 'sql' | 'stats' | 'viz' | 'doc' | 'summary'
  step text not null,                    -- short label, e.g. "Classifying intent"
  input text,
  output text,
  status text default 'running',         -- running | done | error
  parent_step_id uuid references traces(id),
  created_at timestamptz default now()
);

alter table traces enable row level security;
create policy "public read/write for demo" on traces
  for all using (true) with check (true);

-- turn on Realtime for this table (Database > Replication in dashboard,
-- or run the line below)
alter publication supabase_realtime add table traces;

-- 2. Generic datasets — SQLAgent / StatsAgent query these.
-- Each uploaded CSV gets its own physical table created dynamically
-- (see /api/upload), this just tracks metadata so agents know what exists.
create table if not exists datasets (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  table_name text not null unique,
  columns jsonb not null,
  row_count int default 0,
  created_at timestamptz default now()
);

-- 3. Documents — anything uploaded that ISN'T tabular (PDF, DOCX, TXT)
-- gets chunked + embedded here so DocAgent can do RAG over it instead
-- of you hand-loading rows into Supabase every time.
create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  file_name text not null,
  created_at timestamptz default now()
);

create table if not exists document_chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(384),   -- matches Xenova/all-MiniLM-L6-v2 output size
  created_at timestamptz default now()
);

-- similarity search function used by DocAgent
create or replace function match_document_chunks (
  query_embedding vector(384),
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- 4. Read-only SQL execution used by SQLAgent. Rejects anything that
-- isn't a single SELECT statement, so a prompt-injected or malformed
-- LLM-generated query can't mutate data.
create or replace function execute_readonly_sql(query text)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  if query !~* '^\s*select\s' then
    raise exception 'Only SELECT statements are allowed';
  end if;
  if query ~* ';.*\S' then
    raise exception 'Multiple statements are not allowed';
  end if;

  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', query)
    into result;
  return result;
end;
$$;

alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table datasets enable row level security;
create policy "public demo" on documents for all using (true) with check (true);
create policy "public demo" on document_chunks for all using (true) with check (true);
create policy "public demo" on datasets for all using (true) with check (true);

-- 5. Dynamic table creation for CSV uploads. Column names are
-- sanitized to [a-z0-9_] only and every column is stored as text
-- (simplest + safest for a hackathon scaffold — cast in your SQL if
-- you need numeric comparisons, e.g. `(revenue)::numeric`).
create or replace function create_dataset_table(p_table_name text, p_columns text[])
returns void
language plpgsql
security definer
as $$
declare
  col text;
  col_defs text := '';
begin
  if p_table_name !~ '^[a-z_][a-z0-9_]*$' then
    raise exception 'Invalid table name';
  end if;

  foreach col in array p_columns loop
    if col !~ '^[a-z_][a-z0-9_]*$' then
      raise exception 'Invalid column name: %', col;
    end if;
    col_defs := col_defs || format('%I text, ', col);
  end loop;

  execute format(
    'create table if not exists %I (id uuid primary key default uuid_generate_v4(), %s created_at timestamptz default now())',
    p_table_name, col_defs
  );

  execute format('alter table %I enable row level security', p_table_name);
  execute format('drop policy if exists "public demo" on %I', p_table_name);
  execute format('create policy "public demo" on %I for all using (true) with check (true)', p_table_name);

  -- tell PostgREST to pick up the new table immediately
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
