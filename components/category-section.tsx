import type { CSSProperties } from "react";
import CategoryOrbital from "@/components/category-orbital";
import type { Category, Site } from "@/lib/sites";

interface CategorySectionProps {
  category: Category;
  sites: Site[];
}

export default function CategorySection({
  category,
  sites,
}: CategorySectionProps) {
  return (
    <section
      id={`cat-${category.id}`}
      style={{ "--cc": category.color } as CSSProperties}
      className="scroll-mt-16"
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
          ({sites.length})
        </span>
      </h2>
      <CategoryOrbital category={category} sites={sites} />
    </section>
  );
}
