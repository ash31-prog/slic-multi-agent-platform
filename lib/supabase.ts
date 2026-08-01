import { createClient } from "@supabase/supabase-js";

// createClient() throws immediately if the URL/key are missing or malformed,
// which breaks `next build`'s page-data collection step whenever real env
// vars aren't present yet (fresh clones, CI, before Vercel env vars are
// configured). Falling back to obviously-fake placeholders keeps the client
// constructible at build time; any *actual* request made without real env
// vars set will simply fail at request time with a clear network/auth error
// instead of crashing the build.
const FALLBACK_URL = "https://placeholder.supabase.co";
const FALLBACK_KEY = "placeholder-key";

// Server-side client — uses the service role key so agents can freely
// read/write traces + query uploaded datasets. Never expose this key
// to the browser; it's only read inside API routes (app/api/**).
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || FALLBACK_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_KEY,
  { auth: { persistSession: false } }
);

// Browser-side client — public anon key only, used by the frontend to
// subscribe to Realtime trace inserts for the evidence board.
export function getBrowserSupabase() {
  const { createClient: createBrowserClient } = require("@supabase/supabase-js");
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY
  );
}
