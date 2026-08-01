/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#12131A",      // background
        panel: "#1C1E29",    // card/panel surface
        panel2: "#20222E",
        line: "#2C2F3D",     // hairlines / dividers
        mint: "#7FE7C4",     // primary accent (agent trace)
        amber: "#FFB86B",    // secondary accent (highlights, warnings)
        rose: "#FF8FA3",     // error / alert accent
        paper: "#F2F3F5",    // primary text
        muted: "#9096A8",    // secondary text
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(127,231,196,0.25), 0 0 24px -4px rgba(127,231,196,0.35)",
      },
      keyframes: {
        pulseline: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseline: "pulseline 1.8s ease-in-out infinite",
        rise: "rise 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
