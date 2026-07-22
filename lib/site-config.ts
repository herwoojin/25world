"use client";

// 사이트 표시 설정 — 관리자 모드에서 바꾼 내용을 Firestore 단일 문서에 보관한다.
//  · cats   : 카테고리 제목/이모지 덮어쓰기
//  · catOf  : 사이트를 다른 카테고리로 이동
//  · order  : 카테고리별 사이트 정렬 순서
//  · edits  : 코드 내장 사이트(lib/sites.ts)의 이름·설명·URL 덮어쓰기
//  · hidden : 숨긴(삭제한) 코드 내장 사이트 id — 소스는 그대로 두고 화면에서만 뺀다
import { useEffect, useState } from "react";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase";
import { CATEGORIES, type Category, type CategoryId, type Site } from "@/lib/sites";

export interface SiteEdit {
  name?: string;
  desc?: string;
  url?: string;
}

export interface SiteConfig {
  cats: Record<string, { name?: string; emoji?: string }>;
  catOf: Record<string, string>;
  order: Record<string, string[]>;
  /** 유료회원 전용 사이트 id 목록 (없으면 membership.ts 의 기본값 사용) */
  paid?: string[];
  /** 코드 내장 사이트 덮어쓰기 (id → 바꾼 값) */
  edits?: Record<string, SiteEdit>;
  /** 화면에서 숨긴 사이트 id 목록 */
  hidden?: string[];
  /** 자료실 Apps Script 웹앱 /exec URL (scripts/library-webapp.gs) */
  libraryUrl?: string;
}

const EMPTY: SiteConfig = { cats: {}, catOf: {}, order: {} };
export const SITE_CONFIG_EVENT = "25world:site-config-changed";

let cache: Promise<SiteConfig> | null = null;

export function loadSiteConfig(force = false): Promise<SiteConfig> {
  if (force) cache = null;
  cache ??= getDoc(doc(getFirestore(getFirebaseApp()), "siteMeta", "config"))
    .then((snap) => {
      if (!snap.exists()) return EMPTY;
      const d = snap.data();
      return {
        cats: d.cats ?? {},
        catOf: d.catOf ?? {},
        order: d.order ?? {},
        paid: Array.isArray(d.paid) ? d.paid : undefined,
        edits: d.edits ?? {},
        hidden: Array.isArray(d.hidden) ? d.hidden : [],
        libraryUrl: typeof d.libraryUrl === "string" ? d.libraryUrl : "",
      } as SiteConfig;
    })
    .catch(() => EMPTY);
  return cache;
}

export async function saveSiteConfig(cfg: SiteConfig) {
  await setDoc(doc(getFirestore(getFirebaseApp()), "siteMeta", "config"), cfg);
  cache = Promise.resolve(cfg);
  window.dispatchEvent(new Event(SITE_CONFIG_EVENT));
}

export function useSiteConfig(): SiteConfig {
  const [cfg, setCfg] = useState<SiteConfig>(EMPTY);
  useEffect(() => {
    let alive = true;
    const sync = (force = false) =>
      loadSiteConfig(force).then((c) => alive && setCfg(c));
    sync();
    const onChange = () => sync(true);
    window.addEventListener(SITE_CONFIG_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(SITE_CONFIG_EVENT, onChange);
    };
  }, []);
  return cfg;
}

/** 카테고리 목록에 관리자 수정(제목·이모지)을 반영 */
export function applyCategories(cfg: SiteConfig): Category[] {
  return CATEGORIES.map((c) => ({
    ...c,
    name: cfg.cats[c.id]?.name?.trim() || c.name,
    emoji: cfg.cats[c.id]?.emoji?.trim() || c.emoji,
  }));
}

/** 사이트 목록에 관리자 수정(이름·설명·URL·숨김) + 카테고리 이동 + 정렬 순서를 반영 */
export function applySites(sites: Site[], cfg: SiteConfig): Site[] {
  const hidden = new Set(cfg.hidden ?? []);
  const moved = sites
    .filter((s) => !hidden.has(s.id))
    .map((s) => {
      // 이름·설명·URL 덮어쓰기 (빈 값은 원본 유지)
      const e = cfg.edits?.[s.id];
      const edited: Site = e
        ? {
            ...s,
            name: e.name?.trim() || s.name,
            desc: e.desc?.trim() ?? s.desc,
            url: (e.url?.trim() as Site["url"]) || s.url,
          }
        : s;
      const to = cfg.catOf[s.id];
      return to && CATEGORIES.some((c) => c.id === to)
        ? { ...edited, cat: to as CategoryId }
        : edited;
    });

  return moved.sort((a, b) => {
    if (a.cat !== b.cat) return 0; // 카테고리 간 순서는 CATEGORIES 정의를 따른다
    const list = cfg.order[a.cat] ?? [];
    const ia = list.indexOf(a.id);
    const ib = list.indexOf(b.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1; // 순서 미지정 사이트는 뒤로
    if (ib === -1) return -1;
    return ia - ib;
  });
}
