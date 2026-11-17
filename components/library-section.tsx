"use client";

// 자료실 — 구글 드라이브 폴더를 사이트 안에서 보여준다.
//   · 일반회원/비로그인 : 잠금 안내만
//   · 유료회원 이상     : 목록 조회 + 다운로드
//   · 관리자 모드       : 업로드 + 삭제 (업로드는 관리자만)
// 실제 저장은 Apps Script 웹앱(scripts/library-webapp.gs)이 내 구글 드라이브에 한다.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  FolderCheck,
  FolderOpen,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminKey, useAdminOn } from "@/lib/admin";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { getFirebaseApp, getFirebaseAuth } from "@/lib/firebase";
import { beginLoading, endLoading } from "@/lib/loading-bus";
import { useEffectiveGroup } from "@/lib/membership";
import { useSiteConfig } from "@/lib/site-config";
import {
  MAX_UPLOAD_MB,
  canPickSaveFolder,
  deleteLibraryFile,
  downloadLibraryFile,
  fileEmoji,
  formatBytes,
  freeWindowStatus,
  getDownloadLocationGuide,
  listLibraryFiles,
  saveBlobWithPicker,
  setLibraryFreeWindow,
  setLibraryVip,
  shortDate,
  triggerBlobDownload,
  uploadLibraryFile,
  type LibraryFile,
} from "@/lib/library";

type DownloadState =
  | {
      phase: "authorizing";
      fileId: string;
      fileName: string;
    }
  | {
      phase: "downloading";
      fileId: string;
      fileName: string;
      loaded: number;
      total: number;
      speedBps: number;
    }
  | {
      phase: "completed";
      fileId: string;
      fileName: string;
      size: number;
      blob: Blob | null;
      blobUrl: string | null;
      directUrl: string | null;
      savedCustomName?: string;
    }
  | {
      phase: "error";
      fileId: string;
      fileName: string;
      message: string;
    };

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

function DownloadStatusPanel({
  state,
  canPickFolder,
  onCancel,
  onRetry,
  onDismiss,
  onSaveToFolder,
}: {
  state: DownloadState;
  canPickFolder: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  onSaveToFolder: () => void;
}) {
  if (state.phase === "authorizing") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="basis-full rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold text-sky-700 dark:text-sky-300">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            1/2단계 · 서버 연결 및 다운로드 권한 확인 중…
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:border-zinc-400 hover:text-foreground dark:border-zinc-700 dark:text-zinc-300"
          >
            취소
          </button>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sky-500/15">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-sky-500" />
        </div>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          처음이면 잠든 서버를 깨우느라 최대 30초쯤 걸릴 수 있어요. 새 창 없이 이 화면에서 바로 받아집니다.
        </p>
      </div>
    );
  }

  if (state.phase === "downloading") {
    const hasTotal = state.total > 0;
    const pct = hasTotal
      ? Math.min(100, Math.round((state.loaded / state.total) * 100))
      : null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="basis-full rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold text-sky-700 dark:text-sky-300">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            2/2단계 · 파일 내려받는 중…
            {pct !== null && <span className="font-extrabold">{pct}%</span>}
          </span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
              {formatBytes(state.loaded)}
              {hasTotal ? ` / ${formatBytes(state.total)}` : ""}
              {state.speedBps > 0 ? ` · ${formatBytes(state.speedBps)}/s` : ""}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:border-zinc-400 hover:text-foreground dark:border-zinc-700 dark:text-zinc-300"
            >
              취소
            </button>
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sky-500/15"
        >
          <div
            className={`h-full rounded-full bg-sky-500 transition-[width] duration-150 ${
              pct === null ? "w-1/2 animate-pulse" : ""
            }`}
            style={pct !== null ? { width: `${pct}%` } : undefined}
          />
        </div>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          다운로드가 끝나면 바로 저장 위치와 확인 방법을 알려드릴게요.
        </p>
      </div>
    );
  }

  if (state.phase === "completed") {
    const guide = getDownloadLocationGuide(state.fileName);
    return (
      <div
        role="status"
        aria-live="polite"
        className="basis-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {state.directUrl
                ? `"${state.fileName}" 다운로드를 시작했어요!`
                : `"${state.fileName}" 다운로드 완료!`}
              {state.size > 0 && (
                <span className="ml-1.5 font-normal text-emerald-700/80 dark:text-emerald-300/80">
                  ({formatBytes(state.size)})
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="다운로드 완료 안내 닫기"
            className="rounded-full p-1 text-zinc-500 hover:bg-emerald-500/15 hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2 space-y-1 leading-relaxed text-zinc-700 dark:text-zinc-200">
          {state.savedCustomName ? (
            <p className="font-semibold text-emerald-700 dark:text-emerald-300">
              📁 직접 선택하신 폴더에 &ldquo;{state.savedCustomName}&rdquo; 파일로 저장되었어요.
            </p>
          ) : (
            <>
              <p>
                <span className="font-semibold">📁 저장 위치:</span> {guide.location}
              </p>
              <p className="text-zinc-600 dark:text-zinc-300">
                <span className="font-semibold">🔍 바로 여는 법:</span> {guide.shortcutTip}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                ※ 브라우저 보안상 사용자가 따로 바꾼 폴더 경로까지는 웹에서 직접 읽을 수 없어요.
                다른 폴더로 설정하셨다면 위 다운로드 목록에서 확인하거나 아래에서 저장 폴더를 직접 골라 주세요.
              </p>
            </>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {state.blobUrl && (
            <button
              type="button"
              onClick={() => triggerBlobDownload(state.blobUrl!, state.fileName)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-emerald-600/40 bg-background/80 px-3 py-1 font-semibold text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              다시 저장
            </button>
          )}
          {state.blob && canPickFolder && (
            <button
              type="button"
              onClick={onSaveToFolder}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700"
            >
              <FolderCheck className="h-3.5 w-3.5" aria-hidden="true" />
              다른 폴더에 저장…
            </button>
          )}
          {state.directUrl && (
            <a
              href={state.directUrl}
              download={state.fileName}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              다운로드가 안 시작됐나요? 직접 받기
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="basis-full rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {state.message}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-red-500/40 px-2.5 py-1 font-semibold hover:bg-red-500/10"
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="오류 닫기"
            className="rounded-full p-1 hover:bg-red-500/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LibrarySection() {
  const cfg = useSiteConfig();
  const group = useEffectiveGroup();
  const adminOn = useAdminOn();
  // 목록은 누구나 볼 수 있고, 압축파일(zip)만 유료회원 이상이 받을 수 있다.
  // 아래 판정은 화면 표시용이고, 실제 차단은 웹앱이 로그인 토큰을 검증해 수행한다.
  const paidUp = group === "paid" || group === "vip" || group === "admin";

  const url = cfg.libraryUrl?.trim() ?? "";
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dlState, setDlState] = useState<DownloadState | null>(null);
  const dlAbortRef = useRef<AbortController | null>(null);
  const dlBlobUrlRef = useRef<string | null>(null);
  const [canPickFolder, setCanPickFolder] = useState(false);

  useEffect(() => {
    setCanPickFolder(canPickSaveFolder());
    return () => {
      dlAbortRef.current?.abort();
      if (dlBlobUrlRef.current) {
        URL.revokeObjectURL(dlBlobUrlRef.current);
        dlBlobUrlRef.current = null;
      }
    };
  }, []);

  const clearDownloadState = () => {
    dlAbortRef.current?.abort();
    dlAbortRef.current = null;
    if (dlBlobUrlRef.current) {
      URL.revokeObjectURL(dlBlobUrlRef.current);
      dlBlobUrlRef.current = null;
    }
    setDlState(null);
  };

  // 섹션 접기 — 제목만 남기고 숨기기.
  // 새로 접속(로그인)하면 항상 숨긴 채 시작 — 세션 중 직접 펼친 기록만
  // sessionStorage 에 남아 있으면 그 상태를 존중한다.
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    try {
      const v = sessionStorage.getItem("25world:library-collapsed");
      if (v !== null) setCollapsed(v === "1");
    } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        sessionStorage.setItem("25world:library-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const load = useCallback(async () => {
    if (!url) return;
    setError("");
    beginLoading("library");
    try {
      setFiles(await listLibraryFiles(url));
    } catch (e) {
      setFiles([]);
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      endLoading("library");
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  // 관리자 모드: 파일별 다운로드 횟수 (tg-post-saver 가 끝까지 받은 경우만 기록 — libraryStats/{fileId})
  const [dlStats, setDlStats] = useState<Record<string, { downloads: number; lastAt?: string }>>({});
  useEffect(() => {
    if (!adminOn || !files) return;
    getDocs(collection(getFirestore(getFirebaseApp()), "libraryStats"))
      .then((s) => {
        const m: Record<string, { downloads: number; lastAt?: string }> = {};
        s.forEach((d) => {
          m[d.id] = { downloads: Number(d.get("downloads") || 0), lastAt: d.get("lastAt") };
        });
        setDlStats(m);
      })
      .catch(() => {});
  }, [adminOn, files]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const key = getAdminKey();
    if (!key) {
      setError("관리자 모드에서만 업로드할 수 있습니다.");
      return;
    }
    setError("");
    for (const f of Array.from(list)) {
      setBusy(`"${f.name}" 업로드 중… 0%`);
      try {
        await uploadLibraryFile(url, key, f, "", (pct) =>
          setBusy(`"${f.name}" 업로드 중… ${Math.round(pct)}%`)
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "업로드에 실패했습니다.");
        break;
      }
    }
    setBusy("");
    if (inputRef.current) inputRef.current.value = "";
    load();
  };

  // 다운로드 — tg-post-saver 서버가 권한(로그인·VIP·무료기간·유료회원)을 확인한 뒤
  // 구글 드라이브에서 받아 현재 화면에서 실시간 진행률과 함께 내려받는다.
  // about:blank 새 창을 열지 않으므로 빈 화면이 남지 않고, 완료 후 저장 위치도 바로 안내한다.
  const download = async (f: LibraryFile) => {
    setError("");
    clearDownloadState();

    const adminKey = getAdminKey();
    const user = getFirebaseAuth().currentUser;
    if (!adminKey && !user) {
      setDlState({
        phase: "error",
        fileId: f.id,
        fileName: f.name,
        message: "로그인 정보가 없어요. 새로고침한 뒤 다시 로그인해 주세요.",
      });
      return;
    }

    const controller = new AbortController();
    dlAbortRef.current = controller;
    setDlState({ phase: "authorizing", fileId: f.id, fileName: f.name });

    try {
      const idToken = await user?.getIdToken();
      const result = await downloadLibraryFile({
        fileId: f.id,
        fileName: f.name,
        fileSize: f.size,
        mimeType: f.mimeType,
        idToken,
        adminKey,
        signal: controller.signal,
        onStage: (stage) => {
          if (stage === "downloading") {
            setDlState({
              phase: "downloading",
              fileId: f.id,
              fileName: f.name,
              loaded: 0,
              total: f.size,
              speedBps: 0,
            });
          }
        },
        onProgress: ({ loaded, total, speedBps }) => {
          setDlState({
            phase: "downloading",
            fileId: f.id,
            fileName: f.name,
            loaded,
            total,
            speedBps,
          });
        },
      });

      if (result.mode === "blob") {
        dlBlobUrlRef.current = result.blobUrl;
        setDlState({
          phase: "completed",
          fileId: f.id,
          fileName: result.name,
          size: result.size,
          blob: result.blob,
          blobUrl: result.blobUrl,
          directUrl: null,
        });
      } else {
        setDlState({
          phase: "completed",
          fileId: f.id,
          fileName: result.name,
          size: result.size,
          blob: null,
          blobUrl: null,
          directUrl: result.url,
        });
      }
    } catch (e) {
      if (
        controller.signal.aborted ||
        (e instanceof DOMException && e.name === "AbortError")
      ) {
        setDlState(null);
        return;
      }
      setDlState({
        phase: "error",
        fileId: f.id,
        fileName: f.name,
        message: e instanceof Error ? e.message : "다운로드에 실패했습니다.",
      });
    } finally {
      if (dlAbortRef.current === controller) {
        dlAbortRef.current = null;
      }
    }
  };

  const cancelDownload = () => {
    clearDownloadState();
  };

  const saveToPickedFolder = async () => {
    if (!dlState || dlState.phase !== "completed" || !dlState.blob) return;
    try {
      const savedName = await saveBlobWithPicker(dlState.blob, dlState.fileName);
      if (savedName) {
        setDlState((prev) =>
          prev && prev.phase === "completed" ? { ...prev, savedCustomName: savedName } : prev
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "다른 폴더에 저장하지 못했습니다.");
    }
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

  // 관리자: 파일을 VIP(유료 전용)로 지정/해제 (확장자 기본값을 덮어쓴다)
  const toggleVip = async (f: LibraryFile) => {
    const next = !f.vip;
    setFiles((prev) =>
      prev ? prev.map((x) => (x.id === f.id ? { ...x, vip: next } : x)) : prev
    );
    try {
      await setLibraryVip(url, getAdminKey(), f.id, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "VIP 설정에 실패했습니다.");
      load(); // 실패 시 서버 상태로 되돌림
    }
  };

  // 관리자: 한시적 무료 기간 편집 — 기간 안에는 일반회원 포함 모두, 밖에는 VIP 전용
  const [winEdit, setWinEdit] = useState<{ id: string; start: string; end: string } | null>(
    null
  );

  const openWindowEditor = (f: LibraryFile) => {
    // 오늘(한국시간)부터 5일간을 기본값으로 — "sv-SE" 로케일은 YYYY-MM-DD 로 찍힌다
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const plus4 = new Date(Date.now() + 4 * 86400000).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Seoul",
    });
    setError("");
    setWinMsg(null);
    setWinEdit({ id: f.id, start: f.freeStart || today, end: f.freeEnd || plus4 });
  };

  // 기간 편집 폼 안에 바로 보여줄 진행·결과 문구.
  // 섹션 위쪽의 공용 오류 자리는 폼에서 멀어서, 저장을 눌러도 "아무 반응이 없는" 것처럼 보였다.
  const [winMsg, setWinMsg] = useState<{ kind: "saving" | "ok" | "error"; text: string } | null>(
    null
  );

  const saveFreeWindow = async (start: string, end: string) => {
    if (!winEdit) return;
    if (Boolean(start) !== Boolean(end)) {
      setWinMsg({ kind: "error", text: "시작일과 종료일을 모두 입력해 주세요." });
      return;
    }
    if (start && start > end) {
      setWinMsg({ kind: "error", text: "종료일이 시작일보다 빠를 수 없습니다." });
      return;
    }
    const id = winEdit.id;
    setError("");
    setWinMsg({ kind: "saving", text: start ? "저장하는 중… (몇 초 걸려요)" : "기간을 해제하는 중…" });
    setBusy(start ? "무료 기간 저장 중…" : "무료 기간 해제 중…");
    try {
      await setLibraryFreeWindow(url, getAdminKey(), id, start, end);
      await load(); // 서버에 실제로 반영된 값으로 배지를 다시 그린다
      setWinMsg({
        kind: "ok",
        text: start
          ? `✅ 적용 완료 — ${shortDate(start)}~${shortDate(end)} 동안 일반회원도 다운로드할 수 있어요.`
          : "✅ 기간을 해제했어요 — 이제 VIP(유료회원 이상) 전용입니다.",
      });
      // 결과를 읽을 시간을 준 뒤 닫는다
      setTimeout(() => {
        setWinEdit((w) => (w?.id === id ? null : w));
        setWinMsg(null);
      }, 3000);
    } catch (e) {
      setWinMsg({
        kind: "error",
        text: e instanceof Error ? e.message : "기간 설정에 실패했습니다.",
      });
    }
    setBusy("");
  };

  const isDownloading =
    dlState?.phase === "authorizing" || dlState?.phase === "downloading";
  const actionBusy = Boolean(busy) || isDownloading;

  const heading = (
    <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-zinc-400" />
      <span aria-hidden="true">🗂️</span>
      <span>자료실</span>
      {url && (
        <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
          ({files?.length ?? "…"})
        </span>
      )}
      {url && !collapsed && (
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
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls="library-content"
        className="flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-500 transition-colors hover:border-zinc-400 hover:text-foreground dark:border-zinc-700 dark:text-zinc-400"
      >
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-180"}`}
        />
        {collapsed ? "펼치기" : "숨기기"}
      </button>
    </h2>
  );

  return (
    <section id="library" className="scroll-mt-16">
      {heading}
      {!collapsed && (
      <div id="library-content">
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        우리 모두가 만든 자료입니다. 상상은 현실이 되는 AI시대, 같이 공유드립니다.
      </p>

      {/* 일반회원 안내 — 목록은 보이되 zip 은 잠긴다 */}
      {!paidUp && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/5 px-4 py-2.5 text-sm text-amber-500">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-amber-500">VIP</span> 표시가 붙은
            압축파일은 유료회원 이상만 받을 수 있어요. 나머지 자료는 바로
            내려받을 수 있습니다.
          </span>
        </p>
      )}

      {/* 연결 전 안내 */}
      {!url && (
        <p className="mt-4 rounded-xl border border-zinc-200 bg-background/60 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          자료실이 아직 준비 중입니다.
          {adminOn && (
            <>
              {" "}
              <a href="/admin" className="font-semibold text-amber-500 underline-offset-4 hover:underline">
                관리자 페이지
              </a>
              에서 드라이브를 연결해 주세요.
            </>
          )}
        </p>
      )}

      {url && (
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
                  disabled={actionBusy}
                  className="gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  파일 업로드
                </Button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {busy ||
                    `한 파일당 최대 ${MAX_UPLOAD_MB / 1024}GB · 여러 개 선택 가능 (드라이브 잔여 용량까지)`}
                </span>
              </div>
            </div>
          )}

          {/* 진행 문구 — 예전에는 버튼만 잠기고 아무것도 보이지 않아 "반응이 없는" 것처럼 보였다 */}
          {busy && (
            <p role="status" className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              {busy}
            </p>
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
            {files?.map((f) => {
              const vip = f.vip;
              const win = freeWindowStatus(f);
              // 무료 기간 중에는 등급과 무관하게 받을 수 있다 (실제 허용은 서버가 판정)
              const locked = vip && !paidUp && win !== "active";
              const isThisFile = dlState?.fileId === f.id;
              const isThisDownloading =
                isThisFile &&
                (dlState?.phase === "authorizing" || dlState?.phase === "downloading");
              const dlButtonLabel = !isThisDownloading
                ? "다운로드"
                : dlState.phase === "authorizing"
                  ? "준비 중…"
                  : dlState.total > 0
                    ? `${Math.min(100, Math.round((dlState.loaded / dlState.total) * 100))}% 받는 중`
                    : "받는 중…";
              return (
              <article
                key={f.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-background/60 px-4 py-3 dark:border-zinc-800 ${
                  locked ? "opacity-60" : ""
                }`}
              >
                <span aria-hidden="true" className="text-xl">
                  {fileEmoji(f.name, f.mimeType)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold">{f.name}</span>
                    {vip && (
                      <span
                        title={
                          win === "active"
                            ? "무료 기간이 끝나면 유료회원 이상만 다운로드 가능"
                            : "유료회원 이상 다운로드 가능"
                        }
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                          win === "active"
                            ? "border border-amber-400 text-amber-500 line-through decoration-2"
                            : "bg-amber-400 text-black"
                        }`}
                      >
                        VIP
                      </span>
                    )}
                    {win === "active" && (
                      <span
                        title={`${f.freeStart} ~ ${f.freeEnd} 누구나 다운로드 가능`}
                        className="shrink-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
                      >
                        🎁 무료 ~{shortDate(f.freeEnd)}
                      </span>
                    )}
                    {win === "upcoming" && (
                      <span
                        title={`${f.freeStart} ~ ${f.freeEnd} 누구나 다운로드 가능`}
                        className="shrink-0 rounded border border-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        무료 예정 {shortDate(f.freeStart)}~{shortDate(f.freeEnd)}
                      </span>
                    )}
                    {win === "ended" && adminOn && (
                      <span
                        title={`${f.freeStart} ~ ${f.freeEnd} 무료 기간 종료 — 지금은 VIP 전용`}
                        className="shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400 dark:border-zinc-700"
                      >
                        무료 종료 {shortDate(f.freeEnd)}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                    {formatBytes(f.size)} · {formatKST(f.updatedAt)}
                    {f.desc && ` · ${f.desc}`}
                    {adminOn && (
                      <span
                        title={
                          dlStats[f.id]?.lastAt
                            ? `마지막 다운로드 ${formatKST(dlStats[f.id].lastAt!)} · 관리자 모드에서 받은 것은 제외`
                            : "관리자 모드에서 받은 것은 제외"
                        }
                        className="ml-1 font-semibold text-violet-500"
                      >
                        · ⬇ 다운로드 {(dlStats[f.id]?.downloads ?? 0).toLocaleString()}회
                      </span>
                    )}
                  </span>
                </span>
                {locked ? (
                  <span
                    aria-disabled="true"
                    title="유료회원 이상 전용입니다"
                    className="flex min-h-[44px] cursor-not-allowed items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                  >
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    유료회원 전용
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => download(f)}
                    disabled={actionBusy}
                    aria-label={`${f.name} 다운로드`}
                    className={`flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                      isThisDownloading
                        ? "border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-foreground dark:border-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {isThisDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden="true" />
                    )}
                    {dlButtonLabel}
                  </button>
                )}
                {adminOn && (
                  <button
                    type="button"
                    onClick={() => toggleVip(f)}
                    disabled={actionBusy}
                    aria-pressed={vip}
                    aria-label={`${f.name} 유료 전용 지정 토글`}
                    title={vip ? "유료 전용 해제" : "유료 전용(VIP) 지정"}
                    className={`flex min-h-[44px] items-center rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                      vip
                        ? "border-amber-400 bg-amber-400 text-black"
                        : "border-zinc-300 text-zinc-400 hover:border-amber-400 hover:text-amber-500 dark:border-zinc-700"
                    }`}
                  >
                    VIP
                  </button>
                )}
                {adminOn && (
                  <button
                    type="button"
                    onClick={() =>
                      winEdit?.id === f.id ? setWinEdit(null) : openWindowEditor(f)
                    }
                    disabled={actionBusy}
                    aria-expanded={winEdit?.id === f.id}
                    aria-label={`${f.name} 한시적 무료 기간 설정`}
                    title="한시적 무료 기간 설정"
                    className={`flex min-h-[44px] items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                      win === "active" || win === "upcoming"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-zinc-300 text-zinc-400 hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700"
                    }`}
                  >
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    기간
                  </button>
                )}
                {adminOn && (
                  <button
                    type="button"
                    onClick={() => remove(f)}
                    disabled={actionBusy}
                    aria-label={`${f.name} 삭제`}
                    className="flex min-h-[44px] w-11 items-center justify-center rounded-full border border-zinc-300 text-red-500 transition-colors hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-zinc-700"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                {isThisFile && dlState && (
                  <DownloadStatusPanel
                    state={dlState}
                    canPickFolder={canPickFolder}
                    onCancel={cancelDownload}
                    onRetry={() => download(f)}
                    onDismiss={clearDownloadState}
                    onSaveToFolder={saveToPickedFolder}
                  />
                )}
                {adminOn && winEdit?.id === f.id && (
                  <form
                    className="flex basis-full flex-wrap items-end gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveFreeWindow(winEdit.start, winEdit.end);
                    }}
                  >
                    <p className="basis-full text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                      기간 안에는 <b>일반회원 포함 모두</b> 다운로드할 수 있고, 시작 전과 종료 후에는{" "}
                      <b className="text-amber-500">VIP(유료회원 이상) 전용</b>입니다. 한국시간 기준이며
                      종료일 당일 23:59까지 포함됩니다.
                    </p>
                    <label className="flex flex-col gap-1 text-xs font-semibold">
                      시작일
                      <input
                        type="date"
                        required
                        value={winEdit.start}
                        max={winEdit.end || undefined}
                        onChange={(e) => setWinEdit({ ...winEdit, start: e.target.value })}
                        className="min-h-[44px] rounded-md border border-zinc-300 bg-background px-2 text-sm dark:border-zinc-700"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold">
                      종료일
                      <input
                        type="date"
                        required
                        value={winEdit.end}
                        min={winEdit.start || undefined}
                        onChange={(e) => setWinEdit({ ...winEdit, end: e.target.value })}
                        className="min-h-[44px] rounded-md border border-zinc-300 bg-background px-2 text-sm dark:border-zinc-700"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={Boolean(busy) || winMsg?.kind === "ok"}
                      className="min-h-[44px] rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {winMsg?.kind === "saving" ? "저장 중…" : winMsg?.kind === "ok" ? "적용됨" : "저장"}
                    </button>
                    {f.freeStart && (
                      <button
                        type="button"
                        onClick={() => saveFreeWindow("", "")}
                        disabled={Boolean(busy) || winMsg?.kind === "ok"}
                        className="min-h-[44px] rounded-full border border-zinc-300 px-4 text-sm font-semibold text-zinc-600 hover:border-red-400 hover:text-red-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        기간 해제
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setWinEdit(null);
                        setWinMsg(null);
                      }}
                      className="min-h-[44px] rounded-full px-3 text-sm text-zinc-500 hover:text-foreground"
                    >
                      취소
                    </button>
                    {/* 진행·결과를 폼 바로 아래에 보여준다 */}
                    {winMsg && (
                      <p
                        role={winMsg.kind === "error" ? "alert" : "status"}
                        className={`basis-full rounded-md px-3 py-2 text-sm font-semibold ${
                          winMsg.kind === "ok"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : winMsg.kind === "error"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400"
                              : "text-zinc-500"
                        }`}
                      >
                        {winMsg.text}
                      </p>
                    )}
                  </form>
                )}
              </article>
              );
            })}
          </div>
        </>
      )}
      </div>
      )}
    </section>
  );
}
