"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Moon, BookOpen } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { cn } from "@/lib/utils";
import { getFirebaseAuth } from "@/lib/firebase";
import { saveUserTheme, loadUserTheme } from "@/lib/membership";

type Theme = "light" | "dark" | "paper";

const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "주간 모드", Icon: Sun },
  { id: "dark", label: "야간 모드", Icon: Moon },
  { id: "paper", label: "E-ink 전자책 모드 (흑백·눈부심 없음)", Icon: BookOpen },
];

export default function ThemeSwitcher() {
  // 마운트 후 <html> 클래스에서 현재 테마 동기화 (SSR 불일치 방지)
  const [theme, setTheme] = useState<Theme | null>(null);

  // 방금 사용자가 직접 고른 테마 — 로그인 복원이 이걸 덮어쓰지 않도록 지킨다
  const localChoice = useRef(false);

  useEffect(() => {
    const c = document.documentElement.classList;
    const current: Theme = c.contains("paper") ? "paper" : c.contains("dark") ? "dark" : "light";
    setTheme(current);

    // Firestore에 저장된 테마 동기화 (cross-device).
    // 마운트 직후에는 Firebase 세션 복원이 끝나지 않아 currentUser가 null 이므로,
    // 로그인 상태가 확정되는 시점(onAuthStateChanged)에 불러온다.
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (!user || localChoice.current) return;
      loadUserTheme()
        .then((saved) => {
          if (localChoice.current || !saved) return;
          const cls = document.documentElement.classList;
          const now: Theme = cls.contains("paper")
            ? "paper"
            : cls.contains("dark")
            ? "dark"
            : "light";
          if (saved === now) return;
          cls.remove("dark", "paper");
          if (saved !== "light") cls.add(saved);
          try {
            localStorage.setItem("25world:theme", saved);
          } catch {}
          setTheme(saved);
          window.dispatchEvent(new Event("25world:theme-changed"));
        })
        .catch(() => {});
    });
    return () => unsub();
  }, []);

  const apply = (t: Theme) => {
    localChoice.current = true; // 사용자가 직접 골랐으니 로그인 복원이 덮지 않게
    const c = document.documentElement.classList;
    c.remove("dark", "paper");
    if (t !== "light") c.add(t);
    try {
      localStorage.setItem("25world:theme", t);
    } catch {}
    // Firestore에도 저장 (다른 기기 동기화)
    saveUserTheme(t).catch(() => {});
    setTheme(t);
    window.dispatchEvent(new Event("25world:theme-changed"));
  };

  return (
    <div
      role="group"
      aria-label="화면 모드 선택"
      className="flex items-center gap-1 rounded-full border border-zinc-300 p-1 dark:border-zinc-700"
    >
      {THEMES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => apply(id)}
          aria-pressed={theme === id}
          title={label}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            theme === id
              ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
