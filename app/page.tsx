import WorldHero from "@/components/world-hero";
import CategorySections from "@/components/category-sections";
import LibrarySection from "@/components/library-section";
import BlogSection from "@/components/blog-section";

export default function Home() {
  return (
    <main id="top">
      <WorldHero />
      <div className="mx-auto max-w-6xl space-y-24 px-4 pb-32 pt-8">
        <CategorySections />
        <LibrarySection />
        <BlogSection />
      </div>
    </main>
  );
}
