"use client";

import { useState, useRef, useEffect } from "react";
import { useSlicStore } from "@/lib/store";
import ChartRenderer from "@/components/ChartRenderer";
import UploadDropzone from "@/components/UploadDropzone";

const AGENT_LABEL: Record<string, string> = {
  sql: "SQLAgent",
  stats: "StatsAgent",
  viz: "VizAgent",
  doc: "DocAgent",
};

const SUGGESTIONS = [
  "What's the average value in the uploaded dataset?",
  "Chart the trend over time",
  "Summarize what the uploaded document says about the results",
];

export default function ChatPanel() {
  const { sessionId, messages, isThinking, addMessage, setThinking } = useSlicStore();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  async function send(question: string) {
    if (!question.trim() || isThinking) return;
    addMessage({ role: "user", content: question });
    setInput("");
    setThinking(true);
    try {
      const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question, sessionId }),
});
const text = await res.text();
let json: any;
try {
  json = JSON.parse(text);
} catch {
  throw new Error(
    res.status === 504 || res.status === 500
      ? "The request took too long or the server crashed. Try a simpler question, or try again."
      : `Unexpected response (${res.status}): ${text.slice(0, 150)}`
  );
}
if (!res.ok) throw new Error(json.error);
      addMessage({
        role: "assistant",
        content: json.answer,
        chartSpec: json.chartSpec,
        agentsUsed: json.agentsUsed,
      });
    } catch (err: any) {
      addMessage({ role: "assistant", content: `Something went sideways: ${err.message}` });
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="animate-rise">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted">
              Case open · no findings yet
            </p>
            <h2 className="mb-4 font-display text-xl text-paper">
              Ask a question about your data.
            </h2>
            <UploadDropzone />
            <div className="mt-4 space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full rounded-lg border border-line bg-panel px-3 py-2 text-left text-sm text-muted transition hover:border-mint/40 hover:text-paper"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`animate-rise ${m.role === "user" ? "text-right" : ""}`}>
              <div
                className={`inline-block max-w-[85%] rounded-2xl px-4 py-3 text-left text-sm ${
                  m.role === "user"
                    ? "bg-mint text-ink"
                    : "border border-line bg-panel text-paper"
                }`}
              >
                {m.role === "assistant" && m.agentsUsed && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {m.agentsUsed.map((a) => (
                      <span
                        key={a}
                        className="rounded-full border border-mint/30 bg-mint/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-mint"
                      >
                        {AGENT_LABEL[a] ?? a}
                      </span>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.chartSpec && <ChartRenderer spec={m.chartSpec} />}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex items-center gap-2 font-mono text-xs text-muted animate-rise">
              <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulseline" />
              agents are working the case…
            </div>
          )}
        </div>
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-4">
        {messages.length > 0 && <div className="mb-3"><UploadDropzone /></div>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your data…"
            className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-paper outline-none placeholder:text-muted focus:border-mint/50"
          />
          <button
            type="submit"
            disabled={isThinking}
            className="rounded-xl bg-mint px-4 py-3 font-display text-sm font-medium text-ink transition disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
