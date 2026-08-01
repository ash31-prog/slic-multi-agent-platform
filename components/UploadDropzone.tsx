"use client";

import { useRef, useState } from "react";

export default function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatus(
        json.type === "dataset"
          ? `${file.name} → ${json.rowCount} rows ready for SQLAgent/StatsAgent`
          : `${file.name} → ${json.chunkCount} chunks embedded for DocAgent`
      );
    } catch (err: any) {
      setStatus(`Failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className="cursor-pointer rounded-xl border border-dashed border-line bg-panel/60 px-4 py-3 text-center transition hover:border-mint/50 hover:bg-panel"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf,.docx,.txt"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
        {busy ? "Processing…" : "Drop evidence · CSV, PDF, DOCX, TXT"}
      </p>
      {status && <p className="mt-1 text-xs text-mint">{status}</p>}
    </div>
  );
}
