import { Youtube } from "lucide-react";
import AdminButton from "@/components/admin-button";
import ScrollTop from "@/components/scroll-top";
import VisitorStatsBadge from "@/components/visitor-stats";

export default function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200/60 py-6 dark:border-zinc-800/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-xs text-zinc-500 dark:text-zinc-400 sm:flex-row sm:justify-between sm:gap-4">
        <span className="shrink-0">© 2026 25WORLD — vibe-coded</span>
        <span className="flex flex-col items-center gap-1">
          <span className="text-center text-sm font-bold tracking-tight text-foreground">
            JINI+US{" "}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">
              (상상을 행동하라)
            </span>
          </span>
          <a
            href="https://www.youtube.com/@herhero1997"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-red-500 transition-colors hover:text-red-600"
          >
            <Youtube className="h-3.5 w-3.5" aria-hidden="true" />
            주인장 유튜브 보기
          </a>
        </span>
        <span className="flex shrink-0 items-center justify-end gap-4">
          <VisitorStatsBadge />
          <AdminButton />
        </span>
      </div>
      <ScrollTop />
    </footer>
  );
}
