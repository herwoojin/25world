"use client";

// 카드뉴스 카드 — 본문의 첫 이미지 + 첫 제목 + 카테고리 배지
import { useEffect, useRef, useState } from "react";
import { extractPreview, fetchPostHtml, formatKST } from "@/lib/posts";
import { blogCat } from "@/lib/blog-categories";
import type { Preview } from "@/lib/previews";

interface PostCardProps {
  id: string;
  title: string;
  savedAt: string;
  /** 서버가 만든 미리보기 (없으면 본문에서 직접 추출) */
  preview?: Preview;
  /** 관리자가 VIP(유료 전용)로 지정한 글 — 배지 표시 */
  vip?: boolean;
  /** 현재 사용자가 이 글을 열 수 없음 (VIP 글 + 비유료 회원) */
  locked?: boolean;
  children?: React.ReactNode; // 액션 버튼(음성·하트·다운로드·관리자)
}

export default function PostCard({
  id,
  title,
  savedAt,
  preview,
  vip,
  locked,
  children,
}: PostCardProps) {
  const [fallback, setFallback] = useState<Preview | null>(null);
  const ref = useRef<HTMLElement>(null);
  const hasPreview = Boolean(preview?.image || preview?.heading);

  // 서버 미리보기가 없을 때만 본문에서 추출 (화면에 들어올 때)
  useEffect(() => {
    if (hasPreview) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        fetchPostHtml(id).then((html) => {
          if (html)
            setFallback({ ...extractPreview(html), category: null } as Preview);
        });
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, hasPreview]);

  const p = hasPreview ? preview! : fallback;
  const heading = p?.heading || title;
  const cat = blogCat(preview?.category);

  // 잠긴 글은 링크 대신 클릭 불가 래퍼로 감싼다 (목록에는 그대로 보이되 열리지 않음)
  const inner = (
    <>
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {p?.image ? (
          // 본문 첫 이미지 (대부분 data URI) — 정적 내보내기 호환을 위해 img 사용
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image}
            alt=""
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-300 ${
              locked ? "" : "group-hover:scale-105"
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">
            📮
          </div>
        )}
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-zinc-900 shadow"
          style={{ backgroundColor: cat.color }}
        >
          {cat.emoji} {cat.name}
        </span>
        {vip && (
          <span className="absolute right-2 top-2 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-black shadow">
            VIP
          </span>
        )}
        {locked && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-bold text-white">
            🔒 유료회원 전용
          </span>
        )}
      </div>
      <div className="p-3">
        <h3
          className={`line-clamp-2 text-sm font-bold leading-snug ${
            locked ? "" : "group-hover:underline"
          }`}
        >
          {heading}
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {formatKST(savedAt)}
        </p>
      </div>
    </>
  );

  return (
    <article
      ref={ref}
      className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-background/60 transition-shadow hover:shadow-lg dark:border-zinc-800"
    >
      {locked ? (
        <div
          aria-disabled="true"
          title="유료회원 이상만 열 수 있는 글입니다"
          className="block cursor-not-allowed"
        >
          {inner}
        </div>
      ) : (
        <a
          href={`/post?id=${encodeURIComponent(id)}`}
          target="_blank"
          rel="noopener"
          title="새 탭에서 읽기"
          className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {inner}
        </a>
      )}
      {children && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          {children}
        </div>
      )}
    </article>
  );
}
