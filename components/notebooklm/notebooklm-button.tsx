"use client";

import { NotebookPen } from "lucide-react";
import { useNlm, type NlmItem } from "./nlm-context";

export function NotebookLMButton({ item }: { item: NlmItem }) {
  const { toggle, isSelected } = useNlm();
  const on = isSelected(item.id);

  return (
    <button
      type="button"
      onClick={() => toggle(item)}
      aria-pressed={on}
      aria-label={`${item.title} NotebookLM 소스로 ${on ? "선택 해제" : "선택"}`}
      title="NotebookLM 소스로 선택"
      className={`flex min-h-[44px] w-full items-center justify-start gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        on
          ? "border-emerald-500 bg-emerald-600 text-white"
          : "border-input text-foreground hover:border-emerald-500/60 hover:text-emerald-600"
      }`}
    >
      <NotebookPen className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{on ? "선택됨 (NotebookLM)" : "NotebookLM 소스로 담기"}</span>
    </button>
  );
}
