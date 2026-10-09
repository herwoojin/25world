"use client";

// 관리자 모드 상태만 다루는 가벼운 모듈 — 키는 sessionStorage 에만 둔다(탭 닫으면 해제).
//
// 버튼 UI(components/admin-button.tsx)와 일부러 떼어 놨다. 글 페이지처럼 "관리자인가?"만
// 알면 되는 곳이 버튼의 Link·라우터·Firebase 까지 끌고 오면 그만큼 무거워지기 때문이다.
import { useEffect, useState } from "react";

export const ADMIN_EVENT = "25world:admin-changed";
const KEY = "25world:adminKey";

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

/** 검증을 통과한 키를 저장하고 화면 전체에 알린다 */
export function setAdminKey(key: string): void {
  try {
    sessionStorage.setItem(KEY, key);
  } catch {}
  window.dispatchEvent(new Event(ADMIN_EVENT));
}

/** 관리자 모드 강제 해제 — 로그아웃/계정 전환 시 호출한다 */
export function clearAdminKey(): void {
  try {
    if (!sessionStorage.getItem(KEY)) return;
    sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(ADMIN_EVENT));
}

/** 관리자 모드 on/off 를 구독하는 훅 */
export function useAdminOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(Boolean(getAdminKey()));
    sync();
    window.addEventListener(ADMIN_EVENT, sync);
    return () => window.removeEventListener(ADMIN_EVENT, sync);
  }, []);
  return on;
}
