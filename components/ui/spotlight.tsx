"use client";

// 마우스를 따라다니는 스포트라이트 글로우.
// 레퍼런스(ibelick/spotlight)는 framer-motion 의 useSpring 을 쓰지만,
// 이 효과 하나 때문에 번들을 키울 이유가 없어 CSS transition 으로 같은 감속을 낸다.
// 부모 요소는 position: relative + overflow-hidden 이어야 한다.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SpotlightProps {
  className?: string;
  size?: number;
  /** 글로우 색 (기본 흰색) */
  fill?: string;
}

export function Spotlight({
  className,
  size = 320,
  fill = "white",
}: SpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;

    const move = (e: MouseEvent) => {
      const r = parent.getBoundingClientRect();
      setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const enter = () => setVisible(true);
    const leave = () => setVisible(false);

    parent.addEventListener("mousemove", move);
    parent.addEventListener("mouseenter", enter);
    parent.addEventListener("mouseleave", leave);
    return () => {
      parent.removeEventListener("mousemove", move);
      parent.removeEventListener("mouseenter", enter);
      parent.removeEventListener("mouseleave", leave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute left-0 top-0 rounded-full blur-3xl",
        className
      )}
      style={{
        width: size,
        height: size,
        opacity: visible ? 0.55 : 0,
        transform: `translate3d(${pos.x - size / 2}px, ${pos.y - size / 2}px, 0)`,
        background: `radial-gradient(circle at center, ${fill}, transparent 70%)`,
        transition: "opacity .3s ease, transform .18s ease-out",
      }}
    />
  );
}

export default Spotlight;
