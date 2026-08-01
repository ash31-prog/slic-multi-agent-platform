import { create } from "zustand";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  chartSpec?: any;
  agentsUsed?: string[];
};

type State = {
  sessionId: string;
  messages: ChatMessage[];
  isThinking: boolean;
  addMessage: (m: ChatMessage) => void;
  setThinking: (v: boolean) => void;
  setSessionId: (id: string) => void;
};

function genCaseId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const useSlicStore = create<State>((set) => ({
  // Empty on first render (server + initial client render match).
  // page.tsx fills this in with a real random ID inside useEffect,
  // which only runs on the client — avoids a hydration mismatch since
  // Math.random() would otherwise produce a different value on the
  // server than on the client.
  sessionId: "",
  messages: [],
  isThinking: false,
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setThinking: (v) => set({ isThinking: v }),
  setSessionId: (id) => set({ sessionId: id }),
}));

export { genCaseId };
