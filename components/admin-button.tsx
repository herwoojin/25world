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

export default function AdminButton() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOn(Boolean(getAdminKey()));
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

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-zinc-400"
    >
      {busy ? "확인 중…" : on ? "🔓 관리자 해제" : "🔐 관리자"}
    </button>
  );
}
