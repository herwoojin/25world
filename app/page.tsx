import WorldHero from "@/components/world-hero";
import CategorySection from "@/components/category-section";
import BlogSection from "@/components/blog-section";
import SiteAdmin from "@/components/site-admin";
import { CATEGORIES } from "@/lib/sites";

export default function Home() {
  return (
    <main id="top">
      <WorldHero />
      <div className="mx-auto max-w-6xl space-y-24 px-4 pb-32 pt-8">
        <SiteAdmin />
        {CATEGORIES.map((category) => (
          <CategorySection key={category.id} category={category} />
        ))}
        <BlogSection />
      </div>
    </main>
  );
}
