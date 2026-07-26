"use client";

// 글 단독 보기 페이지 — /post?id={글ID}
// 블로그 목록에서 새 탭으로 열리며, 주소를 복사해 공유할 수도 있다.
// 상단 바의 "목록으로"/"닫기"로 언제든 25WORLD 로 돌아갈 수 있다.
import { useEffect, useState } from "react";
import { ArrowLeft, Lock, X } from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { fetchPostHtml } from "@/lib/posts";
import { getFirebaseApp, getFirebaseAuth } from "@/lib/firebase";
import { useMyProfile } from "@/lib/membership";
import { useAdminOn } from "@/components/admin-button";

export default function PostPage() {
  // undefined = 로딩 중, null = 없음, string = 본문
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  // 이 글이 유료 전용(VIP)으로 지정됐는가 (previews/{id}.paid)
  const [paidPost, setPaidPost] = useState(false);
  // 로그인 상태 확정 여부 — 유료회원이 자기 글을 열 때 잠금이 깜빡이지 않게 한다
  const [authUser, setAuthUser] = useState<User | null | undefined>(undefined);

  const profile = useMyProfile();
  const adminOn = useAdminOn();
  const group = adminOn ? "admin" : profile?.group ?? "general";
  const paidUp = group === "paid" || group === "vip" || group === "admin";

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => setAuthUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setHtml(null);
      return;
    }
    fetchPostHtml(id).then(setHtml);
    // 유료 전용 지정 여부 확인
    getDoc(doc(getFirestore(getFirebaseApp()), "previews", id))
      .then((s) => setPaidPost(s.data()?.paid === true))
      .catch(() => {});
  }, []);

  // 새 탭으로 열렸으면 탭을 닫고, 안 닫히면(직접 접속 등) 목록으로 이동
  const closeOrHome = () => {
    window.close();
    setTimeout(() => {
      window.location.href = "/#blog";
    }, 150);
  };

  // 등급 확정 시점: 로그인 안 됨(authUser=null)이거나, 로그인+프로필 로드 완료
  const groupReady =
    adminOn || authUser === null || (Boolean(authUser) && profile !== null);
  const locked = paidPost && groupReady && !paidUp;

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
      {locked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Lock className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="text-lg font-bold text-zinc-800">
            유료회원 전용 글입니다
          </p>
          <p className="max-w-sm text-sm text-zinc-500">
            이 글은 관리자가 유료 전용(VIP)으로 지정했습니다. 유료회원 이상으로
            로그인하면 바로 읽을 수 있어요.
          </p>
          <a
            href="/#blog"
            className="mt-1 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            블로그 목록으로 →
          </a>
        </div>
      ) : (
        <iframe
          id="post-body"
          sandbox=""
          srcDoc={html}
          title="글 본문"
          className="w-full flex-1 border-0 bg-[#FAF8F2]"
        />
      )}
    </div>
  );
}
