"use client";

// 주간 모드 전역 배경 — 로그인 화면과 같은 그라디언트 웨이브.
// 다크/종이 모드에서는 렌더하지 않는다 (다크는 StarField 가 담당).
import { useEffect, useState } from "react";
import { GradientWave } from "@/components/ui/gradient-wave";

export const THEME_EVENT = "25world:theme-changed";

export default function DayWave() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const sync = () => {
      const c = document.documentElement.classList;
      setLight(!c.contains("dark") && !c.contains("paper"));
    };
    sync();
    window.addEventListener(THEME_EVENT, sync);
    // 다른 경로로 클래스가 바뀌는 경우까지 커버
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      mo.disconnect();
    };
  }, []);

  if (!light) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 opacity-50"
    >
      <GradientWave
        colors={["#17E9C0", "#ffffff", "#4DA3FF", "#ffffff", "#A78BFA", "#ffffff"]}
      />
    </div>
  );
}
