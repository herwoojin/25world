"use client";

// 동적 사이트 — 구글시트 'sites' 탭(관리자 모드에서 등록)을 읽어
// 코드 내장 SITES 와 합쳐 렌더링한다. 재배포 없이 즉시 반영.
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, SITES, type CategoryId, type Site } from "@/lib/sites";
import { BLOG_WEBAPP_URL } from "@/lib/firebase";
import {
  applyCategories,
  applySites,
  useSiteConfig,
} from "@/lib/site-config";

export interface DynSiteRow {
  id: string;
  cat: string;
  name: string;
  desc: string;
  url: string;
}

// 동적 사이트 기본 아이콘 (카테고리 컬러는 칩에서 currentColor로 주입됨)
const DEFAULT_ICON = `<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3z"/><circle cx="18.5" cy="5.5" r="1" fill="currentColor"/>`;

const defaultArt = (color: string) =>
  `<g stroke="${color}" fill="none" stroke-width="3"><path d="M56 60l3.5 8 8.5 1.2-6 6 1.4 8.6-7.4-4-7.4 4 1.4-8.6-6-6 8.5-1.2L56 60z"/><circle cx="56" cy="112" r="7" opacity=".5"/><circle cx="268" cy="84" r="26" stroke="#fff" opacity=".8"/><circle cx="268" cy="84" r="40" opacity=".4" stroke-dasharray="6 8"/><circle cx="268" cy="44" r="4" fill="${color}" stroke="none"/></g>`;

let cache: Promise<Site[]> | null = null;

function loadDynamicSites(): Promise<Site[]> {
  cache ??= fetch(`${BLOG_WEBAPP_URL}?type=sites`)
    .then((r) => r.json())
    .then((rows: DynSiteRow[]) => {
      if (!Array.isArray(rows)) return [];
      const catIds = new Set<string>(CATEGORIES.map((c) => c.id));
      return rows
        .filter(
          (r) =>
            r &&
            typeof r.url === "string" &&
            r.url.startsWith("https://") &&
            catIds.has(r.cat) &&
            !SITES.some((s) => s.id === r.id)
        )
        .map((r) => {
          const color = CATEGORIES.find((c) => c.id === r.cat)!.color;
          return {
            id: r.id,
            cat: r.cat as CategoryId,
            name: r.name || r.url,
            desc: r.desc || "",
            url: r.url as Site["url"],
            icon: DEFAULT_ICON,
            art: defaultArt(color),
          } satisfies Site;
        });
    })
    .catch(() => [] as Site[]);
  return cache;
}

/** 내장 + 동적 사이트 병합 목록 (관리자 설정: 카테고리 이동·정렬 반영) */
export function useSites(): { sites: Site[]; dynamic: Site[] } {
  const [dynamic, setDynamic] = useState<Site[]>([]);
  const cfg = useSiteConfig();

  useEffect(() => {
    let mounted = true;
    loadDynamicSites().then((d) => {
      if (mounted) setDynamic(d);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return useMemo(
    () => ({ sites: applySites([...SITES, ...dynamic], cfg), dynamic }),
    [dynamic, cfg]
  );
}

/** 카테고리 목록 (관리자가 수정한 제목·이모지 반영) */
export function useCategories() {
  const cfg = useSiteConfig();
  return useMemo(() => applyCategories(cfg), [cfg]);
}

// Apps Script 웹앱 POST — Content-Type 미지정(text/plain)으로 CORS preflight 회피
export async function webappPost(payload: object): Promise<string> {
  const res = await fetch(BLOG_WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.text();
}
