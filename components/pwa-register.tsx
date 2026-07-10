"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    // 개발 모드에서는 캐시 간섭을 피하기 위해 등록하지 않음
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
