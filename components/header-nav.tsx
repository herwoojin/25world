"use client";

// 헤더 카테고리 드롭다운 — 카테고리별 하위 사이트(제목 + URL) 목록
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CATEGORIES, SITES } from "@/lib/sites";

export default function HeaderNav() {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <nav
      ref={ref}
      aria-label="카테고리 메뉴"
      className="hidden items-center gap-0.5 md:flex"
    >
      {CATEGORIES.map((cat) => {
        const sites = SITES.filter((s) => s.cat === cat.id);
        const isOpen = open === cat.id;
        return (
          <div key={cat.id} className="relative">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : cat.id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span aria-hidden="true">{cat.emoji}</span>
              {cat.name.split(" · ")[0]}
              <ChevronDown
                aria-hidden="true"
                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-zinc-200 bg-background p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                {sites.map((site) => (
                  <a
                    key={site.id}
                    href={site.url}
                    target="_blank"
                    rel="noopener"
                    onClick={() => setOpen(null)}
                    className="block rounded-lg px-3 py-2 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-zinc-800"
                  >
                    <span className="block text-sm font-bold">{site.name}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {site.url}
                    </span>
                  </a>
                ))}
                <a
                  href={`#cat-${cat.id}`}
                  onClick={() => setOpen(null)}
                  className="mt-1 block rounded-lg border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  ↓ 페이지에서 {cat.name} 섹션 보기
                </a>
              </div>
            )}
          </div>
        );
      })}
      {/* 블로그 섹션 바로가기 */}
      <a
        href="#blog"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span aria-hidden="true">📮</span>
        유튜브 글로 다시 읽어보자
      </a>
    </nav>
  );
}
