"use client";

// 자료실/블로그가 구글 드라이브·구글 시트에서 데이터를 불러오는 동안
// 헤더 아래에 잠깐 떠 있는 귀여운 로딩 팝업. 모두 불러오면 자동으로 사라진다.
import { useGlobalLoading } from "@/lib/loading-bus";

export default function LoadingPopup() {
  const loading = useGlobalLoading();
  if (!loading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ top: "calc(3.5rem + 12px)" }}
    >
      <div className="flex items-center gap-2.5 rounded-full border border-amber-300/60 bg-background/95 px-4 py-2 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <span className="animate-bounce text-xl" aria-hidden="true">
          📦
        </span>
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 sm:text-sm">
          구글 시트 · 드라이브에서 자료를 불러오는 중
          <span className="animate-pulse">…</span>
        </span>
      </div>
    </div>
  );
}
