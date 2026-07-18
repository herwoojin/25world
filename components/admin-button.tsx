"use client";

// 관리자 모드 토글 — Apps Script 의 ADMIN_KEY 와 대조해 검증한다.
// 키는 sessionStorage 에만 보관 (탭 닫으면 해제)
import { useEffect, useState } from "react";
import { BLOG_WEBAPP_URL } from "@/lib/firebase";

export const ADMIN_EVENT = "25world:admin-changed";

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem("25world:adminKey") || "";
  } catch {
    return "";
  }
}

/** 관리자 모드 강제 해제 — 로그아웃/계정 전환 시 호출한다 */
export function clearAdminKey(): void {
  try {
    if (!sessionStorage.getItem("25world:adminKey")) return;
    sessionStorage.removeItem("25world:adminKey");
  } catch {
    return;
  }
  window.dispatchEvent(new Event(ADMIN_EVENT));
}

/** 관리자 모드 on/off 를 구독하는 훅 */
export function useAdminOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(Boolean(getAdminKey()));
    sync();
    window.addEventListener(ADMIN_EVENT, sync);
    return () => window.removeEventListener(ADMIN_EVENT, sync);
  }, []);
  return on;
}

export default function AdminButton() {
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
      try {
        sessionStorage.removeItem("25world:adminKey");
      } catch {}
      setOn(false);
      window.dispatchEvent(new Event(ADMIN_EVENT));
      return;
    }
    const id = window.prompt("관리자 아이디");
    if (!id) return;
    const pw = window.prompt("관리자 비밀번호");
    if (!pw) return;
    const key = `${id.trim()}:${pw.trim()}`;
    setBusy(true);
    try {
      // Content-Type 미지정(text/plain) → Apps Script CORS preflight 회피
      const res = await fetch(BLOG_WEBAPP_URL, {
        method: "POST",
        body: JSON.stringify({ action: "verify", adminKey: key }),
      });
      const text = await res.text();
      if (text.includes("ok")) {
        try {
          sessionStorage.setItem("25world:adminKey", key);
        } catch {}
        setOn(true);
        window.dispatchEvent(new Event(ADMIN_EVENT));
      } else {
        window.alert("관리자 키가 올바르지 않습니다.");
      }
    } catch {
      window.alert("검증 요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  // 우측 하단 고정 동그란 버튼 — 관리자 로그인 / 해제 토글
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={on ? "관리자 모드 해제" : "관리자 로그인"}
      title={on ? "관리자 모드 해제" : "관리자 로그인 (admin / 2525)"}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      className={`fixed right-3 z-50 flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-lg ring-1 backdrop-blur transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
        on
          ? "bg-amber-400 text-black ring-amber-300 hover:bg-amber-300"
          : "bg-background/80 text-zinc-500 ring-zinc-300 hover:text-foreground dark:ring-zinc-700"
      }`}
    >
      {busy ? "…" : on ? "🔓" : "🔐"}
    </button>
  );
}
