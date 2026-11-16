"use client";

// 자료실 — Apps Script 웹앱(scripts/library-webapp.gs)을 통해 구글 드라이브 폴더를 읽고 쓴다.
//   · 목록/다운로드: 유료회원 이상 (화면 게이팅)
//   · 업로드/삭제  : 관리자 키를 가진 요청만 (웹앱에서 서버측 검증)
// 웹앱 URL 은 관리자 모드에서 입력해 Firestore siteMeta/config.libraryUrl 에 저장한다.

import { BOT_SERVER_URL } from "@/lib/firebase";

export interface LibraryFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  desc: string;
  updatedAt: string;
  /** 유료회원 이상만 받을 수 있는 파일인가 (서버가 판정) */
  vip: boolean;
  viewUrl: string;
  /** 한시적 무료 기간 (YYYY-MM-DD, 한국시간·종료일 포함). 미설정이면 없음 */
  freeStart?: string;
  freeEnd?: string;
  /** 지금이 무료 기간 안인가 — 서버 시계로 판정 (구버전 웹앱이면 없음) */
  freeNow?: boolean;
}

/** 무료 기간 상태 — 화면 표시용 (실제 허용 여부는 서버의 freeNow 가 결정한다) */
export function freeWindowStatus(
  f: Pick<LibraryFile, "freeStart" | "freeEnd" | "freeNow">,
  now = new Date()
): "none" | "upcoming" | "active" | "ended" {
  if (!f.freeStart || !f.freeEnd) return "none";
  if (f.freeNow) return "active";
  const start = new Date(`${f.freeStart}T00:00:00+09:00`).getTime();
  const end = new Date(`${f.freeEnd}T23:59:59.999+09:00`).getTime();
  const t = now.getTime();
  if (t < start) return "upcoming";
  if (t > end) return "ended";
  // 서버가 아직 새 버전이 아니어서 freeNow 가 없을 때의 폴백
  return "active";
}

/** "2026-09-17" → "9/17" */
export function shortDate(ymd?: string): string {
  if (!ymd) return "";
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 폴백(base64 → Apps Script) 경로의 상한 — gs 의 MAX_UPLOAD_MB 와 맞춘다 */
export const FALLBACK_MAX_MB = 30;

/** 기본 경로(브라우저 → 드라이브 직접 업로드)의 상한.
 *  드라이브 API 자체는 파일당 5TB 까지 받지만, 실질 한도는 계정의 저장용량(무료 15GB)이다.
 *  브라우저·네트워크 현실을 감안해 2GB 에서 막는다. */
export const MAX_UPLOAD_MB = 2048;

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/** 확장자로 고른 파일 아이콘 */
export function fileEmoji(name: string, mimeType = ""): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (ext === "pdf") return "📕";
  if (["doc", "docx", "hwp", "hwpx"].includes(ext)) return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽️";
  if (["zip", "7z", "rar", "tar", "gz"].includes(ext)) return "🗜️";
  return "📎";
}

/** 텍스트가 JSON 이 아니면(예: Apps Script 가 간헐적으로 돌려주는 HTML 오류 페이지)
 *  원본을 그대로 노출하지 않고 사람이 읽을 수 있는 오류로 바꾼다. */
function parseJsonSafe(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const looksLikeHtml = /^\s*</.test(text);
    return {
      ok: false,
      error: looksLikeHtml
        ? "구글 서버가 일시적으로 응답하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : text.slice(0, 200) || "빈 응답을 받았습니다.",
    };
  }
}

async function post(url: string, payload: object): Promise<any> {
  // Content-Type 미지정(text/plain) → Apps Script CORS preflight 회피 (다른 호출부와 동일 패턴)
  const res = await fetch(url, { method: "POST", body: JSON.stringify(payload) });
  return parseJsonSafe(await res.text());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function listLibraryFiles(webappUrl: string): Promise<LibraryFile[]> {
  // Apps Script 가 간헐적으로 HTML 오류 페이지를 돌려줄 때가 있어(일시적 과부하 등)
  // 곧바로 실패시키지 않고 짧게 두 번 더 시도한다.
  let data: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${webappUrl}?type=list`, { cache: "no-store" });
    data = parseJsonSafe(await res.text());
    if (data.ok) break;
    if (attempt < 2) await sleep(800 * (attempt + 1));
  }
  if (!data.ok) throw new Error(data.error || "목록을 불러오지 못했습니다.");
  return data.files as LibraryFile[];
}

/** 다운로드 링크 요청 — 서버가 로그인 토큰을 검증하고 등급까지 확인한 뒤에만 URL 을 내준다.
 *  (폴더를 "제한됨"으로 두면 이 경로 말고는 파일을 받을 방법이 없다) */
export async function requestDownloadUrl(
  webappUrl: string,
  opts: { idToken?: string; adminKey?: string; fileId: string }
): Promise<string> {
  const r = await post(webappUrl, {
    action: "download",
    id: opts.fileId,
    idToken: opts.idToken ?? "",
    adminKey: opts.adminKey ?? "",
  });
  if (r.ok && r.url) return r.url as string;
  // 서버가 로그인 토큰을 확인하지 못한 경우. 화면에는 이미 로그인해 있으므로
  // "로그인 후 이용"이라고 하면 오해를 산다 — 다시 로그인하라고 안내한다.
  if (r.error === "login-required")
    throw new Error("로그인 정보를 확인하지 못했어요. 로그아웃 후 다시 로그인해 주세요.");
  if (r.error === "paid-only")
    throw new Error("유료회원 이상만 받을 수 있는 자료입니다.");
  throw new Error(r.error || "다운로드 링크를 받지 못했습니다.");
}

export interface LibraryTicket {
  url: string;
  name: string;
  size: number;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
  speedBps: number;
}

export type LibraryDownloadResult =
  | {
      mode: "blob";
      blob: Blob;
      blobUrl: string;
      name: string;
      size: number;
      autoTriggered: boolean;
    }
  | {
      mode: "direct";
      url: string;
      name: string;
      size: number;
    };

export interface DownloadLocationGuide {
  location: string;
  shortcutTip: string;
}

/** JS 메모리에 Blob 을 통째로 담는 상한(400MB). 이를 넘으면 브라우저 기본 스트리밍으로 넘긴다. */
const MAX_STREAM_BLOB_BYTES = 400 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  return (name || "download").replace(/[\\/]/g, "_").trim() || "download";
}

/** 자료실 다운로드 티켓 발급 — tg-post-saver 서버가 권한을 확인한 뒤 1회성 스트림 주소를 돌려준다.
 *  이메일이 없는 카카오 회원이나 브라우저에 구글 로그인이 안 된 회원도 받을 수 있다. */
export async function requestLibraryTicket(opts: {
  fileId: string;
  idToken?: string;
  adminKey?: string;
  signal?: AbortSignal;
}): Promise<LibraryTicket> {
  // 무료 서버는 잠들어 있을 수 있다 — 먼저 깨운다
  await fetch(`${BOT_SERVER_URL}/api/wake`, { signal: opts.signal }).catch((e) => {
    if (opts.signal?.aborted) throw e;
  });
  const res = await fetch(`${BOT_SERVER_URL}/api/library/ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      fileId: opts.fileId,
      idToken: opts.idToken ?? "",
      adminKey: opts.adminKey ?? "",
    }),
  });
  const r = await res.json().catch(() => ({}));
  if (r.ok && r.url) {
    return {
      url: `${BOT_SERVER_URL}${r.url}`,
      name: String(r.name || ""),
      size: Number(r.size || 0),
    };
  }
  if (r.error === "login-required")
    throw new Error("로그인 정보를 확인하지 못했어요. 로그아웃 후 다시 로그인해 주세요.");
  if (r.error === "paid-only") throw new Error("유료회원 이상만 받을 수 있는 자료입니다.");
  if (r.error === "not-in-library") throw new Error("자료실에 없는 파일입니다.");
  throw new Error(r.message || "다운로드를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
}

export async function requestLibraryDownload(opts: {
  fileId: string;
  idToken?: string;
  adminKey?: string;
}): Promise<string> {
  const ticket = await requestLibraryTicket(opts);
  return ticket.url;
}

/** 생성된 Blob URL 로 브라우저 저장을 시작한다 (새 창/빈 창 없이 현재 페이지에서 처리). */
export function triggerBlobDownload(blobUrl: string, fileName: string): boolean {
  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = sanitizeFileName(fileName);
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

function triggerHiddenIframeDownload(url: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 60_000);
}

/** 브라우저가 File System Access API(폴더/저장 위치 직접 선택)를 지원하는지 */
export function canPickSaveFolder(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function"
  );
}

/** 사용자가 직접 저장 위치·파일명을 골라 Blob 을 저장한다 (지원 브라우저 전용). */
export async function saveBlobWithPicker(
  blob: Blob,
  suggestedName: string
): Promise<string | null> {
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (opts?: { suggestedName?: string }) => Promise<{
        name: string;
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }
  ).showSaveFilePicker;
  if (!picker) return null;
  const handle = await picker({ suggestedName: sanitizeFileName(suggestedName) });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return handle.name;
}

/** OS·브라우저별 기본 다운로드 폴더 및 다운로드 목록 열기 안내 */
export function getDownloadLocationGuide(fileName: string): DownloadLocationGuide {
  const safeName = sanitizeFileName(fileName);
  if (typeof navigator === "undefined") {
    return {
      location: `브라우저 기본 다운로드(Downloads) 폴더 (${safeName})`,
      shortcutTip:
        "브라우저 상단의 다운로드 아이콘(↓)을 누르고 '폴더에서 보기'를 선택하면 저장 위치를 바로 열 수 있어요.",
    };
  }
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMac = !isIOS && /Mac/i.test(ua);
  const isWin = /Windows/i.test(ua);
  const isSafari =
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|Edg|Whale|OPR|Firefox|FxiOS|CriOS/i.test(ua);

  if (isIOS) {
    return {
      location: `「파일」 앱 → 다운로드 폴더 (${safeName})`,
      shortcutTip:
        "브라우저 주소창 옆 ↓(다운로드) 아이콘을 누르거나, 홈 화면의 파란색 「파일」 앱 → '다운로드'에서 확인할 수 있어요.",
    };
  }
  if (isAndroid) {
    return {
      location: `「내 파일(Files)」 앱 → 다운로드 폴더 (${safeName})`,
      shortcutTip:
        "브라우저 우측 상단 메뉴(⋮) → '다운로드' 또는 휴대폰의 「내 파일」 앱에서 바로 열 수 있어요.",
    };
  }
  if (isMac) {
    return {
      location: `Finder → 다운로드 폴더 (~/Downloads/${safeName})`,
      shortcutTip: isSafari
        ? "Safari 우측 상단 ↓(다운로드) 버튼 또는 Option(⌥) + Command(⌘) + L 을 누른 뒤 돋보기 아이콘을 클릭하면 폴더가 바로 열립니다."
        : "브라우저 우측 상단 ↓(다운로드) 아이콘 또는 Command(⌘) + Shift + J 를 누른 뒤 'Finder에서 보기'를 누르면 폴더가 바로 열립니다.",
    };
  }
  if (isWin) {
    return {
      location: `파일 탐색기 → 다운로드 폴더 (다운로드\\${safeName})`,
      shortcutTip:
        "브라우저 우측 상단 ↓(다운로드) 아이콘 또는 Ctrl + J 를 누른 뒤 '폴더 열기'를 누르면 저장 위치가 바로 열립니다.",
    };
  }
  return {
    location: `브라우저 기본 다운로드(Downloads) 폴더 (${safeName})`,
    shortcutTip:
      "브라우저 다운로드 목록(Ctrl + J)에서 '폴더 열기'를 누르면 저장 위치를 바로 확인할 수 있어요.",
  };
}

/** 자료실 파일을 현재 탭에서 스트리밍으로 받아 진행률을 알리고, 완료 즉시 저장한다.
 *  about:blank 새 창을 열지 않으므로 빈 화면이 남지 않는다. */
export async function downloadLibraryFile(opts: {
  fileId: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  idToken?: string;
  adminKey?: string;
  signal?: AbortSignal;
  onStage?: (stage: "authorizing" | "downloading") => void;
  onProgress?: (p: DownloadProgress) => void;
}): Promise<LibraryDownloadResult> {
  opts.onStage?.("authorizing");
  const ticket = await requestLibraryTicket({
    fileId: opts.fileId,
    idToken: opts.idToken,
    adminKey: opts.adminKey,
    signal: opts.signal,
  });

  const safeName = sanitizeFileName(ticket.name || opts.fileName);
  const expectedSize = ticket.size || opts.fileSize || 0;

  if (expectedSize > MAX_STREAM_BLOB_BYTES) {
    triggerHiddenIframeDownload(ticket.url);
    return {
      mode: "direct",
      url: ticket.url,
      name: safeName,
      size: expectedSize,
    };
  }

  opts.onStage?.("downloading");
  const res = await fetch(ticket.url, { signal: opts.signal, cache: "no-store" });
  if (!res.ok) {
    const errText = (await res.text().catch(() => "")).trim();
    throw new Error(
      errText && errText.length < 200
        ? errText
        : `파일을 내려받지 못했어요 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`
    );
  }

  const headerLen = Number(res.headers.get("content-length") || 0);
  const hasEncoding = Boolean(res.headers.get("content-encoding"));
  const total = (!hasEncoding && headerLen > 0 ? headerLen : 0) || expectedSize;
  const contentType =
    res.headers.get("content-type") || opts.mimeType || "application/octet-stream";

  let blob: Blob;
  if (res.body) {
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    const startedAt = Date.now();
    let lastReportAt = 0;

    opts.onProgress?.({ loaded: 0, total, speedBps: 0 });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value as BlobPart);
        loaded += value.byteLength;
        const now = Date.now();
        if (now - lastReportAt >= 80) {
          const elapsedSec = Math.max((now - startedAt) / 1000, 0.1);
          opts.onProgress?.({ loaded, total, speedBps: loaded / elapsedSec });
          lastReportAt = now;
        }
      }
    }
    const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.1);
    opts.onProgress?.({
      loaded,
      total: total || loaded,
      speedBps: loaded / elapsedSec,
    });
    blob = new Blob(chunks, { type: contentType });
  } else {
    blob = await res.blob();
    opts.onProgress?.({
      loaded: blob.size,
      total: total || blob.size,
      speedBps: 0,
    });
  }

  const blobUrl = URL.createObjectURL(blob);
  const autoTriggered = triggerBlobDownload(blobUrl, safeName);
  return {
    mode: "blob",
    blob,
    blobUrl,
    name: safeName,
    size: blob.size || expectedSize,
    autoTriggered,
  };
}

/** 다운로드 허용(유료회원) 목록을 웹앱에 동기화 — 관리자만.
 *  이메일이 없는 카카오 유료회원도 판정할 수 있도록 회원 ID(uid) 목록도 함께 보낸다. */
export async function syncPaidEmails(
  webappUrl: string,
  adminKey: string,
  emails: string[],
  uids: string[] = []
): Promise<number> {
  const r = await post(webappUrl, { action: "syncPaid", adminKey, emails, uids });
  if (!r.ok) throw new Error(r.error || "동기화에 실패했습니다.");
  return Number(r.count ?? emails.length);
}

/** 파일을 VIP(유료 전용)로 지정/해제 — 관리자만 (확장자 기본값을 덮어쓴다) */
export async function setLibraryVip(
  webappUrl: string,
  adminKey: string,
  id: string,
  vip: boolean
): Promise<void> {
  const r = await post(webappUrl, { action: "setVip", adminKey, id, vip });
  if (!r.ok) throw new Error(r.error || "VIP 설정에 실패했습니다.");
}

/** 한시적 무료 기간 설정/해제 — 관리자만.
 *  기간 안에는 일반회원도 받을 수 있고, 기간 밖에는 VIP(유료회원 이상) 전용이다.
 *  start/end 를 둘 다 비우면 기간을 해제한다. */
export async function setLibraryFreeWindow(
  webappUrl: string,
  adminKey: string,
  id: string,
  start: string,
  end: string
): Promise<void> {
  const r = await post(webappUrl, { action: "setFreeWindow", adminKey, id, start, end });
  if (r.ok) return;
  if (r.error === "bad-range") throw new Error("종료일이 시작일보다 빠를 수 없습니다.");
  if (r.error === "bad-date") throw new Error("날짜 형식이 올바르지 않습니다.");
  if (String(r.error || "").startsWith("unknown action"))
    throw new Error("웹앱이 구버전입니다. Apps Script 를 새 버전으로 배포해 주세요.");
  throw new Error(r.error || "기간 설정에 실패했습니다.");
}

/** 지금까지 부여된 열람 권한 전체 회수 — 관리자만 */
export async function revokeAllAccess(
  webappUrl: string,
  adminKey: string
): Promise<number> {
  const r = await post(webappUrl, { action: "revokeAll", adminKey });
  if (!r.ok) throw new Error(r.error || "회수에 실패했습니다.");
  return Number(r.revoked ?? 0);
}

/** File → base64 (data URL 의 콤마 뒤 부분) */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
}

/** 브라우저 → 구글 드라이브 직접 업로드 (resumable).
 *  Apps Script 에서 1회성 OAuth 토큰만 받아오고, 파일 본문은 구글 서버로 바로 보낸다.
 *  덕분에 base64 변환도, Apps Script 요청 본문 한도도 거치지 않는다. */
async function uploadDirect(
  webappUrl: string,
  adminKey: string,
  file: File,
  desc: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const t = await post(webappUrl, { action: "token", adminKey });
  if (!t.ok || !t.token) throw new Error(t.error || "업로드 토큰을 받지 못했습니다.");

  // 1) 세션 시작 — 업로드 URL(Location 헤더)을 받는다
  const start = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t.token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": file.type || "application/octet-stream",
        "X-Upload-Content-Length": String(file.size),
      },
      body: JSON.stringify({
        name: file.name,
        description: desc || undefined,
        parents: [t.folderId],
      }),
    }
  );
  const uploadUrl = start.headers.get("location");
  if (!start.ok || !uploadUrl) {
    throw new Error(`업로드 세션을 열지 못했습니다 (${start.status}).`);
  }

  // 2) 파일 본문 전송 — 진행률을 보려고 fetch 대신 XHR 을 쓴다
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 100);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`업로드 실패 (${xhr.status})`));
    xhr.onerror = () => reject(new Error("네트워크 오류로 업로드에 실패했습니다."));
    xhr.send(file);
  });
}

export async function uploadLibraryFile(
  webappUrl: string,
  adminKey: string,
  file: File,
  desc = "",
  onProgress?: (pct: number) => void
): Promise<void> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`${(MAX_UPLOAD_MB / 1024).toFixed(0)}GB 이하만 업로드할 수 있습니다.`);
  }

  try {
    await uploadDirect(webappUrl, adminKey, file, desc, onProgress);
    return;
  } catch (e) {
    // 구버전 웹앱(토큰 액션 없음) 등 — 작은 파일이면 예전 base64 경로로 재시도
    if (file.size > FALLBACK_MAX_MB * 1024 * 1024) throw e;
  }

  onProgress?.(0);
  const data = await toBase64(file);
  const r = await post(webappUrl, {
    action: "upload",
    adminKey,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    desc,
    data,
  });
  if (!r.ok) throw new Error(r.error || "업로드에 실패했습니다.");
  onProgress?.(100);
}

export async function deleteLibraryFile(
  webappUrl: string,
  adminKey: string,
  id: string
): Promise<void> {
  const r = await post(webappUrl, { action: "delete", adminKey, id });
  if (!r.ok) throw new Error(r.error || "삭제에 실패했습니다.");
}
