"use client";

// 관리자 사이트 관리 패널 — 카테고리·이름·설명·URL 입력으로 사이트를
// 구글시트 'sites' 탭에 등록/수정/삭제. 재배포 없이 즉시 반영.
// (코드에 내장된 기본 사이트 22종은 여기서 편집되지 않음 — lib/sites.ts 관리)
import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_EVENT, getAdminKey } from "@/components/admin-button";
import { CATEGORIES } from "@/lib/sites";
import { useSites, webappPost } from "@/lib/use-sites";

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
  const [cat, setCat] = useState(CATEGORIES[0].id as string);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const { sites, dynamic } = useSites();

  useEffect(() => {
    const sync = () => setAdminKey(getAdminKey());
    sync();
    window.addEventListener(ADMIN_EVENT, sync);
    return () => window.removeEventListener(ADMIN_EVENT, sync);
  }, []);

  if (!adminKey) return null;

  const add = async () => {
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
        window.alert(
          "등록 실패: " +
            r +
            "\n(앱스크립트가 v3 인지 확인하세요 — 사이트 관리 기능은 v3 필요)"
        );
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const edit = async (id: string) => {
    const site = dynamic.find((s) => s.id === id);
    if (!site) return;
    const newName = window.prompt("사이트 이름", site.name);
    if (newName === null) return;
    const newDesc = window.prompt("한 줄 설명", site.desc);
    if (newDesc === null) return;
    const newUrl = window.prompt("URL (https://…)", site.url);
    if (newUrl === null || !newUrl.startsWith("https://")) return;
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

  const remove = async (id: string, siteName: string) => {
    if (!window.confirm(`"${siteName}" 사이트를 삭제할까요?`)) return;
    setBusy(true);
    try {
      const r = await webappPost({ action: "site-delete", adminKey, id });
      if (!r.includes("ok")) window.alert("삭제 실패: " + r);
      else window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700";

  return (
    <section className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
      <h2 className="text-sm font-bold text-amber-500">
        🔓 관리자 — 사이트 추가/관리 (저장 즉시 웹에 반영)
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          aria-label="카테고리"
          className={inputCls}
        >
          {CATEGORIES.map((c) => (
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
      <Button size="sm" className="mt-2" onClick={add} disabled={busy}>
        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {busy ? "처리 중…" : "사이트 등록"}
      </Button>

      {dynamic.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-amber-400/30 pt-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            관리자 등록 사이트 ({dynamic.length})
          </p>
          {dynamic.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span aria-hidden="true">
                {CATEGORIES.find((c) => c.id === s.cat)?.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <b>{s.name}</b>
                <span className="ml-2 text-xs text-zinc-500">{s.url}</span>
              </span>
              <button
                type="button"
                onClick={() => edit(s.id)}
                disabled={busy}
                aria-label={`${s.name} 수정`}
                className="text-amber-500 hover:opacity-70 disabled:opacity-40"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => remove(s.id, s.name)}
                disabled={busy}
                aria-label={`${s.name} 삭제`}
                className="text-red-500 hover:opacity-70 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
