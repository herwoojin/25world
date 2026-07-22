"use client";

// 자료실 — Apps Script 웹앱(scripts/library-webapp.gs)을 통해 구글 드라이브 폴더를 읽고 쓴다.
//   · 목록/다운로드: 유료회원 이상 (화면 게이팅)
//   · 업로드/삭제  : 관리자 키를 가진 요청만 (웹앱에서 서버측 검증)
// 웹앱 URL 은 관리자 모드에서 입력해 Firestore siteMeta/config.libraryUrl 에 저장한다.

export interface LibraryFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  desc: string;
  updatedAt: string;
  downloadUrl: string;
  viewUrl: string;
}

/** Apps Script 요청 본문 한도를 고려한 업로드 상한 (gs 의 MAX_UPLOAD_MB 와 맞춘다) */
export const MAX_UPLOAD_MB = 20;

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

async function post(url: string, payload: object): Promise<any> {
  // Content-Type 미지정(text/plain) → Apps Script CORS preflight 회피 (다른 호출부와 동일 패턴)
  const res = await fetch(url, { method: "POST", body: JSON.stringify(payload) });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 200) };
  }
}

export async function listLibraryFiles(webappUrl: string): Promise<LibraryFile[]> {
  const res = await fetch(`${webappUrl}?type=list`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "목록을 불러오지 못했습니다.");
  return data.files as LibraryFile[];
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

export async function uploadLibraryFile(
  webappUrl: string,
  adminKey: string,
  file: File,
  desc = ""
): Promise<void> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`${MAX_UPLOAD_MB}MB 이하만 업로드할 수 있습니다.`);
  }
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
}

export async function deleteLibraryFile(
  webappUrl: string,
  adminKey: string,
  id: string
): Promise<void> {
  const r = await post(webappUrl, { action: "delete", adminKey, id });
  if (!r.ok) throw new Error(r.error || "삭제에 실패했습니다.");
}
