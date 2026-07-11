"use client";

// 카드뉴스 카드 — 본문의 첫 이미지 + 첫 제목을 보여준다.
// 미리보기는 Firestore `previews/{id}` 에서 읽고, 없으면 본문 HTML에서 직접 추출(폴백).
import { useEffect, useRef, useState } from "react";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase";
import { extractPreview, fetchPostHtml, type PostPreview } from "@/lib/posts";

// 같은 세션에서 재조회 방지
const cache = new Map<string, PostPreview>();

async function loadPreview(id: string): Promise<PostPreview> {
  const hit = cache.get(id);
  if (hit) return hit;

  let preview: PostPreview = { image: null, heading: null, excerpt: null };
  try {
    const snap = await getDoc(doc(getFirestore(getFirebaseApp()), "previews", id));
    if (snap.exists()) {
      const d = snap.data();
      preview = {
        image: d.image ?? null,
        heading: d.heading ?? null,
        excerpt: d.excerpt ?? null,
      };
    }
  } catch {}

  // 서버 미리보기가 없으면 본문에서 직접 추출
  if (!preview.image && !preview.heading) {
    const html = await fetchPostHtml(id);
    if (html) preview = extractPreview(html);
  }

  cache.set(id, preview);
  return preview;
}

interface PostCardProps {
  id: string;
  title: string;
  savedAt: string;
  children?: React.ReactNode; // 액션 버튼(음성·하트·다운로드·관리자)
}

export default function PostCard({ id, title, savedAt, children }: PostCardProps) {
  const [preview, setPreview] = useState<PostPreview | null>(null);
  const ref = useRef<HTMLElement>(null);

  // 화면에 들어올 때만 로드 (본문 폴백이 무거울 수 있으므로)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          io.disconnect();
          loadPreview(id).then(setPreview);
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id]);

  const heading = preview?.heading || title;

  return (
    <article
      ref={ref}
      className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-background/60 transition-shadow hover:shadow-lg dark:border-zinc-800"
    >
      <a
        href={`/post?id=${encodeURIComponent(id)}`}
        target="_blank"
        rel="noopener"
        title="새 탭에서 읽기"
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          {preview?.image ? (
            // 본문 첫 이미지 (대부분 data URI) — next/image 불가, 정적 내보내기 호환
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.image}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">
              📮
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:underline">
            {heading}
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {savedAt.replace("T", " ").slice(0, 16)}
          </p>
        </div>
      </a>
      {children && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          {children}
        </div>
      )}
    </article>
  );
}
