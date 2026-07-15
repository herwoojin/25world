"use client";

import { Button } from "@/components/ui/button";
import IconMarquee from "@/components/icon-marquee";
import { SpotlightReveal } from "@/components/ui/image-reveal";
import { CATEGORIES } from "@/lib/sites";
import { useSites } from "@/lib/use-sites";

export default function WorldHero() {
  const { sites } = useSites();
  // ERD §4.3: 짝/홀 인덱스 자동 분할 — 사이트 추가 시 두 줄에 균등 분배
  const row1 = sites.filter((_, i) => i % 2 === 0);
  const row2 = sites.filter((_, i) => i % 2 === 1);

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      {/* 도트 그리드 배경 (24px) — 다크에서는 별하늘이 대신함 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle,rgba(0,0,0,0.04)_1px,transparent_1px)] [background-size:24px_24px] dark:hidden"
      />

      <div className="relative mx-auto max-w-4xl px-4 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          🌏 Vibe-coded Projects
        </span>
        <h1 className="mt-6 bg-gradient-to-r from-teal-300 via-sky-300 to-violet-300 bg-clip-text text-4xl font-bold tracking-tight text-transparent lg:text-6xl">
          25WORLD
        </h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
          바이브코딩으로 만든 {sites.length}개의 사이트, 한 곳에서.
        </p>
        <Button asChild size="lg" className="mt-8">
          <a href={`#cat-${CATEGORIES[0].id}`}>사이트 둘러보기</a>
        </Button>
      </div>

      {/* 아이콘 무한 캐러셀 2줄 — 마우스를 따라 스포트라이트가 아이콘을 또렷하게 비춘다 */}
      <SpotlightReveal
        className="mt-14 sm:mt-16"
        dim={0.55}
        blur={3}
      >
        <div className="space-y-5 sm:space-y-6">
          <IconMarquee sites={row1} direction="left" />
          <IconMarquee sites={row2} direction="right" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 !mt-0 w-24 bg-gradient-to-r from-background to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 !mt-0 w-24 bg-gradient-to-l from-background to-transparent"
          />
        </div>
      </SpotlightReveal>
    </section>
  );
}
