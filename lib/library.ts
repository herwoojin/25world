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
