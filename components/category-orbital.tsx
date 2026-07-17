"use client";

// 카테고리 씬 — 레퍼런스 "Interactive 3D" 레이아웃의 자체 구현판.
//   · 좌측: 카테고리 제목 / 노드 선택 시 사이트 상세로 전환
//   · 우측: 사이트 아이콘이 정확한 원 궤도를 도는 씬 (드래그로 직접 돌릴 수 있다)
// Spline 은 씬을 외부 CDN 에서 받아오므로 쓰지 않고(TRD §9), CSS 만으로 구현한다.
//
// 좌표 규칙 — 궤도 이탈 버그 재발 방지:
//   모든 요소는 크기 0 인 "중심점"(stage) 기준으로 배치한다.
//   flex 중앙정렬 + translate -50% 를 겹쳐 쓰면 요소 크기의 절반만큼 어긋난다.
//   ring: left/top = -R, 크기 2R  → 중심점에 정확히 일치
//   node: left/top = -24, 크기 48 → 중심점에 일치 후 translate(x,y) 로 궤도 위에 놓임
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, MousePointer2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spotlight } from "@/components/ui/spotlight";
import type { Category, Site } from "@/lib/sites";

interface CategoryOrbitalProps {
  category: Category;
  sites: Site[];
}

const NODE = 48; // 노드 지름(px) — left/top 오프셋 계산에 사용
const DEG = Math.PI / 180;

export default function CategoryOrbital({
  category,
  sites,
}: CategoryOrbitalProps) {
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [radius, setRadius] = useState(150);
  const sceneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const moved = useRef(false);

  // 씬 크기에 맞춰 궤도 반지름 조정 — 라벨이 잘리지 않도록 여백 확보
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const update = () => {
      const half = Math.min(el.clientWidth, el.clientHeight) / 2;
      setRadius(Math.max(84, Math.min(170, half - 54)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 자동 회전 — 드래그 중 / 노드 선택 중 / reduced-motion 이면 정지
  useEffect(() => {
    if (dragging || activeId) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      setAngle((a) => (a + dt * 0.012) % 360);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dragging, activeId]);

  // 드래그로 궤도 직접 회전
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, a: angle };
    moved.current = false;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) moved.current = true;
    setAngle(d.a + dx * 0.45);
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const active = sites.find((s) => s.id === activeId) ?? null;
  const step = 360 / Math.max(1, sites.length);

  return (
    <div
      className="relative mt-3 overflow-hidden rounded-xl border bg-card/70 shadow-sm backdrop-blur-sm"
      style={{ "--cc": category.color } as CSSProperties}
    >
      <Spotlight fill={category.color} size={360} />

      <div className="relative flex flex-col md:flex-row">
        {/* ── 좌측: 카테고리 정보 / 선택한 사이트 상세 ────────── */}
        <div className="z-10 flex flex-1 flex-col justify-center p-6 sm:p-8">
          {active ? (
            <>
              <Badge
                className="w-fit px-2 text-[11px]"
                style={{ backgroundColor: category.color, color: "#0A0A0B" }}
              >
                {category.emoji} {category.name}
              </Badge>
              <h3 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                {active.name}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                {active.desc}
              </p>

              {/* 사이트 고유 아트 — lib/sites.ts 의 정적 SVG 만 주입 (ERD §6-3) */}
              <div className="relative mt-4 h-24 max-w-md overflow-hidden rounded-md bg-[#0A0A0B]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 320 170"
                  preserveAspectRatio="xMidYMid slice"
                  fill="none"
                  className="h-full w-full opacity-70"
                  dangerouslySetInnerHTML={{ __html: active.art }}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a
                    href={active.url}
                    target="_blank"
                    rel="noopener"
                    aria-label={`${active.name} 방문하기 (새 탭)`}
                  >
                    방문하기
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveId(null)}>
                  닫기
                </Button>
              </div>
            </>
          ) : (
            <>
              <h3 className="flex items-center gap-3 bg-gradient-to-b from-foreground to-foreground/55 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
                <span aria-hidden="true" className="text-3xl">
                  {category.emoji}
                </span>
                {category.name}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                이 카테고리에 {sites.length}개의 사이트가 있습니다. 궤도를 드래그해
                돌려보고, 아이콘을 클릭하면 상세 정보가 여기에 나타납니다.
              </p>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
                드래그로 회전 · 클릭으로 열기
              </p>
            </>
          )}
        </div>

        {/* ── 우측: 원 궤도 씬 ──────────────────────────────── */}
        <div
          ref={sceneRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className={`relative h-[460px] flex-1 touch-pan-y select-none ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          {/* 중심점(stage) — 크기 0. 모든 좌표의 기준이 된다 */}
          <div className="absolute left-1/2 top-1/2 h-0 w-0">
            {/* 중심 허브 */}
            <div
              aria-hidden="true"
              className="absolute h-16 w-16 rounded-full opacity-50 blur-md"
              style={{
                left: -32,
                top: -32,
                background: `radial-gradient(circle, ${category.color}, transparent 70%)`,
              }}
            />
            <span
              aria-hidden="true"
              className="absolute flex h-10 w-10 items-center justify-center text-2xl"
              style={{ left: -20, top: -20 }}
            >
              {category.emoji}
            </span>

            {/* 궤도 링 — 중심점 기준 정확한 원 */}
            <div
              aria-hidden="true"
              className="absolute rounded-full border border-dashed border-foreground/15"
              style={{
                left: -radius,
                top: -radius,
                width: radius * 2,
                height: radius * 2,
              }}
            />

            {sites.map((site, i) => {
              const deg = i * step + angle;
              const a = deg * DEG;
              // 노드 중심이 궤도선 위에 정확히 놓인다
              const x = radius * Math.cos(a);
              const y = radius * Math.sin(a);
              const isActive = activeId === site.id;
              // 아래쪽(앞)일수록 밝고 크게 — 원은 유지한 채 입체감만 준다
              const front = (1 + Math.sin(a)) / 2; // 0(뒤) ~ 1(앞)
              const scale = isActive ? 1.25 : 0.86 + 0.14 * front;

              return (
                <div
                  key={site.id}
                  className="absolute"
                  style={{
                    left: -NODE / 2,
                    top: -NODE / 2,
                    width: NODE,
                    height: NODE,
                    transform: `translate(${x}px, ${y}px)`,
                    zIndex: isActive ? 200 : Math.round(100 + 50 * Math.sin(a)),
                    opacity: isActive ? 1 : 0.5 + 0.5 * front,
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isActive}
                    aria-label={`${site.name} — ${site.desc}`}
                    onClick={() => {
                      if (moved.current) return; // 드래그 직후의 클릭은 무시
                      setActiveId(isActive ? null : site.id);
                    }}
                    className="flex h-full w-full items-center justify-center rounded-full border-2 bg-white shadow-md transition-transform duration-300 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none dark:bg-zinc-200"
                    style={{
                      color: category.color,
                      borderColor: isActive ? category.color : `${category.color}66`,
                      transform: `scale(${scale})`,
                      boxShadow: isActive ? `0 0 28px -4px ${category.color}` : undefined,
                    }}
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

                  {/* 라벨 — 노드 박스 기준 아래 중앙 (레이아웃에 영향 없음) */}
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2 whitespace-nowrap text-xs font-bold tracking-wide transition-colors sm:text-sm ${
                      isActive ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {site.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
