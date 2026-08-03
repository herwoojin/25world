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
  updatedAt: number;
}

const EMPTY: SiteResource = {
  gitUrl: "",
  promptMd: "",
  promptFileName: "",
  updatedAt: 0,
};

export const SITE_RESOURCES_EVENT = "25world:site-resources-changed";

function db() {
  return getFirestore(getFirebaseApp());
}

let cache: Promise<Record<string, SiteResource>> | null = null;

function loadAll(force = false): Promise<Record<string, SiteResource>> {
  if (force) cache = null;
  cache ??= getDocs(collection(db(), "siteResources"))
    .then((snap) => {
      const out: Record<string, SiteResource> = {};
      snap.forEach((d) => {
        const v = d.data();
        out[d.id] = {
          gitUrl: v.gitUrl ?? "",
          promptMd: v.promptMd ?? "",
          promptFileName: v.promptFileName ?? "",
          updatedAt: v.updatedAt ?? 0,
        };
      });
      return out;
    })
    .catch(() => ({}) as Record<string, SiteResource>);
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
