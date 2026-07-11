import AdminButton from "@/components/admin-button";

export default function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200/60 py-6 dark:border-zinc-800/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span>© 2026 25WORLD — vibe-coded</span>
        <AdminButton />
      </div>
    </footer>
  );
}
