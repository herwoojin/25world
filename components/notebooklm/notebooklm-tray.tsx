"use client";

// 하단 플로팅 액션 바 — 선택한 글을 NotebookLM 소스로 복사한다.
// (NotebookLM 은 외부 주입 API 가 없으므로 클립보드 복사 + 새 탭 열기가 유일한 안정 경로)
import { useEffect, useState } from "react";
import { ExternalLink, FileText, Link2, X } from "lucide-react";
import { useNlm } from "./nlm-context";
import { extractPlainText, fetchPostHtml } from "@/lib/posts";

const NLM_URL = "https://notebooklm.google.com/";

export function NotebookLMTray() {
  const { selected, clear } = useNlm();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const items = Array.from(selected.values());
  const count = items.length;

  // 트레이가 하단 콘텐츠를 가리지 않도록 여백 확보
  useEffect(() => {
    document.body.style.paddingBottom = count > 0 ? "96px" : "";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [count]);

  if (count === 0) return null;

  const show = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 클립보드 API 실패(비 HTTPS 등) 폴백
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  };

  const copyText = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blocks = await Promise.all(
        items.map(async (i) => {
          // 본문이 없으면 Firestore 에서 가져와 순수 텍스트로 변환 (없으면 제목+URL만)
          let body = i.text?.trim() ?? "";
          if (!body) {
            const html = await fetchPostHtml(i.id).catch(() => null);
            if (html) body = extractPlainText(html);
          }
          return `# ${i.title}\n출처: ${i.url}\n\n${body || "(본문 없음)"}`;
        })
      );
      const ok = await copy(blocks.join("\n\n---\n\n"));
      show(ok ? `${count}개 글 텍스트 복사됨` : "복사에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const copyUrls = async () => {
    // NotebookLM 크롤러는 서버 HTML만 읽으므로, 본문을 그대로 내려주는 /r/{id} 주소를 준다
    const urls = items.map(
      (i) => `${window.location.origin}/r/${encodeURIComponent(i.id)}`
    );
    const ok = await copy(urls.join("\n"));
    show(ok ? `${count}개 URL 복사됨` : "복사에 실패했습니다");
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-zinc-900/95 px-3 py-2 shadow-xl ring-1 ring-white/10 backdrop-blur">
          <span className="px-2 text-sm font-semibold text-zinc-300">
            📓 {count}개 선택
          </span>

          <button
            type="button"
            onClick={copyText}
            disabled={busy}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {busy ? "준비 중…" : "텍스트 복사"}
          </button>

          <button
            type="button"
            onClick={copyUrls}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            URL 복사
          </button>

          <a
            href={NLM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            NotebookLM 열기
          </a>

          <button
            type="button"
            onClick={clear}
            aria-label="선택 해제"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-black/90 px-4 py-2 text-center text-sm text-white shadow-xl"
        >
          {toast} · NotebookLM → 소스 추가 → 붙여넣기
        </div>
      )}
    </>
  );
}
