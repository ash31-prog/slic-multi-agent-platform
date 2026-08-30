"use client";

import { useEffect } from "react";
import ChatPanel from "@/components/ChatPanel";
import EvidenceBoard from "@/components/EvidenceBoard";
import { useSlicStore, genCaseId } from "@/lib/store";

export default function Home() {
  const sessionId = useSlicStore((s) => s.sessionId);
  const setSessionId = useSlicStore((s) => s.setSessionId);

  // Runs only on the client, after the initial (empty-sessionId) render
  // has already matched between server and client — this is what
  // avoids the hydration mismatch.
  useEffect(() => {
    setSessionId(genCaseId());
  }, [setSessionId]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-mint animate-pulseline" />
          <h1 className="font-display text-sm font-medium tracking-wide">SLIC</h1>
          <span className="font-mono text-[11px] text-muted">multi-agent data intelligence</span>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Case #{sessionId || "——————"}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(340px,420px)_1fr]">
       <section className="min-h-0 border-b border-line md:border-b-0 md:border-r">
        <ChatPanel />
       </section>
       <section className="hidden min-h-0 md:block">
          <EvidenceBoard />
        </section>
      </div>
    </main>
  );
}
