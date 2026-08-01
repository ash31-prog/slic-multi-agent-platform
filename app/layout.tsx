import type { Metadata } from "next";
import "./globals.css";

// Fonts are loaded via @import in globals.css instead of next/font/google.
// next/font/google fetches from Google Fonts at BUILD time, which breaks
// builds in sandboxed/offline CI environments. A CSS @import fetches at
// page-load time in the browser instead, which is more forgiving and still
// gets you the same font files with a small FOUC tradeoff.

export const metadata: Metadata = {
  title: "SLIC — Multi-Agent Data Intelligence",
  description: "Ask a question in plain English. Watch the agents build the case.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body bg-ink text-paper antialiased">{children}</body>
    </html>
  );
}
