"use client";

// 카카오 로그인 콜백 — /kakao?code=...
// 카카오 인증 후 이 페이지로 돌아온다. code 를 백엔드로 넘겨 Firebase 커스텀
// 토큰을 받고 로그인한 뒤 홈으로 이동한다.
import { useEffect, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { exchangeKakaoCode } from "@/lib/kakao";

export default function KakaoCallback() {
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code");
    const err = q.get("error");
    if (err || !code) {
      setError(err ? `카카오 인증이 취소되었습니다 (${err}).` : "인증 코드가 없습니다.");
      return;
    }
    (async () => {
      try {
        const token = await exchangeKakaoCode(code);
        await signInWithCustomToken(getFirebaseAuth(), token);
        window.location.replace("/"); // 로그인 완료 → 포털로
      } catch (e) {
        setError(e instanceof Error ? e.message : "카카오 로그인에 실패했습니다.");
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">
            ⚠️
          </div>
          <p className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
            카카오 로그인 실패
          </p>
          <p className="max-w-sm text-sm text-zinc-500">{error}</p>
          <a
            href="/"
            className="mt-1 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            처음으로 돌아가기 →
          </a>
        </>
      ) : (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800" />
          <p className="text-sm text-zinc-500">카카오 로그인 처리 중…</p>
        </>
      )}
    </div>
  );
}
