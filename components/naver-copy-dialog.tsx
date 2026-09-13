"use client";

// 네이버 블로그용 복사 — 제목과 본문을 네이버 에디터(스마트에디터 ONE)에 맞게 정리해
// 한 번씩 복사한다. 네이버는 제목칸과 본문칸이 따로라 두 번에 나눠 붙여넣는다.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardCopy, ExternalLink, X } from "lucide-react";
import { fetchPostHtml } from "@/lib/posts";
import {
  NAVER_WRITE_URL,
  buildNaverCopy,
  copyPlainText,
  copyRichHtml,
  warmNaverImages,
  type NaverCopy,
} from "@/lib/naver-copy";

export default function NaverCopyDialog({
  postId,
  fallbackTitle,
  onClose,
}: {
  postId: string;
  fallbackTitle: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<NaverCopy | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"" | "title" | "body">("");
  // 부모가 매 렌더마다 새 함수를 넘겨도 본문을 다시 불러오지 않도록 ref 로 잡아둔다
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let alive = true;
    fetchPostHtml(postId)
      .then((html) => {
        if (!alive) return;
        if (!html) {
          setError("본문을 불러오지 못했어요.");
          return;
        }
        const c = buildNaverCopy(postId, html);
        if (!c.title) c.title = fallbackTitle.replace(/\s*[—–-]\s*블로그\s*$/, "").trim();
        setData(c);
        // 무료 서버를 깨우고 이미지를 미리 받아둔다 — 붙여넣는 순간 네이버가 바로 가져가도록
        warmNaverImages(c.imageUrls);
      })
      .catch(() => alive && setError("본문을 불러오지 못했어요."));

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [postId, fallbackTitle]);

  const copy = async (kind: "title" | "body") => {
    if (!data) return;
    setError("");
    try {
      if (kind === "title") await copyPlainText(data.title);
      else await copyRichHtml(data.html, data.text);
      setCopied(kind);
      setTimeout(() => setCopied((k) => (k === kind ? "" : k)), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "복사하지 못했어요.");
    }
  };

  if (typeof document === "undefined") return null;

  const stepBtn =
    "flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="naver-copy-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-background shadow-2xl dark:border-zinc-700">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 id="naver-copy-title" className="flex items-center gap-2 font-bold">
            <span className="rounded bg-[#03C75A] px-1.5 text-xs font-extrabold text-white">N</span>
            네이버 블로그용 복사
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <ol className="grid gap-2 border-b border-zinc-200 px-5 py-4 text-sm dark:border-zinc-800 sm:grid-cols-3">
          <li className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-500">① 글쓰기 창 열기</span>
            <a
              href={NAVER_WRITE_URL}
              target="_blank"
              rel="noopener"
              className={`${stepBtn} border border-[#03C75A] text-[#03C75A] hover:bg-[#03C75A]/10`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              네이버 글쓰기
            </a>
          </li>
          <li className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-500">② 제목칸에 붙여넣기</span>
            <button
              type="button"
              onClick={() => copy("title")}
              disabled={!data}
              className={`${stepBtn} border border-zinc-300 hover:border-zinc-400 dark:border-zinc-700`}
            >
              {copied === "title" ? (
                <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              ) : (
                <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied === "title" ? "복사됨" : "제목 복사"}
            </button>
          </li>
          <li className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-500">③ 본문칸에 붙여넣기</span>
            <button
              type="button"
              onClick={() => copy("body")}
              disabled={!data}
              className={`${stepBtn} bg-[#03C75A] text-white hover:bg-[#02b350]`}
            >
              {copied === "body" ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied === "body"
                ? "복사됨"
                : `본문 복사${data?.imageUrls.length ? ` (사진 ${data.imageUrls.length}장)` : ""}`}
            </button>
          </li>
        </ol>

        <p className="px-5 pt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          본문을 붙여넣으면 네이버가 사진을 자기 서버로 옮기느라 몇 초 걸릴 수 있어요.
          사진이 회색으로 보이면 잠시 기다려 주세요.
        </p>
        <div aria-live="polite" className="min-h-[1.5rem] px-5 pt-1 text-sm">
          {error && <span className="text-red-500">{error}</span>}
          {!error && copied === "title" && (
            <span className="text-emerald-600">제목을 복사했어요 — 네이버 제목칸에 Cmd+V</span>
          )}
          {!error && copied === "body" && (
            <span className="text-emerald-600">본문을 복사했어요 — 네이버 본문칸을 클릭하고 Cmd+V</span>
          )}
        </div>

        {/* 미리보기 — 네이버 본문과 비슷하게 흰 바탕에 보여준다 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {!data && !error && <p className="py-10 text-center text-sm text-zinc-500">본문을 정리하는 중…</p>}
          {data && (
            <article className="rounded-xl border border-zinc-200 bg-white px-6 py-6 text-[15px] leading-[1.8] text-zinc-800 [&_a]:text-[#03C75A] [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-bold [&_hr]:my-6 [&_img]:mx-auto [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6">
              <p className="mb-5 border-b border-zinc-200 pb-4 text-2xl font-bold text-zinc-900">
                {data.title}
              </p>
              <div dangerouslySetInnerHTML={{ __html: data.html }} />
            </article>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
