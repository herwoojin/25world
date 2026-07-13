"use client";

// 글 액션 묶음 드롭다운 (⋯) — NotebookLM · 음성 · 다운로드 · 관리자 기능
// 카드의 overflow-hidden 에 잘리지 않도록 포털 + fixed 위치로 띄운다.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

const MENU_WIDTH = 300;
const GAP = 8;

export default function ActionMenu({
  label = "더보기",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const menuH = menuRef.current?.offsetHeight ?? 220;
    // 기본은 버튼 위쪽, 공간이 부족하면 아래쪽
    const above = b.top - GAP - menuH;
    const top = above >= 8 ? above : Math.min(b.bottom + GAP, window.innerHeight - menuH - 8);
    const left = Math.min(
      Math.max(8, b.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8
    );
    setPos({ top: Math.max(8, top), left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => place();

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className={`flex h-11 min-h-[44px] w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          open
            ? "border-foreground text-foreground"
            : "border-zinc-300 text-zinc-500 hover:text-foreground dark:border-zinc-700 dark:text-zinc-400"
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: MENU_WIDTH,
            }}
            className="z-[60] flex flex-col items-stretch gap-1.5 rounded-xl border border-zinc-200 bg-background p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
