"use client";

// 글 액션 묶음 드롭다운 (⋯) — NotebookLM · 음성 · 다운로드 · 관리자 기능
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export default function ActionMenu({
  label = "더보기",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className={`flex h-11 min-h-[44px] w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          open
            ? "border-foreground text-foreground"
            : "border-zinc-300 text-zinc-500 hover:text-foreground dark:border-zinc-700 dark:text-zinc-400"
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute bottom-full right-0 z-40 mb-2 flex w-max max-w-[80vw] flex-col items-stretch gap-1.5 rounded-xl border border-zinc-200 bg-background p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          {children}
        </div>
      )}
    </div>
  );
}
