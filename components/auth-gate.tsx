"use client";

// 첫 화면 구글 로그인 게이트 — 로그인 후에만 포털이 보인다.
// 정적 사이트 특성상 UI 게이트이며, 민감 데이터 보호용이 아니다.
import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

type Status = "loading" | "in" | "out";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setStatus(user ? "in" : "out");
      setEmail(user?.email ?? "");
    });
    return unsub;
  }, []);

  const login = async () => {
    setErr("");
    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    }
  };

  const logout = () => signOut(getFirebaseAuth());

  if (status === "in") {
    return (
      <>
        {children}
        <button
          type="button"
          onClick={logout}
          title={email}
          className="fixed bottom-3 left-3 z-40 rounded-full border border-zinc-300 bg-background/80 px-3 py-1.5 text-xs text-zinc-500 backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700 dark:text-zinc-400"
        >
          🚪 로그아웃
        </button>
      </>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle,rgba(0,0,0,0.04)_1px,transparent_1px)] [background-size:24px_24px] dark:hidden"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-background/90 p-10 text-center shadow-xl backdrop-blur dark:border-zinc-800">
        <div className="text-5xl" aria-hidden="true">
          🌏
        </div>
        <h1 className="mt-4 bg-gradient-to-r from-teal-300 via-sky-300 to-violet-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          25WORLD
        </h1>
        {status === "loading" ? (
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
            로그인 상태 확인 중…
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              바이브코딩 포털에 입장하려면
              <br />
              구글 계정으로 로그인하세요.
            </p>
            <Button onClick={login} className="mt-6 w-full gap-2.5" size="lg">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Google 계정으로 로그인
            </Button>
            {err && (
              <p className="mt-4 text-xs text-red-400" role="alert">
                {err}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
