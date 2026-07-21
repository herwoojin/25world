"use client";

// 글 단독 보기 페이지 — /post?id={글ID}
// 블로그 목록에서 새 탭으로 열리며, 주소를 복사해 공유할 수도 있다.
// 상단 바의 "목록으로"/"닫기"로 언제든 25WORLD 로 돌아갈 수 있다.
import { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { fetchPostHtml } from "@/lib/posts";

export default function PostPage() {
  // undefined = 로딩 중, null = 없음, string = 본문
  const [html, setHtml] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setHtml(null);
      return;
    }
    fetchPostHtml(id).then(setHtml);
  }, []);

  // 새 탭으로 열렸으면 탭을 닫고, 안 닫히면(직접 접속 등) 목록으로 이동
  const closeOrHome = () => {
    window.close();
    setTimeout(() => {
      window.location.href = "/#blog";
    }, 150);
  };

  if (html === undefined) {
    return (
      <p className="p-10 text-center text-sm text-zinc-500">
        글을 불러오는 중…
      </p>
    );
  }
  if (html === null) {
    return (
      <p className="p-10 text-center text-sm text-zinc-500">
        본문을 찾을 수 없습니다.{" "}
        <a href="/#blog" className="underline">
          블로그 목록으로 →
        </a>
      </p>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#FAF8F2]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3 shadow-sm">
        <a
          href="/#blog"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          25WORLD 목록으로
        </a>
        <button
          type="button"
          onClick={closeOrHome}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          닫기
        </button>
      </header>
      <iframe
        id="post-body"
        sandbox=""
        srcDoc={html}
        title="글 본문"
        className="w-full flex-1 border-0 bg-[#FAF8F2]"
      />
    </div>
  );
}
