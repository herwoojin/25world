import WorldHero from "@/components/world-hero";
import CategorySections from "@/components/category-sections";
import BlogSection from "@/components/blog-section";
import SiteAdmin from "@/components/site-admin";
import MemberAdmin from "@/components/member-admin";

export default function Home() {
  return (
    <main id="top">
      <WorldHero />
      <div className="mx-auto max-w-6xl space-y-24 px-4 pb-32 pt-8">
        <MemberAdmin />
        <SiteAdmin />
        <CategorySections />
        <BlogSection />
      </div>
    </main>
  );
}
