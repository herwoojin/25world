// 블로그 글 본문 조회 — ① Firestore(posts/{id} 문서) → ② Storage 파일 폴백
import { BLOG_STORAGE_BUCKET, firebaseConfig } from "@/lib/firebase";

/** 저장 시각(UTC)을 한국 표준시로 표시 — "YYYY-MM-DD HH:mm" */
export function formatKST(savedAt: string): string {
  if (!savedAt) return "";
  // 시트/서버는 UTC 로 저장한다. "…Z" 또는 "YYYY-MM-DD HH:mm:ss" 둘 다 지원
  const iso = savedAt.includes("T")
    ? savedAt
    : `${savedAt.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return savedAt.replace("T", " ").slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export interface PostPreview {
  /** 본문에 처음 등장하는 이미지 (src 또는 data URI) */
  image: string | null;
  /** 본문에 처음 등장하는 제목 (h1 → h2 순) */
  heading: string | null;
  /** 카드 요약용 첫 문단 */
  excerpt: string | null;
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripTags(s: string) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

/** 블로그 HTML → 사람이 읽는 순수 텍스트 (NotebookLM 소스용) */
export function extractPlainText(html: string): string {
  const body = html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** 블로그 HTML → 카드뉴스용 미리보기(첫 이미지 · 첫 제목 · 첫 문단) */
export function extractPreview(html: string): PostPreview {
  const body = html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ");

  // 첫 이미지 — <img src> 우선, 없으면 background-image URL
  let image: string | null = null;
  const img = body.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  if (img) image = img[1];
  if (!image) {
    const bg = body.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
    if (bg) image = bg[1];
  }

  // 첫 제목
  let heading: string | null = null;
  const h = body.match(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/i);
  if (h) heading = stripTags(h[2]) || null;

  // 첫 문단
  let excerpt: string | null = null;
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(body))) {
    const t = stripTags(m[1]);
    if (t.length > 20) {
      excerpt = t.slice(0, 120);
      break;
    }
  }

  return { image, heading, excerpt };
}

export async function fetchPostHtml(id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/posts/${encodeURIComponent(id)}?key=${firebaseConfig.apiKey}`
    );
    if (res.ok) {
      const doc = await res.json();
      const html = doc.fields?.html?.stringValue;
      if (html) return html;
    }
  } catch {}
  try {
    const res = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BLOG_STORAGE_BUCKET}/o/${encodeURIComponent(`posts/${id}.html`)}?alt=media`
    );
    if (res.ok) return res.text();
  } catch {}
  return null;
}
