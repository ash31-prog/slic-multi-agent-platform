import Groq from "groq-sdk";

// Same reasoning as lib/supabase.ts: the Groq client throws at construction
// if the API key is missing, which breaks `next build` before your real env
// vars are configured. A placeholder key keeps construction safe; a real
// request made without GROQ_API_KEY set will fail at request time with a
// clear 401 from Groq instead of crashing the build.
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "placeholder-key" });

// One model constant so it's easy to swap later (e.g. to a bigger
// Llama checkpoint or a different Groq-hosted model).
export const MODEL = "llama-3.3-70b-versatile";
