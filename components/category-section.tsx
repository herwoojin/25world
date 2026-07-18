"use client";

import type { CSSProperties } from "react";
import CategoryOrbital from "@/components/category-orbital";
import type { Category } from "@/lib/sites";
import { useVisibleSites } from "@/lib/membership";

interface CategorySectionProps {
  category: Category;
}

export default function CategorySection({ category }: CategorySectionProps) {
  const { sites } = useVisibleSites();
  const catSites = sites.filter((s) => s.cat === category.id);

  // 현재 등급에서 볼 사이트가 없으면 섹션 자체를 숨긴다
  if (catSites.length === 0) return null;

  return (
    <section
      id={`cat-${category.id}`}
      style={{ "--cc": category.color } as CSSProperties}
      // isolate: 내부 궤도 노드의 z-index(100~200)를 이 섹션 안에 가둬
      // sticky 헤더(z-40) 위로 뚫고 올라오지 않게 한다
      className="relative isolate scroll-mt-16"
    >
      {/* 제목은 3D 씬 카드의 좌측 패널이 담당한다 (h3) — 여기서는 스크린리더용 라벨만 */}
      <h2 className="sr-only">
        {category.name} ({catSites.length}개 사이트)
      </h2>
      <CategoryOrbital category={category} sites={catSites} />
    </section>
  );
}
