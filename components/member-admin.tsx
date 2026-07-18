"use client";

// 관리자 — 회원 등급 관리
//   · 회원 목록(사진/이름/이메일) + 등급 드롭다운(일반/유료/VIP/관리자)
//   · 등급 변경 시 Firestore users/{uid}.group 즉시 반영
//   · 삭제(명부에서 제거) — 다음 로그인 시 일반회원으로 재등록됨
// 관리자 모드(id/pass)일 때만 렌더링된다.
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminOn } from "@/components/admin-button";
import {
  GROUPS,
  deleteUserProfile,
  listUsers,
  setUserGroup,
  type Group,
  type UserProfile,
} from "@/lib/membership";

const GROUP_STYLE: Record<Group, string> = {
  general: "text-zinc-500",
  paid: "text-emerald-500",
  vip: "text-violet-500",
  admin: "text-amber-500",
};

// uid 로 안정적인 아바타 색 (외부 이미지 없이 구분감만)
const AVATAR_COLORS = ["#17E9C0", "#4DA3FF", "#A78BFA", "#FF7A9E", "#FFC24D", "#7ED957"];
function colorFor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function MemberAdmin() {
  const adminOn = useAdminOn();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const list = await listUsers();
      list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      setUsers(list);
    } catch {
      window.alert("회원 목록을 불러오지 못했습니다. (Firestore 규칙에 users 허용 필요)");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (adminOn) load();
  }, [adminOn, load]);

  if (!adminOn) return null;

  const changeGroup = async (uid: string, group: Group) => {
    setUsers((prev) =>
      prev ? prev.map((u) => (u.uid === uid ? { ...u, group } : u)) : prev
    );
    await setUserGroup(uid, group).catch(() => window.alert("등급 변경에 실패했습니다."));
  };

  const remove = async (u: UserProfile) => {
    if (!window.confirm(`"${u.name || u.email}" 회원을 명부에서 삭제할까요?`)) return;
    await deleteUserProfile(u.uid).catch(() => window.alert("삭제에 실패했습니다."));
    setUsers((prev) => (prev ? prev.filter((x) => x.uid !== u.uid) : prev));
  };

  const filtered = (users ?? []).filter(
    (u) =>
      !q ||
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <section className="space-y-3 rounded-xl border border-violet-400/40 bg-violet-400/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-violet-500">
          <UserCog className="h-4 w-4" aria-hidden="true" />
          관리자 — 회원 등급 관리 ({users?.length ?? 0}명)
        </h2>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="이름 · 이메일 검색"
        className="w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
      />

      {users === null ? (
        <p className="py-4 text-center text-sm text-zinc-500">불러오는 중…</p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">
          {users.length === 0
            ? "아직 로그인한 회원이 없습니다. 회원이 구글 로그인하면 여기에 나타납니다."
            : "검색 결과가 없습니다."}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {filtered.map((u) => (
            <li key={u.uid} className="flex flex-wrap items-center gap-3 py-2.5">
              {/* 외부 CDN 이미지 금지(TRD §9) — 구글 아바타 대신 이니셜 원형 */}
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: colorFor(u.uid) }}
                aria-hidden="true"
              >
                {(u.name || u.email || "?").slice(0, 1).toUpperCase()}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {u.name || "(이름 없음)"}
                  {u.role === "admin" && (
                    <span className="ml-1.5 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                      관리자
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {u.email}
                </span>
              </span>

              <select
                value={u.group}
                onChange={(e) => changeGroup(u.uid, e.target.value as Group)}
                aria-label={`${u.name} 등급`}
                className={`rounded-md border border-zinc-300 bg-background px-2 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700 ${GROUP_STYLE[u.group]}`}
              >
                {GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => remove(u)}
                aria-label={`${u.name} 삭제`}
                className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        유료 전용 사이트(makeU2V · 국내 주식 정보 · 주식 거시지표 분석)는 <b>유료회원</b>{" "}
        이상에게만 보입니다. 회원을 유료회원으로 지정하면 다음 접속부터 해당 사이트가
        나타납니다.
      </p>
    </section>
  );
}
