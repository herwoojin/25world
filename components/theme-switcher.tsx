"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Scroll } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "paper";

const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "주간 모드", Icon: Sun },
  { id: "dark", label: "야간 모드", Icon: Moon },
  { id: "paper", label: "종이재질 모드", Icon: Scroll },
];

export default function ThemeSwitcher() {
  // 마운트 후 <html> 클래스에서 현재 테마 동기화 (SSR 불일치 방지)
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const c = document.documentElement.classList;
    setTheme(c.contains("paper") ? "paper" : c.contains("dark") ? "dark" : "light");
  }, []);

  const apply = (t: Theme) => {
    const c = document.documentElement.classList;
    c.remove("dark", "paper");
    if (t !== "light") c.add(t);
    try {
      localStorage.setItem("25world:theme", t);
    } catch {}
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
