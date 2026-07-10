import ThemeSwitcher from "@/components/theme-switcher";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/60 bg-background/80 backdrop-blur dark:border-zinc-800/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <a href="#top" className="text-sm font-bold tracking-tight">
          🌏 25WORLD
        </a>
        <ThemeSwitcher />
      </div>
    </header>
  );
}
