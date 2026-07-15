"use client";

import type { CSSProperties } from "react";
import CategoryOrbital from "@/components/category-orbital";
import type { Category } from "@/lib/sites";
import { useSites } from "@/lib/use-sites";

interface CategorySectionProps {
  category: Category;
}

export default function CategorySection({ category }: CategorySectionProps) {
  const { sites } = useSites();
  const catSites = sites.filter((s) => s.cat === category.id);

  return (
    <section
      id={`cat-${category.id}`}
      style={{ "--cc": category.color } as CSSProperties}
      // isolate: 내부 궤도 노드의 z-index(100~200)를 이 섹션 안에 가둬
      // sticky 헤더(z-40) 위로 뚫고 올라오지 않게 한다
      className="relative isolate scroll-mt-16"
    >
      <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
        <span
          aria-hidden="true"
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        <span aria-hidden="true">{category.emoji}</span>
        <span>{category.name}</span>
        <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
          ({catSites.length})
        </span>
      </h2>
      <CategoryOrbital category={category} sites={catSites} />
    </section>
  );
}
