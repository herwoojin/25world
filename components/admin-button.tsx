"use client";

// 관리자 모드 토글 — Apps Script 의 ADMIN_KEY 와 대조해 검증한다.
// 키는 sessionStorage 에만 보관 (탭 닫으면 해제)
//
// 관리자 화면은 /admin 별도 페이지에 있다. 이 버튼은 들어가는 문 역할만 한다 —
// 관리 UI 를 메인 페이지에 두지 않아야 일반 방문자의 첫 화면이 가벼워진다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BLOG_WEBAPP_URL } from "@/lib/firebase";
import {
  ADMIN_EVENT,
  clearAdminKey,
  getAdminKey,
  setAdminKey,
} from "@/lib/admin";

/** 아이디·비밀번호를 서버와 대조하고, 맞으면 관리자 모드를 켠다 */
export async function verifyAdminKey(id: string, pw: string): Promise<boolean> {
  const key = `${id.trim()}:${pw.trim()}`;
  // Content-Type 미지정(text/plain) → Apps Script CORS preflight 회피
  const res = await fetch(BLOG_WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify({ action: "verify", adminKey: key }),
  });
  const text = await res.text();
  if (!text.includes("ok")) return false;
  setAdminKey(key);
  return true;
}

export default function AdminButton() {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => setOn(Boolean(getAdminKey()));
    sync();
    // 외부에서 해제될 때(로그아웃/계정전환)도 버튼 상태를 동기화
    window.addEventListener(ADMIN_EVENT, sync);
    return () => window.removeEventListener(ADMIN_EVENT, sync);
  }, []);

  const toggle = async () => {
    if (busy) return;
    if (on) {
      clearAdminKey();
      setOn(false);
      return;
    }
    const id = window.prompt("관리자 아이디");
    if (!id) return;
    const pw = window.prompt("관리자 비밀번호");
    if (!pw) return;
    setBusy(true);
    try {
      if (await verifyAdminKey(id, pw)) {
        setOn(true);
        router.push("/admin"); // 관리 작업은 별도 페이지에서
      } else {
        window.alert("관리자 키가 올바르지 않습니다.");
      }
    } catch {
      window.alert("검증 요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const round =
    "flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-lg ring-1 backdrop-blur transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  // 우측 하단 고정 — 관리자 모드일 때는 관리자 페이지 바로가기가 위에 함께 뜬다
  return (
    <div
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      className="fixed right-3 z-50 flex flex-col-reverse items-center gap-2"
    >
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-label={on ? "관리자 모드 해제" : "관리자 로그인"}
        title={on ? "관리자 모드 해제" : "관리자 로그인"}
        className={`${round} disabled:opacity-50 ${
          on
            ? "bg-amber-400 text-black ring-amber-300 hover:bg-amber-300"
            : "bg-background/80 text-zinc-500 ring-zinc-300 hover:text-foreground dark:ring-zinc-700"
        }`}
      >
        {busy ? "…" : on ? "🔓" : "🔐"}
      </button>

      {on && (
        <Link
          href="/admin"
          aria-label="관리자 페이지"
          title="관리자 페이지"
          className={`${round} bg-background/80 text-zinc-500 ring-zinc-300 hover:text-foreground dark:ring-zinc-700`}
        >
          ⚙️
        </Link>
      )}
    </div>
  );
}
