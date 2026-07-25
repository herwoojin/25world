"use client";

// 맨 위로(TOP) 버튼 — 관리자 동그라미 버튼 왼쪽 옆에 고정.
// 어느 정도 스크롤을 내렸을 때만 나타난다.
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="맨 위로"
      title="맨 위로"
      // 관리자 버튼(right-3, w-12) 왼쪽에 12px 간격으로 배치
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        right: "calc(0.75rem + 3rem + 12px)",
      }}
      className="fixed z-50 flex h-12 w-12 items-center justify-center rounded-full bg-background/80 text-zinc-500 shadow-lg ring-1 ring-zinc-300 backdrop-blur transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-zinc-700"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
