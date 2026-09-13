"use client";

// 자료실 — 구글 드라이브 폴더를 사이트 안에서 보여준다.
//   · 일반회원/비로그인 : 잠금 안내만
//   · 유료회원 이상     : 목록 조회 + 다운로드
//   · 관리자 모드       : 업로드 + 삭제 (업로드는 관리자만)
// 실제 저장은 Apps Script 웹앱(scripts/library-webapp.gs)이 내 구글 드라이브에 한다.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  Download,
  FolderOpen,
  Lock,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminKey, useAdminOn } from "@/components/admin-button";
import { getFirebaseAuth } from "@/lib/firebase";
import { beginLoading, endLoading } from "@/lib/loading-bus";
import { listUsers, useEffectiveGroup } from "@/lib/membership";
import { useSiteConfig, saveSiteConfig } from "@/lib/site-config";
import {
  MAX_UPLOAD_MB,
  deleteLibraryFile,
  fileEmoji,
  formatBytes,
  freeWindowStatus,
  listLibraryFiles,
  requestDownloadUrl,
  revokeAllAccess,
  setLibraryFreeWindow,
  setLibraryVip,
  shortDate,
  syncPaidEmails,
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
  // 목록은 누구나 볼 수 있고, 압축파일(zip)만 유료회원 이상이 받을 수 있다.
  // 아래 판정은 화면 표시용이고, 실제 차단은 웹앱이 로그인 토큰을 검증해 수행한다.
  const paidUp = group === "paid" || group === "vip" || group === "admin";

  const url = cfg.libraryUrl?.trim() ?? "";
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  // 다운로드 — 웹앱이 신원·등급을 확인한 뒤 내주는 링크로만 연다
  const download = async (f: LibraryFile) => {
    setError("");
    setBusy(`"${f.name}" 준비 중…`);
    try {
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      const link = await requestDownloadUrl(url, {
        idToken,
        adminKey: getAdminKey(),
        fileId: f.id,
      });
      window.open(link, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "다운로드에 실패했습니다.");
    }
    setBusy("");
  };

  // 유료회원 이메일을 웹앱에 밀어 넣는다 — 서버가 이 목록으로 다운로드를 판정한다
  const syncPaid = async () => {
    setBusy("유료회원 목록 동기화 중…");
    setError("");
    try {
      const users = await listUsers();
      const emails = users
        .filter((u) => u.group !== "general" && u.email)
        .map((u) => u.email);
      const n = await syncPaidEmails(url, getAdminKey(), emails);
      setBusy("");
      window.alert(`유료회원 이상 ${n}명의 다운로드 권한을 동기화했습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "동기화에 실패했습니다.");
      setBusy("");
    }
  };

  const revokeAll = async () => {
    if (!window.confirm("지금까지 부여된 파일 열람 권한을 모두 회수할까요?")) return;
    setBusy("권한 회수 중…");
    try {
      const n = await revokeAllAccess(url, getAdminKey());
      window.alert(`${n}건의 열람 권한을 회수했습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "회수에 실패했습니다.");
    }
    setBusy("");
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
    setWinEdit({ id: f.id, start: f.freeStart || today, end: f.freeEnd || plus4 });
  };

  const saveFreeWindow = async (start: string, end: string) => {
    if (!winEdit) return;
    if (Boolean(start) !== Boolean(end)) {
      setError("시작일과 종료일을 모두 입력해 주세요.");
      return;
    }
    if (start && start > end) {
      setError("종료일이 시작일보다 빠를 수 없습니다.");
      return;
    }
    setError("");
    setBusy(start ? "무료 기간 저장 중…" : "무료 기간 해제 중…");
    try {
      await setLibraryFreeWindow(url, getAdminKey(), winEdit.id, start, end);
      setWinEdit(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "기간 설정에 실패했습니다.");
    }
    setBusy("");
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

          {url && (
            <>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-400/20 pt-3">
                <Button variant="outline" onClick={syncPaid} disabled={Boolean(busy)}>
                  유료회원 권한 동기화
                </Button>
                <Button variant="outline" onClick={revokeAll} disabled={Boolean(busy)}>
                  열람 권한 전체 회수
                </Button>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                회원 등급을 바꾼 뒤에는 <b>동기화</b>를 눌러야 서버의 다운로드
                허용 목록에 반영됩니다. 등급이 내려간 사람의 기존 권한은{" "}
                <b>전체 회수</b> 후 다시 동기화하면 정리됩니다.
              </p>
            </>
          )}
        </div>
      )}

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
                  disabled={Boolean(busy)}
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
                    disabled={Boolean(busy)}
                    aria-label={`${f.name} 다운로드`}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    다운로드
                  </button>
                )}
                {adminOn && (
                  <button
                    type="button"
                    onClick={() => toggleVip(f)}
                    disabled={Boolean(busy)}
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
                    disabled={Boolean(busy)}
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
                    disabled={Boolean(busy)}
                    aria-label={`${f.name} 삭제`}
                    className="flex min-h-[44px] w-11 items-center justify-center rounded-full border border-zinc-300 text-red-500 transition-colors hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-zinc-700"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
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
                      disabled={Boolean(busy)}
                      className="min-h-[44px] rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      저장
                    </button>
                    {f.freeStart && (
                      <button
                        type="button"
                        onClick={() => saveFreeWindow("", "")}
                        disabled={Boolean(busy)}
                        className="min-h-[44px] rounded-full border border-zinc-300 px-4 text-sm font-semibold text-zinc-600 hover:border-red-400 hover:text-red-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        기간 해제
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setWinEdit(null)}
                      className="min-h-[44px] rounded-full px-3 text-sm text-zinc-500 hover:text-foreground"
                    >
                      취소
                    </button>
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
