"use client";

// 밤하늘 별 배경 — 레퍼런스 이미지의 딥 네이비 그라디언트 + 흩어진 별.
// 다크 모드에서만 표시. 별은 마운트 후 생성해 SSR 불일치를 피한다.
import { useEffect, useState } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
  twinkle: boolean;
}

export default function StarField() {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    setStars(
      Array.from({ length: 160 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 1.6 + 0.7,
        opacity: Math.random() * 0.45 + 0.15,
        delay: Math.random() * 5,
        duration: Math.random() * 3 + 3,
        twinkle: Math.random() < 0.45,
      }))
    );
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 hidden bg-[radial-gradient(120%_100%_at_30%_0%,#111C31_0%,#0C1424_55%,#080D18_100%)] dark:block"
    >
      {stars.map((s, i) => (
        <span
          key={i}
          className={`absolute rounded-full bg-white ${
            s.twinkle ? "animate-twinkle motion-reduce:animate-none" : ""
          }`}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: s.opacity,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
