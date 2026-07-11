"use client";

// 헤더 카테고리 내비게이션
// 데스크톱(md+): 인라인 드롭다운 / 모바일: 햄버거 → 아코디언 패널
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { CATEGORIES, SITES } from "@/lib/sites";

const BLOG_LABEL = "유튜브 글로 다시 읽어보자";

export default function HeaderNav() {
  const [open, setOpen] = useState<string | null>(null); // 데스크톱 드롭다운
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileCat, setMobileCat] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const closeAll = () => {
    setOpen(null);
    setMobileOpen(false);
    setMobileCat(null);
  };

  return (
    <div ref={ref} className="flex min-w-0 items-center">
      {/* ── 데스크톱 (md 이상) ─────────────────────────── */}
      <nav
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
                      onClick={closeAll}
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
                    onClick={closeAll}
                    className="mt-1 block rounded-lg border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    ↓ 페이지에서 {cat.name} 섹션 보기
                  </a>
                </div>
              )}
            </div>
          );
        })}
        <a
          href="#blog"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span aria-hidden="true">📮</span>
          {BLOG_LABEL}
        </a>
      </nav>

      {/* ── 모바일 (md 미만): 햄버거 → 아코디언 패널 ────── */}
      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-label="카테고리 메뉴 열기"
        onClick={() => setMobileOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-zinc-300 dark:hover:bg-zinc-800 md:hidden"
      >
        {mobileOpen ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {mobileOpen && (
        <nav
          aria-label="카테고리 메뉴"
          className="fixed inset-x-0 top-14 z-50 max-h-[72vh] overflow-y-auto border-b border-zinc-200 bg-background p-3 shadow-2xl dark:border-zinc-800 md:hidden"
        >
          {CATEGORIES.map((cat) => {
            const sites = SITES.filter((s) => s.cat === cat.id);
            const isOpen = mobileCat === cat.id;
            return (
              <div key={cat.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setMobileCat(isOpen ? null : cat.id)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-zinc-800"
                >
                  <span>
                    <span aria-hidden="true">{cat.emoji}</span> {cat.name}{" "}
                    <span className="font-normal text-zinc-500">
                      ({sites.length})
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="mb-1 ml-3 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                    {sites.map((site) => (
                      <a
                        key={site.id}
                        href={site.url}
                        target="_blank"
                        rel="noopener"
                        onClick={closeAll}
                        className="block rounded-lg px-3 py-2 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-zinc-800"
                      >
                        <span className="block text-sm font-semibold">
                          {site.name}
                        </span>
                        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {site.url}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <a
            href="#blog"
            onClick={closeAll}
            className="mt-1 block rounded-lg border-t border-zinc-200 px-3 py-2.5 text-sm font-bold transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">📮</span> {BLOG_LABEL}
          </a>
        </nav>
      )}
    </div>
  );
}
