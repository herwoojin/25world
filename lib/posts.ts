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

// Firestore 문서 한도는 1 MiB. 필드명·오버헤드를 빼고 넉넉히 남긴다.
// (서버 storage/firestore.js 와 같은 값을 써야 읽기/쓰기가 맞물린다)
const SINGLE_MAX = 900_000;
const CHUNK_BYTES = 700_000;

/** UTF-8 바이트 기준으로 문자열을 자른다 (서로게이트 쌍을 깨지 않는다) */
function splitByBytes(str: string, maxBytes: number): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let start = 0;
  let bytes = 0;
  let i = 0;
  for (const ch of str) {
    const b = enc.encode(ch).length;
    if (bytes + b > maxBytes) {
      out.push(str.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += b;
    i += ch.length;
  }
  if (start < str.length) out.push(str.slice(start));
  return out;
}

/**
 * 글 HTML 을 Firestore 에 저장할 문서 목록으로 만든다.
 * 1 MiB 를 넘으면 posts/{id}__p0..N-1 조각 + 헤드 문서로 나눈다.
 * 반환 순서대로 저장해야 한다 — 조각이 먼저, 헤드가 마지막.
 */
export function postHtmlDocs(
  id: string,
  html: string,
  savedAt = new Date().toISOString()
): { docId: string; data: Record<string, unknown> }[] {
  if (new TextEncoder().encode(html).length <= SINGLE_MAX) {
    return [{ docId: id, data: { html, savedAt } }];
  }
  const chunks = splitByBytes(html, CHUNK_BYTES);
  return [
    ...chunks.map((html, n) => ({ docId: `${id}__p${n}`, data: { html } })),
    { docId: id, data: { parts: chunks.length, savedAt } },
  ];
}

/** Firestore REST 로 posts/{docId} 문서 하나를 읽는다 */
async function fetchPostDoc(docId: string) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/posts/${encodeURIComponent(docId)}?key=${firebaseConfig.apiKey}`
  );
  return res.ok ? res.json() : null;
}

export async function fetchPostHtml(id: string): Promise<string | null> {
  try {
    const doc = await fetchPostDoc(id);
    const fields = doc?.fields;
    // 작은 글은 html 필드 하나에 통째로 들어 있다
    if (fields?.html?.stringValue) return fields.html.stringValue;

    // 1 MiB 를 넘는 글은 posts/{id}__p0..N-1 조각으로 나뉘어 있다
    const parts = Number(fields?.parts?.integerValue ?? 0);
    if (parts > 0) {
      const chunks = await Promise.all(
        Array.from({ length: parts }, (_, n) => fetchPostDoc(`${id}__p${n}`))
      );
      const texts = chunks.map((c) => c?.fields?.html?.stringValue);
      // 하나라도 빠지면 깨진 HTML 이 되므로 Storage 폴백으로 넘긴다
      if (texts.every(Boolean)) return texts.join("");
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
