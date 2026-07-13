"use client";

// 카테고리 섹션 목록 — 관리자가 수정한 카테고리 제목/이모지를 반영한다.
import CategorySection from "@/components/category-section";
import { useCategories } from "@/lib/use-sites";

export default function CategorySections() {
  const categories = useCategories();
  return (
    <>
      {categories.map((category) => (
        <CategorySection key={category.id} category={category} />
      ))}
    </>
  );
}
