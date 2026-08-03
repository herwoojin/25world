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
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Github,
  MousePointer2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spotlight } from "@/components/ui/spotlight";
import { useAdminOn } from "@/components/admin-button";
import { useEffectiveGroup } from "@/lib/membership";
import {
  saveSiteGitUrl,
  saveSitePrompt,
  siteResource,
  useSiteResources,
} from "@/lib/site-resources";
import type { Category, Site } from "@/lib/sites";

interface CategoryOrbitalProps {
  category: Category;
  sites: Site[];
  /** 현재 등급에서 이 사이트가 잠겨 있는가 (유료 전용인데 등급 부족) */
  locked?: (siteId: string) => boolean;
  /** 유료 전용 사이트인가 — 등급과 무관하게 VIP 배지를 표시 */
  paidOnly?: (siteId: string) => boolean;
}

const NODE = 48; // 노드 지름(px) — left/top 오프셋 계산에 사용
const DEG = Math.PI / 180;

export default function CategoryOrbital({
  category,
  sites,
  locked,
  paidOnly,
}: CategoryOrbitalProps) {
  const isLocked = (id: string) => (locked ? locked(id) : false);
  const isPaidOnly = (id: string) => (paidOnly ? paidOnly(id) : false);
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [radius, setRadius] = useState(150);
  const sceneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const moved = useRef(false);

  // GIT 코드 / 프롬프트(MD) 부가 자료 — 열람은 유료회원 이상, 업로드는 관리자만
  const resMap = useSiteResources();
  const group = useEffectiveGroup();
  const adminOn = useAdminOn();
  const paidUp = group === "paid" || group === "vip" || group === "admin";
  const [modal, setModal] = useState<"git" | "prompt" | null>(null);
  const [gitDraft, setGitDraft] = useState("");
  const [gitBusy, setGitBusy] = useState(false);
  const [promptBusy, setPromptBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const promptFileRef = useRef<HTMLInputElement>(null);

  // 사이트 선택/해제 시 열려 있던 자료 팝업도 함께 닫는다
  const selectSite = (id: string | null) => {
    setActiveId(id);
    setModal(null);
  };

  // 씬 크기에 맞춰 궤도 반지름 조정 — 라벨이 잘리지 않도록 여백 확보
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const update = () => {
      // 노드(24) + 라벨 폭 여유를 뺀 값 — 카드의 overflow-hidden 에 라벨이 잘리지 않게
      const half = Math.min(el.clientWidth, el.clientHeight) / 2;
      setRadius(Math.max(76, Math.min(170, half - 68)));
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
  const activeRes = active ? siteResource(resMap, active.id) : null;
  const step = 360 / Math.max(1, sites.length);

  // GIT 모달을 열 때 입력값을 현재 저장된 주소로 채운다
  useEffect(() => {
    if (modal === "git" && active) {
      setGitDraft(siteResource(resMap, active.id).gitUrl);
    }
    // resMap 은 의도적으로 제외 — 관리자가 입력 중일 때 다시 채워지지 않게 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, active?.id]);

  const saveGit = async () => {
    if (!active) return;
    setGitBusy(true);
    try {
      await saveSiteGitUrl(active.id, gitDraft);
    } catch {
      window.alert("GIT 코드 저장에 실패했습니다.");
    } finally {
      setGitBusy(false);
    }
  };

  const onPromptFile = async (file: File | undefined) => {
    if (!file || !active) return;
    setPromptBusy(`"${file.name}" 저장 중…`);
    try {
      const text = await file.text();
      await saveSitePrompt(active.id, text, file.name);
    } catch {
      window.alert("프롬프트 저장에 실패했습니다.");
    } finally {
      setPromptBusy("");
      if (promptFileRef.current) promptFileRef.current.value = "";
    }
  };

  const copyPrompt = async () => {
    if (!activeRes?.promptMd) return;
    try {
      await navigator.clipboard.writeText(activeRes.promptMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.alert("복사에 실패했습니다.");
    }
  };

  return (
    <div
      className="relative mt-3 overflow-hidden rounded-xl border bg-card/70 shadow-sm backdrop-blur-sm"
      style={{ "--cc": category.color } as CSSProperties}
    >
      <Spotlight fill={category.color} size={360} />

      <div className="relative flex flex-col md:flex-row">
        {/* ── 좌측: 카테고리 정보 / 선택한 사이트 상세 ──────────
            모바일(flex-col)에서는 flex-1 을 주지 않는다. 세로 방향에서 flex-1 은
            flex-basis:0% 라 높이를 0 으로 무너뜨려 아래 씬과 겹친다. */}
        <div className="z-10 flex flex-col justify-center p-6 sm:p-8 md:flex-1">
          {active ? (
            <>
              <Badge
                className="w-fit px-2 text-[11px]"
                style={{ backgroundColor: category.color, color: "#0A0A0B" }}
              >
                {category.emoji} {category.name}
              </Badge>
              <h3 className="mt-3 flex items-center gap-2 text-3xl font-bold tracking-tight md:text-4xl">
                {active.name}
                {isPaidOnly(active.id) && (
                  <span className="rounded bg-amber-400 px-1.5 py-0.5 text-xs font-extrabold leading-none text-black">
                    VIP
                  </span>
                )}
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
                <Button size="sm" variant="outline" onClick={() => selectSite(null)}>
                  닫기
                </Button>

                {/* GIT코드 · 프롬프트 — 유료회원 이상만 볼 수 있다 (관리자 모드는 항상 포함) */}
                {paidUp && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setModal("git")}
                      className="gap-1.5"
                    >
                      <Github className="h-3.5 w-3.5" aria-hidden="true" />
                      GIT코드
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setModal("prompt")}
                      className="gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      프롬프트
                    </Button>
                  </>
                )}
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
          // 모바일: 명시적 높이 + shrink-0 (flex-1 은 높이를 무너뜨린다)
          // 데스크톱(row): flex-1 로 남는 폭을 채운다
          className={`relative h-[380px] w-full shrink-0 touch-pan-y select-none sm:h-[440px] md:h-[520px] md:w-auto md:flex-1 ${
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
              const lockedNode = isLocked(site.id);
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
                    aria-disabled={lockedNode}
                    aria-label={
                      lockedNode
                        ? `${site.name} — 유료회원 전용`
                        : `${site.name} — ${site.desc}`
                    }
                    onClick={() => {
                      if (moved.current) return; // 드래그 직후의 클릭은 무시
                      if (lockedNode) return; // 잠금: 일반회원은 클릭 불가
                      selectSite(isActive ? null : site.id);
                    }}
                    className={`flex h-full w-full items-center justify-center rounded-full border-2 bg-white shadow-md transition-transform duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none dark:bg-zinc-200 ${
                      lockedNode ? "cursor-not-allowed" : "hover:scale-110"
                    }`}
                    style={{
                      color: category.color,
                      borderColor: isActive ? category.color : `${category.color}66`,
                      transform: `scale(${scale})`,
                      opacity: lockedNode ? 0.55 : undefined,
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
                    className={`pointer-events-none absolute left-1/2 top-[52px] flex max-w-[124px] -translate-x-1/2 items-center justify-center gap-1 whitespace-nowrap text-[11px] font-bold tracking-wide transition-colors sm:max-w-none sm:text-sm ${
                      isActive ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    <span className="truncate">{site.name}</span>
                    {isPaidOnly(site.id) && (
                      <span className="shrink-0 rounded bg-amber-400 px-1 py-0.5 text-[9px] font-extrabold leading-none text-black">
                        VIP
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* GIT코드 팝업 */}
      {modal === "git" && active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${active.name} GIT 코드`}
          onClick={() => setModal(null)}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-background p-5 shadow-2xl dark:border-zinc-800"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="flex min-w-0 items-center gap-2 text-sm font-bold">
                <Github className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{active.name} — GIT 코드</span>
              </h4>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="닫기"
                className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {adminOn && (
              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  type="url"
                  value={gitDraft}
                  onChange={(e) => setGitDraft(e.target.value)}
                  placeholder="https://github.com/..."
                  className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
                />
                <Button size="sm" onClick={saveGit} disabled={gitBusy}>
                  {gitBusy ? "저장 중…" : "저장"}
                </Button>
              </div>
            )}

            {activeRes?.gitUrl ? (
              <div className="mt-4 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <span className="min-w-0 flex-1 select-all truncate">
                  {activeRes.gitUrl}
                </span>
                <a
                  href={activeRes.gitUrl}
                  target="_blank"
                  rel="noopener"
                  aria-label="새 탭에서 열기"
                  className="shrink-0 text-zinc-400 transition-colors hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            ) : (
              !adminOn && (
                <p className="mt-4 text-sm text-zinc-500">
                  아직 등록된 GIT 코드 주소가 없습니다.
                </p>
              )
            )}
          </div>
        </div>
      )}

      {/* 프롬프트(MD) 팝업 */}
      {modal === "prompt" && active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${active.name} 프롬프트`}
          onClick={() => setModal(null)}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-background p-5 shadow-2xl dark:border-zinc-800"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="flex min-w-0 items-center gap-2 text-sm font-bold">
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{active.name} — 프롬프트</span>
              </h4>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="닫기"
                className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {adminOn && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                <input
                  ref={promptFileRef}
                  type="file"
                  accept=".md,text/markdown"
                  onChange={(e) => onPromptFile(e.target.files?.[0])}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => promptFileRef.current?.click()}
                  disabled={Boolean(promptBusy)}
                  className="gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  .md 파일 업로드
                </Button>
                <span className="text-xs text-zinc-500">
                  {promptBusy ||
                    (activeRes?.promptFileName
                      ? `현재: ${activeRes.promptFileName}`
                      : "등록된 파일 없음")}
                </span>
              </div>
            )}

            {activeRes?.promptMd ? (
              <>
                <pre className="mt-4 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
                  {activeRes.promptMd}
                </pre>
                <Button size="sm" className="mt-3 w-fit gap-1.5" onClick={copyPrompt}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copied ? "복사됨!" : "복사"}
                </Button>
              </>
            ) : (
              !adminOn && (
                <p className="mt-4 text-sm text-zinc-500">
                  아직 등록된 프롬프트가 없습니다.
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
