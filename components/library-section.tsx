"use client";

// 자료실 — 구글 드라이브 폴더를 사이트 안에서 보여준다.
//   · 일반회원/비로그인 : 잠금 안내만
//   · 유료회원 이상     : 목록 조회 + 다운로드
//   · 관리자 모드       : 업로드 + 삭제 (업로드는 관리자만)
// 실제 저장은 Apps Script 웹앱(scripts/library-webapp.gs)이 내 구글 드라이브에 한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Lock, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminKey, useAdminOn } from "@/components/admin-button";
import { useEffectiveGroup } from "@/lib/membership";
import { useSiteConfig, saveSiteConfig } from "@/lib/site-config";
import {
  MAX_UPLOAD_MB,
  deleteLibraryFile,
  fileEmoji,
  formatBytes,
  listLibraryFiles,
  uploadLibraryFile,
  type LibraryFile,
} from "@/lib/library";

function formatKST(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function LibrarySection() {
  const cfg = useSiteConfig();
  const group = useEffectiveGroup();
  const adminOn = useAdminOn();
  const canSee = group === "paid" || group === "vip" || group === "admin";

  const url = cfg.libraryUrl?.trim() ?? "";
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!url || !canSee) return;
    setError("");
    try {
      setFiles(await listLibraryFiles(url));
    } catch (e) {
      setFiles([]);
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    }
  }, [url, canSee]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const key = getAdminKey();
    if (!key) {
      setError("관리자 모드에서만 업로드할 수 있습니다.");
      return;
    }
    setError("");
    for (const f of Array.from(list)) {
      setBusy(`"${f.name}" 업로드 중…`);
      try {
        await uploadLibraryFile(url, key, f);
      } catch (e) {
        setError(e instanceof Error ? e.message : "업로드에 실패했습니다.");
        break;
      }
    }
    setBusy("");
    if (inputRef.current) inputRef.current.value = "";
    load();
  };

  const remove = async (f: LibraryFile) => {
    if (!window.confirm(`"${f.name}" 을(를) 삭제할까요? (드라이브 휴지통으로 이동)`)) return;
    setBusy("삭제 중…");
    try {
      await deleteLibraryFile(url, getAdminKey(), f.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
    setBusy("");
    load();
  };

  const saveUrl = async () => {
    const v = urlDraft.trim();
    if (v && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(v)) {
      setError("Apps Script 웹앱의 /exec 로 끝나는 URL 을 넣어주세요.");
      return;
    }
    await saveSiteConfig({ ...cfg, libraryUrl: v });
    setUrlDraft("");
  };

  const heading = (
    <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-zinc-400" />
      <span aria-hidden="true">🗂️</span>
      <span>자료실</span>
      {canSee && url && (
        <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
          ({files?.length ?? "…"})
        </span>
      )}
      {canSee && url && (
        <button
          type="button"
          onClick={load}
          aria-label="목록 새로고침"
          className="ml-1 flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-500 transition-colors hover:border-zinc-400 hover:text-foreground dark:border-zinc-700 dark:text-zinc-400"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          새로고침
        </button>
      )}
    </h2>
  );

  return (
    <section id="library" className="scroll-mt-16">
      {heading}
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        유료회원 이상만 열람·다운로드할 수 있는 공유 자료 폴더입니다. 업로드는
        관리자만 가능합니다.
      </p>

      {/* 관리자 모드: 웹앱 URL 설정 (한 번만) */}
      {adminOn && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
          <p className="font-semibold text-amber-500">
            관리자 — 자료실 드라이브 연결
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {url ? (
              <>
                현재 연결됨: <span className="break-all">{url}</span>
              </>
            ) : (
              <>
                <code>scripts/library-webapp.gs</code> 를 Apps Script 에 배포한 뒤
                받은 /exec URL 을 넣어주세요.
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
            />
            <Button onClick={saveUrl} disabled={!urlDraft.trim()}>
              연결 저장
            </Button>
          </div>
        </div>
      )}

      {/* 비회원·일반회원 잠금 */}
      {!canSee && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-500">
            <Lock className="h-4 w-4" aria-hidden="true" />
            자료실{" "}
            <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-black">
              VIP
            </span>
          </p>
          <p className="mt-1.5 text-zinc-500 dark:text-zinc-400">
            유료회원 이상 전용입니다. 등급을 올리면 자료 목록과 다운로드가 열립니다.
          </p>
        </div>
      )}

      {/* 연결 전 안내 */}
      {canSee && !url && (
        <p className="mt-4 rounded-xl border border-zinc-200 bg-background/60 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          자료실이 아직 준비 중입니다.
        </p>
      )}

      {canSee && url && (
        <>
          {/* 관리자 업로드 */}
          {adminOn && (
            <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  onChange={(e) => upload(e.target.files)}
                  className="hidden"
                  id="library-file"
                />
                <Button
                  onClick={() => inputRef.current?.click()}
                  disabled={Boolean(busy)}
                  className="gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  파일 업로드
                </Button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {busy || `한 파일당 최대 ${MAX_UPLOAD_MB}MB · 여러 개 선택 가능`}
                </span>
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          <div className="mt-4 space-y-2">
            {files === null && !error && (
              <p className="text-sm text-zinc-500">불러오는 중…</p>
            )}
            {files?.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-zinc-500">
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                아직 올라온 자료가 없습니다.
              </p>
            )}
            {files?.map((f) => (
              <article
                key={f.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-background/60 px-4 py-3 dark:border-zinc-800"
              >
                <span aria-hidden="true" className="text-xl">
                  {fileEmoji(f.name, f.mimeType)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{f.name}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                    {formatBytes(f.size)} · {formatKST(f.updatedAt)}
                    {f.desc && ` · ${f.desc}`}
                  </span>
                </span>
                <a
                  href={f.downloadUrl}
                  target="_blank"
                  rel="noopener"
                  aria-label={`${f.name} 다운로드`}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  다운로드
                </a>
                {adminOn && (
                  <button
                    type="button"
                    onClick={() => remove(f)}
                    disabled={Boolean(busy)}
                    aria-label={`${f.name} 삭제`}
                    className="flex min-h-[44px] w-11 items-center justify-center rounded-full border border-zinc-300 text-red-500 transition-colors hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-zinc-700"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
