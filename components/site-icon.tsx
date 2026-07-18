import { getCategoryColor, type Site } from "@/lib/sites";

interface SiteIconProps {
  site: Site;
  /** 캐러셀 반복 렌더분 — 포커스/스크린리더에서 제외 */
  decorative?: boolean;
  /** 유료 전용인데 등급 부족 — 클릭 불가 + 흐림 */
  locked?: boolean;
  /** 유료 전용 사이트 — 등급과 무관하게 VIP 배지 표시 */
  paidOnly?: boolean;
}

export default function SiteIcon({
  site,
  decorative = false,
  locked = false,
  paidOnly = false,
}: SiteIconProps) {
  const color = getCategoryColor(site.cat);
  const chipCls =
    "group/chip relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-md transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:scale-100 dark:bg-zinc-200 sm:h-16 sm:w-16";

  // 잠금: 링크가 아닌 div — 클릭 불가 + VIP 배지 + 흐림
  const Wrapper = locked ? "div" : "a";
  const linkProps = locked
    ? { "aria-label": `${site.name} — 유료회원 전용`, style: { color, opacity: 0.6 } }
    : {
        href: site.url,
        target: "_blank",
        rel: "noopener",
        "aria-label": `${site.name} — ${site.desc} (새 탭)`,
        tabIndex: decorative ? -1 : undefined,
        style: { color },
      };

  return (
    <Wrapper
      {...(linkProps as Record<string, unknown>)}
      className={`${chipCls}${locked ? " cursor-not-allowed" : ""}`}
    >
      {paidOnly && (
        <span className="absolute -right-1 -top-1 z-10 rounded bg-amber-400 px-1 py-0.5 text-[8px] font-extrabold leading-none text-black shadow">
          VIP
        </span>
      )}
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7 sm:h-8 sm:w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        // lib/sites.ts의 정적 SVG 문자열만 주입 (ERD §6-3)
        dangerouslySetInnerHTML={{ __html: site.icon }}
      />
      {/* 호버/포커스 플로팅 툴팁 — 사이트명 + 주석 설명 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[220px] -translate-x-1/2 translate-y-1 rounded-lg bg-zinc-900 px-3 py-2 text-center opacity-0 shadow-xl ring-1 ring-zinc-700 transition-all duration-200 group-hover/chip:translate-y-0 group-hover/chip:opacity-100 group-focus-visible/chip:translate-y-0 group-focus-visible/chip:opacity-100 motion-reduce:transition-none"
      >
        <span className="block text-xs font-bold text-white">{site.name}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-zinc-300">
          {site.desc}
        </span>
        <span className="absolute left-1/2 top-full -mt-px h-2 w-2 -translate-x-1/2 rotate-45 bg-zinc-900 ring-1 ring-zinc-700 [clip-path:polygon(0_0,100%_100%,100%_0)]" />
      </span>
    </Wrapper>
  );
}
