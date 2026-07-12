import AdminButton from "@/components/admin-button";

export default function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200/60 py-6 dark:border-zinc-800/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="shrink-0">© 2026 25WORLD — vibe-coded</span>
        <span className="text-center text-sm font-bold tracking-tight text-foreground">
          JINI+US{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            (상상을 행동하라)
          </span>
        </span>
        <span className="flex shrink-0 justify-end">
          <AdminButton />
        </span>
      </div>
    </footer>
  );
}
