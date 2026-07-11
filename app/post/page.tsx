"use client";

// 글 단독 보기 페이지 — /post?id={글ID}
// 블로그 목록에서 새 탭으로 열리며, 주소를 복사해 공유할 수도 있다.
import { useEffect, useState } from "react";
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
    <iframe
      sandbox=""
      srcDoc={html}
      title="글 본문"
      className="fixed inset-0 z-50 h-full w-full border-0 bg-[#FAF8F2]"
    />
  );
}
