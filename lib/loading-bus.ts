"use client";

// 자료실(구글 드라이브)·블로그(구글시트) 등 여러 섹션이 백그라운드에서
// 동시에 데이터를 불러올 때, 화면 전체에 로딩 팝업 하나만 띄우기 위한
// 아주 작은 이벤트 버스. 각 로더가 시작할 때 beginLoading(key), 끝나면
// endLoading(key) 를 부른다 — key 가 하나라도 남아있으면 "불러오는 중".
import { useEffect, useState } from "react";

const active = new Set<string>();
const LOADING_EVENT = "25world:loading-changed";

function emit() {
  window.dispatchEvent(new Event(LOADING_EVENT));
}

export function beginLoading(key: string) {
  active.add(key);
  emit();
}

export function endLoading(key: string) {
  active.delete(key);
  emit();
}

export function useGlobalLoading(): boolean {
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const sync = () => setLoading(active.size > 0);
    sync();
    window.addEventListener(LOADING_EVENT, sync);
    return () => window.removeEventListener(LOADING_EVENT, sync);
  }, []);
  return loading;
}
