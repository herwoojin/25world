"use client";

// 방문자 실시간 집계 — Firestore `stats` 컬렉션 (좋아요와 동일한 개방형 규칙 사용)
//   · stats/visitors      { total }        누적 순 방문자 (브라우저당 최초 1회)
//   · stats/daily_{날짜}   { date, count }  일자별 순 방문자 (브라우저당 하루 1회)
// 허수 방지: localStorage 로 브라우저당 중복 카운트를 막는다. 실패는 조용히 무시.
import {
  doc,
  getFirestore,
  increment,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase";

function db() {
  return getFirestore(getFirebaseApp());
}

/** 한국 시간(KST) 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const TOTAL_KEY = "25world:visited-total";
const DAILY_KEY = "25world:visited-date";

/** 방문 1회 집계 — 누적은 브라우저 최초 1회, 오늘은 하루 1회만 반영 */
export async function recordVisit(): Promise<void> {
  const today = todayKST();
  try {
    if (!localStorage.getItem(TOTAL_KEY)) {
      await setDoc(
        doc(db(), "stats", "visitors"),
        { total: increment(1) },
        { merge: true }
      );
      localStorage.setItem(TOTAL_KEY, "1");
    }
    if (localStorage.getItem(DAILY_KEY) !== today) {
      await setDoc(
        doc(db(), "stats", `daily_${today}`),
        { date: today, count: increment(1) },
        { merge: true }
      );
      localStorage.setItem(DAILY_KEY, today);
    }
  } catch {
    // 규칙 미게시 등 — 조용히 무시 (다음 방문에서 재시도)
  }
}

export interface VisitorStats {
  total: number;
  today: number;
}

/** 누적 + 오늘 방문자를 실시간 구독한다. 해지 함수를 돌려준다. */
export function subscribeVisitorStats(
  cb: (s: VisitorStats) => void
): () => void {
  const today = todayKST();
  let total = 0;
  let todayCount = 0;
  const emit = () => cb({ total, today: todayCount });
  const unsubs: Array<() => void> = [];
  try {
    unsubs.push(
      onSnapshot(doc(db(), "stats", "visitors"), (snap) => {
        total = (snap.data()?.total as number) ?? 0;
        emit();
      })
    );
    unsubs.push(
      onSnapshot(doc(db(), "stats", `daily_${today}`), (snap) => {
        todayCount = (snap.data()?.count as number) ?? 0;
        emit();
      })
    );
  } catch {
    // 무시
  }
  return () => unsubs.forEach((u) => u());
}
