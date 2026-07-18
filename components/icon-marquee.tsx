import SiteIcon from "@/components/site-icon";
import { cn } from "@/lib/utils";
import type { Site } from "@/lib/sites";

interface IconMarqueeProps {
  sites: Site[];
  direction: "left" | "right";
  durationSec?: number;
  /** 유료 전용인데 등급 부족이면 잠금 (클릭 불가 + 흐림) */
  locked?: (siteId: string) => boolean;
  /** 유료 전용 사이트 — 등급과 무관하게 VIP 배지 표시 */
  paidOnly?: (siteId: string) => boolean;
}

/** 이음새 제거용 반복 횟수 — translateX(±50%) 루프이므로 짝수(2배 구조) 유지 */
const REPEAT = 4;

export default function IconMarquee({
  sites,
  direction,
  durationSec = 30,
  locked,
  paidOnly,
}: IconMarqueeProps) {
  return (
    // 가로 클리핑은 히어로 섹션(overflow-hidden)이 담당 — 여기서 자르면 칩 툴팁이 잘린다
    <div className="group">
      <div
        className={cn(
          "flex w-max gap-4 sm:gap-6",
          direction === "left" ? "animate-scroll-left" : "animate-scroll-right",
          "group-hover:[animation-play-state:paused] motion-reduce:animate-none"
        )}
        style={{ animationDuration: `${durationSec}s` }}
      >
        {Array.from({ length: REPEAT }).map((_, r) => (
          <div
            key={r}
            className="flex gap-4 sm:gap-6"
            aria-hidden={r > 0 || undefined}
          >
            {sites.map((site) => (
              <SiteIcon
                key={`${r}-${site.id}`}
                site={site}
                decorative={r > 0}
                locked={locked ? locked(site.id) : false}
                paidOnly={paidOnly ? paidOnly(site.id) : false}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
