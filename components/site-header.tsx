import ThemeSwitcher from "@/components/theme-switcher";
import HeaderNav from "@/components/header-nav";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/60 bg-background/80 backdrop-blur dark:border-zinc-800/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <a href="#top" className="shrink-0 text-sm font-bold tracking-tight">
          🌏 25WORLD
        </a>
        <HeaderNav />
        <ThemeSwitcher />
      </div>
    </header>
  );
}
