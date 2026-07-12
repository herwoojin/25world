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
      className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        on
          ? "border-emerald-500 bg-emerald-600 text-white"
          : "border-zinc-300 text-zinc-500 hover:border-emerald-500/60 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-400"
      }`}
    >
      <NotebookPen className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{on ? "선택됨" : "NotebookLM"}</span>
    </button>
  );
}
