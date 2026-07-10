import WorldHero from "@/components/world-hero";
import CategorySection from "@/components/category-section";
import BlogSection from "@/components/blog-section";
import { CATEGORIES, SITES } from "@/lib/sites";

export default function Home() {
  return (
    <main id="top">
      <WorldHero />
      <div className="mx-auto max-w-6xl space-y-24 px-4 pb-32 pt-8">
        {CATEGORIES.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            sites={SITES.filter((site) => site.cat === category.id)}
          />
        ))}
        <BlogSection />
      </div>
    </main>
  );
}
