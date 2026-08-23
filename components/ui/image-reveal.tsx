"use client";

// 스포트라이트 리빌 — 마우스(또는 터치)를 따라다니는 원형 마스크로 children 을 또렷하게 비춘다.
// 레퍼런스(image-reveal)의 반응형 반경 + lerp 애니메이션 기법을 그대로 가져오되,
// 외부 CDN 이미지 대신 이 프로젝트 자체 콘텐츠(아이콘 캐러셀 등)를 감싸는 래퍼로 일반화했다.
// 배경은 감싸는 쪽에서 유지하고, 여기서는 반투명 오버레이 + 스포트라이트만 얹는다.
import React, { useRef, useState, useEffect } from "react";

// 뷰포트 크기에 따른 반응형 값 (모바일은 작게, 큰 화면은 크게)
function getResponsiveValues() {
  const width = typeof window !== "undefined" ? window.innerWidth : 1024;

  let baseRadius: number;
  if (width < 768) {
    baseRadius = 70 + (width / 768) * 30;
  } else if (width < 1440) {
    baseRadius = 80 + ((width - 768) / (1440 - 768)) * 20;
  } else {
    baseRadius = 110 + ((Math.min(width, 2560) - 1440) / (2560 - 1440)) * 30;
  }

  const multiplier = baseRadius / 100;
  return {
    MAX_RADIUS: Math.round(baseRadius),
    MIN_RADIUS: 0,
    SOFT_EDGE: Math.round(60 * multiplier),
    LERP_SPEED: 0.18,
    RADIUS_LERP_SPEED: 0.13,
  };
}

interface SpotlightRevealProps {
  children: React.ReactNode;
  className?: string;
  /**
   * 스포트라이트 밖 영역을 얼마나 가릴지 (0~1).
   * 지정하지 않으면 테마별 CSS 변수 --spot-dim 을 따른다 (globals.css).
   */
  dim?: number;
  /** 오버레이 블러 정도(px). 미지정 시 테마별 --spot-blur */
  blur?: number;
}

export function SpotlightReveal({
  children,
  className = "",
  dim,
  blur,
}: SpotlightRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [lerpedPos, setLerpedPos] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [radius, setRadius] = useState(0);
  const [targetRadius, setTargetRadius] = useState(0);
  const [values, setValues] = useState(getResponsiveValues());
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // 터치 기기 감지 + 리사이즈 시 반응형 값 갱신
  useEffect(() => {
    const handleResize = () => setValues(getResponsiveValues());
    setIsTouchDevice(
      "ontouchstart" in window || navigator.maxTouchPoints > 0
    );
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 표시 위치를 부드럽게 따라가도록 lerp
  useEffect(() => {
    if (!hovered || !mousePos || isTouchDevice) {
      setLerpedPos(null);
      return;
    }
    let frame: number;
    const animate = () => {
      setLerpedPos((prev) => {
        if (!prev) return mousePos;
        const dx = mousePos.x - prev.x;
        const dy = mousePos.y - prev.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.5) return mousePos;
        return {
          x: prev.x + dx * values.LERP_SPEED,
          y: prev.y + dy * values.LERP_SPEED,
        };
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [mousePos, hovered, isTouchDevice, values.LERP_SPEED]);

  // 진입/이탈 시 반경 애니메이션
  useEffect(() => {
    setTargetRadius(hovered ? values.MAX_RADIUS : values.MIN_RADIUS);
  }, [hovered, values.MAX_RADIUS, values.MIN_RADIUS]);

  useEffect(() => {
    let frame: number;
    const animateRadius = () => {
      setRadius((prev) => {
        if (Math.abs(prev - targetRadius) < 1) return targetRadius;
        return prev + (targetRadius - prev) * values.RADIUS_LERP_SPEED;
      });
      frame = requestAnimationFrame(animateRadius);
    };
    frame = requestAnimationFrame(animateRadius);
    return () => cancelAnimationFrame(frame);
  }, [targetRadius, values.RADIUS_LERP_SPEED]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchDevice) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && e.touches[0]) {
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      setMousePos({ x, y });
      setLerpedPos({ x, y }); // 터치는 lerp 없이 즉시
      setHovered(true);
    }
  };

  const handleMouseEnter = () => !isTouchDevice && setHovered(true);
  const handleLeave = () => {
    setHovered(false);
    setMousePos(null);
    setLerpedPos(null);
  };

  const { SOFT_EDGE } = values;
  const active = !!lerpedPos && radius > 0;

  const cx = lerpedPos?.x ?? 0;
  const cy = lerpedPos?.y ?? 0;

  // 스포트라이트 안쪽은 오버레이를 투명하게(=선명), 바깥쪽은 dim 만큼 덮는다.
  // 상호작용 전(active=false)에는 오버레이를 완전히 투명하게 하여 아이콘이 정상적으로 보이게 한다.
  const maskStyle: React.CSSProperties = active
    ? (() => {
        const mask = `radial-gradient(circle ${radius}px at ${cx}px ${cy}px,
            transparent 0 ${radius - SOFT_EDGE - 20}px,
            rgba(0,0,0,0.10) ${radius - SOFT_EDGE}px,
            rgba(0,0,0,0.25) ${radius - SOFT_EDGE / 1.5}px,
            rgba(0,0,0,0.45) ${radius - SOFT_EDGE / 2}px,
            rgba(0,0,0,0.75) ${radius}px,
            black 100%)`;
        return { WebkitMaskImage: mask, maskImage: mask };
      })()
    : { WebkitMaskImage: "none", maskImage: "none" };

  // 위 마스크의 반대 — 원 안쪽만 남긴다. 여기에 backdrop-filter 를 걸어
  // "가려지지 않은 영역"이 아니라 실제로 밝아지는(또렷해지는) 영역을 만든다.
  // blur 프로퍼티가 없으면 테마 변수(--spot-blur)를 쓴다. E-ink 는 0px 이라 블러가 없다.
  const blurCss = `blur(${blur === undefined ? "var(--spot-blur)" : `${blur}px`})`;

  const coreMask = `radial-gradient(circle ${radius}px at ${cx}px ${cy}px,
      black 0 ${radius - SOFT_EDGE - 20}px,
      rgba(0,0,0,0.90) ${radius - SOFT_EDGE}px,
      rgba(0,0,0,0.65) ${radius - SOFT_EDGE / 1.5}px,
      rgba(0,0,0,0.35) ${radius - SOFT_EDGE / 2}px,
      transparent ${radius}px)`;

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleLeave}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchMove}
      onTouchEnd={handleLeave}
    >
      {children}

      {/* ① 스포트라이트 안쪽을 실제로 밝게/또렷하게 (테마별 --spot-filter)
          야간=밝기↑, 주간=채도·대비↑, E-ink=잉크 대비↑ */}
      {active && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            WebkitMaskImage: coreMask,
            maskImage: coreMask,
            backdropFilter: "var(--spot-filter)",
            WebkitBackdropFilter: "var(--spot-filter)",
          }}
        />
      )}

      {/* ② 오버레이: 테마별 베일 색으로 덮고 블러 — 마스크로 스포트라이트만 뚫린다.
          주간처럼 배경이 밝은 테마는 베일이 배경색이면 대비가 안 나서 회색을 쓴다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background: "hsl(var(--spot-veil))",
          ...maskStyle,
          opacity: active ? (dim ?? "var(--spot-dim)") : 0,
          backdropFilter: active ? blurCss : "none",
          WebkitBackdropFilter: active ? blurCss : "none",
        }}
      />

      {/* ③ 소프트 글로우 링 — 색·세기·블렌드를 테마가 정한다 */}
      {active && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle ${radius + 30}px at ${cx}px ${cy}px,
              rgba(var(--spot-glow) / var(--spot-glow-core)) 0,
              rgba(var(--spot-glow) / var(--spot-glow-edge)) 60%,
              transparent 100%)`,
            mixBlendMode: "var(--spot-blend)" as React.CSSProperties["mixBlendMode"],
            transition: "background 0.3s",
          }}
        />
      )}
    </div>
  );
}

export default SpotlightReveal;
