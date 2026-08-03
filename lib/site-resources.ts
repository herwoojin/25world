"use client";

// 사이트별 부가 자료 — GIT 코드 주소 + 프롬프트(MD) 원문.
//   · 열람: 유료회원 이상 (사이트 상세 팝업의 GIT코드/프롬프트 버튼)
//   · 업로드: 관리자만
// Firestore siteResources/{siteId} 문서 하나에 저장. CategoryOrbital 이
// 카테고리마다 하나씩(최대 6개) 동시에 떠 있으므로, site-config.ts 와 같은
// 모듈 캐시 + 이벤트 패턴으로 Firestore 읽기를 한 번만 공유한다.
import { useEffect, useState } from "react";
import { collection, doc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase";

export interface SiteResource {
  gitUrl: string;
  promptMd: string;
  promptFileName: string;
  /** 관리자 전용 작업 메모 — 이 사이트의 핵심 내용을 적어 두는 곳 */
  coreNote: string;
  updatedAt: number;
}

const EMPTY: SiteResource = {
  gitUrl: "",
  promptMd: "",
  promptFileName: "",
  coreNote: "",
  updatedAt: 0,
};

export const SITE_RESOURCES_EVENT = "25world:site-resources-changed";

function db() {
  return getFirestore(getFirebaseApp());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAllOnce(): Promise<Record<string, SiteResource>> {
  const snap = await getDocs(collection(db(), "siteResources"));
  const out: Record<string, SiteResource> = {};
  snap.forEach((d) => {
    const v = d.data();
    out[d.id] = {
      gitUrl: v.gitUrl ?? "",
      promptMd: v.promptMd ?? "",
      promptFileName: v.promptFileName ?? "",
      coreNote: v.coreNote ?? "",
      updatedAt: v.updatedAt ?? 0,
    };
  });
  return out;
}

/** Firestore 읽기가 간헐적으로 실패할 때(계정 전환 직후 등)를 대비해 짧게 재시도한다. */
async function fetchAllWithRetry(): Promise<Record<string, SiteResource>> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchAllOnce();
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await sleep(500 * (attempt + 1));
    }
  }
  console.error("[site-resources] 부가 자료를 불러오지 못했습니다:", lastErr);
  throw lastErr;
}

let cache: Promise<Record<string, SiteResource>> | null = null;

function loadAll(force = false): Promise<Record<string, SiteResource>> {
  if (force) cache = null;
  if (!cache) {
    cache = fetchAllWithRetry().catch(() => {
      // 재시도까지 실패해도 실패를 캐시에 고정하지 않는다 — 다음 호출에서 다시 시도한다.
      cache = null;
      return {} as Record<string, SiteResource>;
    });
  }
  return cache;
}

/** 모든 사이트의 부가 자료 (siteId → resource). 관리자 저장 시 자동 갱신된다. */
export function useSiteResources(): Record<string, SiteResource> {
  const [map, setMap] = useState<Record<string, SiteResource>>({});
  useEffect(() => {
    let alive = true;
    const sync = (force = false) =>
      loadAll(force).then((m) => alive && setMap(m));
    sync();
    const onChange = () => sync(true);
    window.addEventListener(SITE_RESOURCES_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(SITE_RESOURCES_EVENT, onChange);
    };
  }, []);
  return map;
}

export function siteResource(
  map: Record<string, SiteResource>,
  siteId: string
): SiteResource {
  return map[siteId] ?? EMPTY;
}

/** 관리자: GIT 코드 주소 저장 */
export async function saveSiteGitUrl(siteId: string, gitUrl: string): Promise<void> {
  await setDoc(
    doc(db(), "siteResources", siteId),
    { gitUrl: gitUrl.trim(), updatedAt: Date.now() },
    { merge: true }
  );
  cache = null;
  window.dispatchEvent(new Event(SITE_RESOURCES_EVENT));
}

/** 관리자: 핵심 내용 메모 저장 */
export async function saveSiteCoreNote(siteId: string, coreNote: string): Promise<void> {
  await setDoc(
    doc(db(), "siteResources", siteId),
    { coreNote, updatedAt: Date.now() },
    { merge: true }
  );
  cache = null;
  window.dispatchEvent(new Event(SITE_RESOURCES_EVENT));
}

/** 관리자: 프롬프트(.md) 저장 */
export async function saveSitePrompt(
  siteId: string,
  promptMd: string,
  fileName: string
): Promise<void> {
  await setDoc(
    doc(db(), "siteResources", siteId),
    { promptMd, promptFileName: fileName, updatedAt: Date.now() },
    { merge: true }
  );
  cache = null;
  window.dispatchEvent(new Event(SITE_RESOURCES_EVENT));
}
