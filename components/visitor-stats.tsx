"use client";

// 푸터 방문자 카운터 — 방문 1회 집계 후 누적/오늘 방문자를 실시간 표시
import { useEffect, useState } from "react";
import { Eye, Users } from "lucide-react";
import {
  recordVisit,
  subscribeVisitorStats,
  type VisitorStats,
} from "@/lib/visitors";

export default function VisitorStatsBadge() {
  const [stats, setStats] = useState<VisitorStats | null>(null);

  useEffect(() => {
    recordVisit();
    const unsub = subscribeVisitorStats(setStats);
    return unsub;
  }, []);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <span
      className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400"
      aria-label="방문자 통계"
    >
      <span className="flex items-center gap-1" title="오늘 방문자 (실시간)">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        오늘{" "}
        <b className="font-bold text-foreground">
          {stats ? fmt(stats.today) : "…"}
        </b>
      </span>
      <span className="flex items-center gap-1" title="누적 방문자">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        누적{" "}
        <b className="font-bold text-foreground">
          {stats ? fmt(stats.total) : "…"}
        </b>
      </span>
    </span>
  );
}
