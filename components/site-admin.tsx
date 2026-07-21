"use client";

// 관리자 패널 — 사이트 추가/관리 + 카테고리 제목 편집 + 사이트 순서·이동
// 사이트 데이터: 구글시트 'sites' 탭 / 표시 설정: Firestore siteMeta/config
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  DollarSign,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_EVENT, getAdminKey } from "@/components/admin-button";
import { CATEGORIES, SITES } from "@/lib/sites";
import { useCategories, useSites, webappPost } from "@/lib/use-sites";
import { DEFAULT_PAID_SITE_IDS } from "@/lib/membership";
import { saveSiteConfig, useSiteConfig, type SiteConfig } from "@/lib/site-config";

function makeSiteId(url: string, taken: Set<string>) {
  let base = "site";
  try {
    base =
      new URL(url).hostname.split(".")[0].replace(/[^a-z0-9]/gi, "") || "site";
  } catch {}
  let id = base;
  while (taken.has(id)) id = base + Math.random().toString(36).slice(2, 5);
  return id;
}

export default function SiteAdmin() {
  const [adminKey, setAdminKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState<string>(CATEGORIES[0].id);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");

  const { sites, dynamic } = useSites();
  const categories = useCategories();
  const cfg = useSiteConfig();
  const [draft, setDraft] = useState<SiteConfig>(cfg);

  useEffect(() => setDraft(cfg), [cfg]);

  useEffect(() => {
    const sync = () => setAdminKey(getAdminKey());
    sync();
    window.addEventListener(ADMIN_EVENT, sync);
    return () => window.removeEventListener(ADMIN_EVENT, sync);
  }, []);

  // 카테고리별 현재 순서 (설정에 없는 사이트는 뒤에 붙는다)
  const grouped = useMemo(() => {
    const out: Record<string, typeof sites> = {};
    for (const c of CATEGORIES) out[c.id] = sites.filter((s) => s.cat === c.id);
    return out;
  }, [sites]);

  if (!adminKey) return null;

  const persist = async (next: SiteConfig) => {
    setDraft(next);
    setBusy(true);
    try {
      await saveSiteConfig(next);
    } catch {
      window.alert("설정 저장에 실패했습니다. (Firestore 규칙에 siteMeta 허용 필요)");
    } finally {
      setBusy(false);
    }
  };

  const saveCategory = (id: string, name: string, emoji: string) =>
    persist({
      ...draft,
      cats: { ...draft.cats, [id]: { name: name.trim(), emoji: emoji.trim() } },
    });

  /** 카테고리 안에서 사이트 위치 이동 */
  const move = (catId: string, siteId: string, dir: -1 | 1) => {
    const current = grouped[catId].map((s) => s.id);
    const i = current.indexOf(siteId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= current.length) return;
    [current[i], current[j]] = [current[j], current[i]];
    persist({ ...draft, order: { ...draft.order, [catId]: current } });
  };

  /** 유료 전용 사이트 토글 — 유료회원 이상만 볼 수 있게 */
  const paidSet = new Set(draft.paid ?? DEFAULT_PAID_SITE_IDS);
  const togglePaid = (siteId: string) => {
    const next = new Set(draft.paid ?? DEFAULT_PAID_SITE_IDS);
    if (next.has(siteId)) next.delete(siteId);
    else next.add(siteId);
    persist({ ...draft, paid: Array.from(next) });
  };

  /** 사이트를 다른 카테고리로 이동 */
  const moveToCategory = (siteId: string, toCat: string) => {
    const next: SiteConfig = {
      ...draft,
      catOf: { ...draft.catOf, [siteId]: toCat },
    };
    // 옮겨간 카테고리의 순서 목록 맨 뒤에 추가
    const target = (next.order[toCat] ?? grouped[toCat].map((s) => s.id)).filter(
      (id) => id !== siteId
    );
    next.order = { ...next.order, [toCat]: [...target, siteId] };
    persist(next);
  };

  const addSite = async () => {
    const u = url.trim();
    if (!name.trim() || !u.startsWith("https://")) {
      window.alert("이름과 https:// 로 시작하는 URL을 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const id = makeSiteId(u, new Set(sites.map((s) => s.id)));
      const r = await webappPost({
        action: "site-add",
        adminKey,
        id,
        cat,
        name: name.trim(),
        desc: desc.trim(),
        url: u,
      });
      if (!r.includes("ok")) {
        window.alert("등록 실패: " + r);
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  /** 사이트 수정 — 시트 등록분은 시트를, 코드 내장분은 설정 덮어쓰기를 갱신 */
  const editSite = async (id: string) => {
    const site = sites.find((s) => s.id === id);
    if (!site) return;
    const newName = window.prompt("사이트 이름", site.name);
    if (newName === null) return;
    const newDesc = window.prompt("한 줄 설명", site.desc);
    if (newDesc === null) return;
    const newUrl = window.prompt("URL (https://…)", site.url);
    if (newUrl === null || !newUrl.startsWith("https://")) return;

    const isDynamic = dynamic.some((d) => d.id === id);
    if (!isDynamic) {
      // 코드 내장 사이트 — Firestore 설정에 덮어쓰기로 저장 (소스는 그대로)
      await persist({
        ...draft,
        edits: {
          ...(draft.edits ?? {}),
          [id]: {
            name: newName.trim(),
            desc: newDesc.trim(),
            url: newUrl.trim(),
          },
        },
      });
      return;
    }

    setBusy(true);
    try {
      const r = await webappPost({
        action: "site-update",
        adminKey,
        id,
        cat: site.cat,
        name: newName.trim(),
        desc: newDesc.trim(),
        url: newUrl.trim(),
      });
      if (!r.includes("ok")) window.alert("수정 실패: " + r);
      else window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  /** 사이트 삭제 — 시트 등록분은 시트에서 제거, 코드 내장분은 화면에서 숨김 */
  const removeSite = async (id: string, siteName: string) => {
    const isDynamic = dynamic.some((d) => d.id === id);
    const msg = isDynamic
      ? `"${siteName}" 사이트를 삭제할까요?`
      : `"${siteName}" 사이트를 목록에서 숨길까요?\n(기본 제공 사이트라 삭제 대신 숨김 처리되며, 아래 "숨긴 사이트"에서 되돌릴 수 있어요)`;
    if (!window.confirm(msg)) return;

    if (!isDynamic) {
      await persist({
        ...draft,
        hidden: Array.from(new Set([...(draft.hidden ?? []), id])),
      });
      return;
    }

    setBusy(true);
    try {
      const r = await webappPost({ action: "site-delete", adminKey, id });
      if (!r.includes("ok")) window.alert("삭제 실패: " + r);
      else window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  /** 숨긴 사이트 되살리기 */
  const unhideSite = (id: string) =>
    persist({ ...draft, hidden: (draft.hidden ?? []).filter((x) => x !== id) });

  const inputCls =
    "w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700";

  return (
    <section className="space-y-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
      <h2 className="text-sm font-bold text-amber-500">
        🔓 관리자 — 사이트 · 카테고리 관리 (저장 즉시 반영)
      </h2>

      {/* 사이트 추가 */}
      <div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            aria-label="카테고리"
            className={inputCls}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="사이트 이름 (~14자)"
            className={inputCls}
          />
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="한 줄 설명 (~40자)"
            className={inputCls}
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.netlify.app"
            className={inputCls}
          />
        </div>
        <Button size="sm" className="mt-2" onClick={addSite} disabled={busy}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {busy ? "처리 중…" : "사이트 등록"}
        </Button>
      </div>

      {/* 카테고리 제목 편집 + 사이트 순서·이동 */}
      <div className="space-y-3 border-t border-amber-400/30 pt-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          카테고리 제목·이모지를 바꾸고, 사이트를 위/아래로 옮기거나 다른
          카테고리로 이동할 수 있습니다.
        </p>

        {CATEGORIES.map((base) => {
          const cur = draft.cats[base.id] ?? {};
          const list = grouped[base.id] ?? [];
          return (
            <div
              key={base.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: base.color }}
                />
                <input
                  type="text"
                  value={cur.emoji ?? base.emoji}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      cats: {
                        ...draft.cats,
                        [base.id]: { ...cur, emoji: e.target.value },
                      },
                    })
                  }
                  aria-label={`${base.name} 이모지`}
                  className="w-14 rounded-md border border-zinc-300 bg-background px-2 py-1.5 text-center text-sm dark:border-zinc-700"
                />
                <input
                  type="text"
                  value={cur.name ?? base.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      cats: {
                        ...draft.cats,
                        [base.id]: { ...cur, name: e.target.value },
                      },
                    })
                  }
                  aria-label={`${base.name} 제목`}
                  className="min-w-[140px] flex-1 rounded-md border border-zinc-300 bg-background px-2 py-1.5 text-sm font-bold dark:border-zinc-700"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    saveCategory(
                      base.id,
                      cur.name ?? base.name,
                      cur.emoji ?? base.emoji
                    )
                  }
                >
                  <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  저장
                </Button>
              </div>

              <div className="mt-2 space-y-1">
                {list.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <b>{s.name}</b>
                      <span className="ml-2 text-xs text-zinc-500">{s.url}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => move(base.id, s.id, -1)}
                      disabled={busy || i === 0}
                      aria-label={`${s.name} 위로`}
                      className="rounded p-1 text-zinc-500 hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(base.id, s.id, 1)}
                      disabled={busy || i === list.length - 1}
                      aria-label={`${s.name} 아래로`}
                      className="rounded p-1 text-zinc-500 hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>

                    <select
                      value={base.id}
                      onChange={(e) => moveToCategory(s.id, e.target.value)}
                      disabled={busy}
                      aria-label={`${s.name} 카테고리 이동`}
                      className="rounded-md border border-zinc-300 bg-background px-1.5 py-1 text-xs dark:border-zinc-700"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.name}
                        </option>
                      ))}
                    </select>

                    {/* 유료 전용 토글 — 켜지면 유료회원 이상만 이 사이트를 본다 */}
                    <button
                      type="button"
                      onClick={() => togglePaid(s.id)}
                      disabled={busy}
                      aria-pressed={paidSet.has(s.id)}
                      aria-label={`${s.name} 유료 전용 ${paidSet.has(s.id) ? "해제" : "지정"}`}
                      title={paidSet.has(s.id) ? "유료 전용 (클릭 시 해제)" : "무료 (클릭 시 유료 전용)"}
                      className={`rounded p-1 transition-colors disabled:opacity-40 ${
                        paidSet.has(s.id)
                          ? "text-emerald-500"
                          : "text-zinc-400 hover:text-foreground"
                      }`}
                    >
                      <DollarSign className="h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => editSite(s.id)}
                      disabled={busy}
                      aria-label={`${s.name} 수정`}
                      title="이름·설명·URL 수정"
                      className="rounded p-1 text-amber-500 hover:opacity-70 disabled:opacity-40"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSite(s.id, s.name)}
                      disabled={busy}
                      aria-label={`${s.name} 삭제`}
                      title={
                        dynamic.some((d) => d.id === s.id)
                          ? "삭제"
                          : "목록에서 숨기기 (되돌릴 수 있어요)"
                      }
                      className="rounded p-1 text-red-500 hover:opacity-70 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* 숨긴 사이트 — 되돌리기 */}
        {(draft.hidden ?? []).length > 0 && (
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
              🙈 숨긴 사이트 ({(draft.hidden ?? []).length}) — 되돌리려면 클릭
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(draft.hidden ?? []).map((id) => {
                const original = SITES.find((s) => s.id === id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => unhideSite(id)}
                    disabled={busy}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    {original?.name ?? id} ↩︎ 되살리기
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
