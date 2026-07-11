// 블로그 글 본문 조회 — ① Firestore(posts/{id} 문서) → ② Storage 파일 폴백
import { BLOG_STORAGE_BUCKET, firebaseConfig } from "@/lib/firebase";

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
