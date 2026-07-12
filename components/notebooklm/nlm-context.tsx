"use client";

// NotebookLM 소스로 보낼 글 선택 상태 (전역)
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export interface NlmItem {
  id: string;
  title: string;
  url: string;
  /** 본문 순수 텍스트. 비어 있으면 트레이가 Firestore 본문에서 채운다 */
  text?: string;
}

interface Ctx {
  selected: Map<string, NlmItem>;
  toggle: (item: NlmItem) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

const NlmContext = createContext<Ctx | null>(null);

export function NlmProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Map<string, NlmItem>>(new Map());

  const toggle = useCallback((item: NlmItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Map()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return (
    <NlmContext.Provider value={{ selected, toggle, clear, isSelected }}>
      {children}
    </NlmContext.Provider>
  );
}

export function useNlm() {
  const ctx = useContext(NlmContext);
  if (!ctx) throw new Error("useNlm must be used within NlmProvider");
  return ctx;
}
