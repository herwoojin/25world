"use client";

// 레퍼런스 RadialOrbitalTimeline 의 25world 변환판:
// 중심 허브 = 카테고리, 궤도 노드 = 사이트 칩(자동 회전),
// 노드 클릭 → 상세 카드(아트 미리보기 + 방문하기 새 탭 링크)
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Category, Site } from "@/lib/sites";

interface CategoryOrbitalProps {
  category: Category;
  sites: Site[];
}

export default function CategoryOrbital({
  category,
  sites,
}: CategoryOrbitalProps) {
  const [rotationAngle, setRotationAngle] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [radius, setRadius] = useState(200);
  const containerRef = useRef<HTMLDivElement>(null);

  // 컨테이너 폭에 맞춰 궤도 반지름 조정 (폰/태블릿 반응형)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setRadius(Math.max(100, Math.min(200, el.clientWidth / 2 - 78)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 자동 회전 — reduced-motion 이면 정지
  useEffect(() => {
    if (!autoRotate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(
      () => setRotationAngle((prev) => (prev + 0.25) % 360),
      50
    );
    return () => clearInterval(timer);
  }, [autoRotate]);

  const toggle = (site: Site, index: number) => {
    if (activeId === site.id) {
      setActiveId(null);
      setAutoRotate(true);
      return;
    }
    setActiveId(site.id);
    setAutoRotate(false);
    // 선택 노드를 궤도 상단(270°)으로 — 카드가 궤도 중앙으로 펼쳐진다
    const target = 270 - (index / sites.length) * 360;
    setRotationAngle(((target % 360) + 360) % 360);
  };

  const collapse = () => {
    setActiveId(null);
    setAutoRotate(true);
  };

  return (
    <div
      ref={containerRef}
      className="relative mt-2 flex h-[540px] w-full items-center justify-center overflow-hidden"
      style={{ "--cc": category.color } as CSSProperties}
      onClick={(e) => {
        if (e.target === e.currentTarget) collapse();
      }}
    >
      {/* 중심 허브 */}
      <div className="absolute z-10 flex h-16 w-16 items-center justify-center rounded-full">
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full opacity-60"
          style={{
            background: `radial-gradient(circle, ${category.color} 0%, transparent 72%)`,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute h-20 w-20 animate-ping rounded-full border opacity-50 motion-reduce:animate-none"
          style={{ borderColor: `${category.color}55`, animationDuration: "2.4s" }}
        />
        <div
          aria-hidden="true"
          className="absolute h-24 w-24 animate-ping rounded-full border opacity-35 motion-reduce:animate-none"
          style={{
            borderColor: `${category.color}33`,
            animationDuration: "2.4s",
            animationDelay: "0.7s",
          }}
        />
        <span className="relative text-2xl" aria-hidden="true">
          {category.emoji}
        </span>
      </div>

      {/* 궤도 링 */}
      <div
        aria-hidden="true"
        className="absolute rounded-full border border-dashed border-foreground/15"
        style={{ width: radius * 2, height: radius * 2 }}
      />

      {sites.map((site, index) => {
        const angle = ((index / sites.length) * 360 + rotationAngle) % 360;
        const radian = (angle * Math.PI) / 180;
        const x = radius * Math.cos(radian);
        const y = radius * Math.sin(radian);
        const isActive = activeId === site.id;
        const zIndex = isActive ? 200 : Math.round(100 + 50 * Math.cos(radian));
        const opacity = isActive
          ? 1
          : Math.max(0.55, 0.55 + 0.45 * ((1 + Math.sin(radian)) / 2));

        return (
          <div
            key={site.id}
            className="absolute transition-all duration-700"
            style={{
              transform: `translate(${x}px, ${y}px)`,
              zIndex,
              opacity,
            }}
          >
            <button
              type="button"
              aria-expanded={isActive}
              aria-label={`${site.name} — ${site.desc}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(site, index);
              }}
              style={{
                color: category.color,
                borderColor: isActive ? category.color : `${category.color}66`,
              }}
              className={`flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-white shadow-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none dark:bg-zinc-200 ${
                isActive
                  ? "scale-125 shadow-[0_0_28px_-4px_var(--cc)]"
                  : "hover:scale-110"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: site.icon }}
              />
            </button>

            {/* 노드 라벨 */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute left-0 top-8 -translate-x-1/2 whitespace-nowrap text-sm font-bold tracking-wide transition-all duration-300 sm:text-base ${
                isActive ? "scale-110 text-foreground" : "text-foreground/80"
              }`}
            >
              {site.name}
            </div>

            {/* 상세 카드 */}
            {isActive && (
              <Card className="absolute left-0 top-16 w-72 -translate-x-1/2 border bg-popover/95 shadow-xl backdrop-blur-lg">
                <div
                  aria-hidden="true"
                  className="absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2"
                  style={{ backgroundColor: `${category.color}88` }}
                />
                <CardHeader className="p-4 pb-1">
                  <div className="flex items-center justify-between">
                    <Badge
                      className="px-2 text-[11px]"
                      style={{ backgroundColor: category.color, color: "#0A0A0B" }}
                    >
                      {category.emoji} {category.name}
                    </Badge>
                  </div>
                  <CardTitle className="mt-1 text-lg">{site.name}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {/* 사이트 고유 아트 미리보기 — lib/sites.ts 정적 SVG만 주입 (ERD §6-3) */}
                  <div className="relative h-20 overflow-hidden rounded-md bg-[#0A0A0B]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 320 170"
                      preserveAspectRatio="xMidYMid slice"
                      fill="none"
                      className="h-full w-full opacity-70"
                      dangerouslySetInnerHTML={{ __html: site.art }}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {site.desc}
                  </p>
                  <Button asChild size="sm" className="mt-3 w-full">
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener"
                      aria-label={`${site.name} 방문하기 (새 탭)`}
                    >
                      방문하기
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}
