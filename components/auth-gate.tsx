"use client";

// 첫 화면 구글 로그인 게이트 — 로그인 후에만 포털이 보인다.
// 디자인 레퍼런스: hero-02 (GradientWave 배경 + 대형 타이포 + 아이콘 스택 + 마퀴)
// 외부 CDN 로고/이미지 대신 25world 자체 사이트 아이콘을 사용한다.
import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { upsertUserProfile } from "@/lib/membership";
import { clearAdminKey } from "@/components/admin-button";
import { GradientWave } from "@/components/ui/gradient-wave";
import { Button } from "@/components/ui/button";
import { CATEGORIES, SITES, getCategoryColor } from "@/lib/sites";

type Status = "loading" | "in" | "out";

const STACK = SITES.filter((_, i) => i % 3 === 0).slice(0, 6);

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** 사이트 아이콘 원형 칩 (레퍼런스의 로고 스택 대체) */
function SiteChip({ svg, color }: { svg: string; color: string }) {
  return (
    <span
      style={{ color }}
      className="flex h-16 w-16 items-center justify-center rounded-full border bg-white shadow-2xl sm:h-20 sm:w-20"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8 sm:h-9 sm:w-9"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </span>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  // 직전 로그인 uid — 계정이 바뀌거나 로그아웃하면 관리자 모드를 강제 해제한다
  const lastUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      const uid = user?.uid ?? null;
      // 최초 콜백(undefined)은 기록만. 이후 uid 가 달라지면(전환/로그아웃) 관리자 해제.
      if (lastUid.current !== undefined && lastUid.current !== uid) {
        clearAdminKey();
      }
      lastUid.current = uid;

      setStatus(user ? "in" : "out");
      setEmail(user?.email ?? "");
      // 로그인 사용자를 회원 명부(users/{uid})에 등록/갱신 — 등급 관리의 기반
      if (user) upsertUserProfile(user).catch(() => {});
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

  if (status === "in") {
    return (
      <>
        {children}
        {/* 로그인 계정 표시 — 기기마다 같은 계정인지 바로 확인할 수 있게 */}
        <button
          type="button"
          onClick={() => signOut(getFirebaseAuth())}
          title={`${email} — 클릭하면 로그아웃`}
          className="fixed bottom-3 left-3 z-40 flex max-w-[70vw] items-center gap-1.5 rounded-full border border-zinc-300 bg-background/80 px-3 py-1.5 text-xs text-zinc-500 backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700 dark:text-zinc-400"
        >
          <span aria-hidden="true">🚪</span>
          <span className="truncate">{email || "로그아웃"}</span>
        </button>
      </>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <GradientWave
        colors={["#17E9C0", "#ffffff", "#4DA3FF", "#ffffff", "#A78BFA", "#ffffff"]}
        className="opacity-60 dark:opacity-20"
      />

      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
        {/* 상단 바 */}
        <div className="absolute inset-x-0 top-4 z-20 flex items-center justify-between px-6">
          <span className="text-sm font-bold tracking-tight">🌏 25WORLD</span>
          <Button onClick={login} className="rounded-full" size="sm">
            로그인
          </Button>
        </div>

        {/* 메인 카드 */}
        <div className="z-10 mx-auto flex w-full max-w-5xl flex-col space-y-10 rounded-xl border p-8 shadow-2xl backdrop-blur-sm sm:p-12 lg:p-16">
          <div className="flex flex-col items-center justify-center gap-5 lg:flex-row lg:gap-10">
            <h1 className="text-center text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
              25WORLD
            </h1>
            <p className="max-w-md text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 lg:text-left">
              바이브코딩으로 직접 만든 {SITES.length}개의 사이트를 한 곳에서.
              편의점 업무부터 AI 에이전트, 공공데이터, 콘텐츠 제작까지 —
              구글 계정으로 로그인하고 둘러보세요.
            </p>
          </div>

          {/* 사이트 아이콘 스택 */}
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-10">
            <div className="flex flex-wrap justify-center -space-x-5 -space-y-2">
              {STACK.map((site) => (
                <SiteChip
                  key={site.id}
                  svg={site.icon}
                  color={getCategoryColor(site.cat)}
                />
              ))}
            </div>
            <h2 className="text-center text-2xl font-bold tracking-tight md:text-4xl lg:text-5xl">
              Vibe-coded
            </h2>
          </div>

          {/* 로그인 CTA */}
          <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-end">
            <h2 className="text-center text-2xl font-bold tracking-tight underline decoration-2 underline-offset-8 md:text-4xl lg:text-5xl">
              들어가기
            </h2>
            {status === "loading" ? (
              <p className="text-sm text-zinc-500">로그인 상태 확인 중…</p>
            ) : (
              <Button
                onClick={login}
                className="h-14 gap-3 rounded-full px-10 text-base sm:h-16 sm:px-16"
              >
                <GoogleIcon />
                Google 계정으로 로그인
              </Button>
            )}
          </div>

          {err && (
            <p className="text-center text-xs text-red-400" role="alert">
              로그인 실패: {err}
            </p>
          )}
        </div>

        {/* 카테고리 마퀴 */}
        <div className="relative z-10 mt-12 w-full">
          <p className="mb-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {CATEGORIES.length}개 카테고리로 정리된 프로젝트 모음
          </p>
          <div className="group flex overflow-hidden [--gap:1.5rem] [gap:var(--gap)]">
            {[0, 1, 2].map((r) => (
              <div
                key={r}
                aria-hidden={r > 0}
                className="flex shrink-0 animate-marquee justify-around [gap:var(--gap)] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
              >
                {CATEGORIES.map((cat) => {
                  const count = SITES.filter((s) => s.cat === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      className="flex min-w-[220px] items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-md"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-lg shadow"
                        style={{ color: cat.color }}
                        aria-hidden="true"
                      >
                        {cat.emoji}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-sm font-bold">{cat.name}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {count}개 사이트
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
