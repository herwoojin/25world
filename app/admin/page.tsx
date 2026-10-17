"use client";

// 관리자 콘솔 — 메인 페이지에서 떼어낸 별도 페이지.
//
// 왜 나눴나: 관리자 패널(회원 목록·사이트 설정·자료실 설정)이 메인 페이지에 함께
// 들어 있으면, 관리자가 아닌 일반 방문자의 브라우저도 그 코드를 전부 내려받는다.
// 별도 경로로 옮기면 메인 페이지 번들에서 빠져 첫 화면이 가벼워지고, 관리자도
// 무거운 메인 화면 위가 아니라 이 페이지에서 작업하게 된다.
//
// 여기로 못 옮긴 것(글 하나·파일 하나에 붙는 작업)은 현장에 그대로 두고,
// 관리자 모드일 때만 보이게 했다. 아래 "현장에서 하는 작업" 안내 참고.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, FolderCog, LayoutGrid, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyAdminKey } from "@/components/admin-button";
import { ADMIN_EVENT, clearAdminKey, getAdminKey } from "@/lib/admin";

const Loading = () => (
  <p className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800">
    불러오는 중…
  </p>
);

// 탭을 누를 때 그 패널만 내려받는다 (관리자 페이지 자체도 가볍게)
const MemberAdmin = dynamic(() => import("@/components/member-admin"), {
  ssr: false,
  loading: Loading,
});
const SiteAdmin = dynamic(() => import("@/components/site-admin"), {
  ssr: false,
  loading: Loading,
});
const LibrarySettings = dynamic(
  () => import("@/components/admin/library-settings"),
  { ssr: false, loading: Loading }
);

type Tab = "members" | "sites" | "library";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "members", label: "회원 등급", icon: Users },
  { id: "sites", label: "사이트 · 카테고리", icon: LayoutGrid },
  { id: "library", label: "자료실 설정", icon: FolderCog },
];

/** 관리자 모드가 아닐 때 보여주는 로그인 */
function AdminLogin({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (await verifyAdminKey(id, pw)) onDone();
      else setError("관리자 아이디 또는 비밀번호가 올바르지 않습니다.");
    } catch {
      setError("검증 요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700";

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-10 w-full max-w-sm space-y-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-5"
    >
      <h1 className="text-base font-bold text-amber-500">🔐 관리자 로그인</h1>
      <input
        type="text"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="관리자 아이디"
        autoComplete="username"
        className={inputCls}
      />
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="관리자 비밀번호"
        autoComplete="current-password"
        className={inputCls}
      />
      <Button type="submit" disabled={busy || !id.trim() || !pw.trim()} className="w-full">
        {busy ? "확인 중…" : "관리자 모드로 들어가기"}
      </Button>
      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
      <Link
        href="/"
        className="block text-center text-xs text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← 25WORLD 로 돌아가기
      </Link>
    </form>
  );
}

export default function AdminPage() {
  const [on, setOn] = useState<boolean | null>(null); // null = 아직 확인 전
  const [tab, setTab] = useState<Tab>("members");

  useEffect(() => {
    const sync = () => setOn(Boolean(getAdminKey()));
    sync();
    window.addEventListener(ADMIN_EVENT, sync);
    return () => window.removeEventListener(ADMIN_EVENT, sync);
  }, []);

  if (on === null) return <main className="p-8" />;
  if (!on)
    return (
      <main className="mx-auto max-w-6xl px-4 pb-32 pt-8">
        <AdminLogin onDone={() => setOn(true)} />
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pb-32 pt-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          <span aria-hidden="true">🔓</span> 관리자 콘솔
        </h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              사이트로
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearAdminKey();
              setOn(false);
            }}
          >
            <LogOut className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            관리자 모드 해제
          </Button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="관리 항목"
        className="flex flex-wrap gap-1.5 border-b border-zinc-200 pb-2 dark:border-zinc-800"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === id
                ? "bg-amber-400 text-black"
                : "text-zinc-500 hover:text-foreground dark:text-zinc-400"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "members" && <MemberAdmin />}
      {tab === "sites" && <SiteAdmin />}
      {tab === "library" && <LibrarySettings />}

      {/* 이 페이지로 옮길 수 없는 작업 안내 — 글·파일 하나하나에 붙는 기능들 */}
      <section className="rounded-xl border border-zinc-200 bg-background/60 p-4 text-sm dark:border-zinc-800">
        <h2 className="font-semibold">현장에서 하는 작업</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          아래는 글·파일 하나하나에 붙는 기능이라 목록 옆에 있어야 합니다. 관리자
          모드가 켜져 있으면 해당 위치에서 바로 보입니다.
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <li>
            ·{" "}
            <Link href="/#blog" className="font-semibold text-foreground underline-offset-4 hover:underline">
              블로그
            </Link>{" "}
            — 새 글 등록, 제목 수정·삭제, VIP 지정 (네이버 블로그용 복사는 모든 회원에게 열림)
          </li>
          <li>
            ·{" "}
            <Link href="/#library" className="font-semibold text-foreground underline-offset-4 hover:underline">
              자료실
            </Link>{" "}
            — 파일 업로드·삭제, VIP 지정, 한시적 무료 기간 설정
          </li>
          <li>
            ·{" "}
            <Link href="/" className="font-semibold text-foreground underline-offset-4 hover:underline">
              카테고리 사이트 카드
            </Link>{" "}
            — 사이트별 핵심 내용 메모, GIT 코드 · 프롬프트 자료 올리기
          </li>
        </ul>
      </section>
    </main>
  );
}
