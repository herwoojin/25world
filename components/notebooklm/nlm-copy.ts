// NotebookLM 소스용 복사 도우미 — 하단 트레이와 듀얼 브레인 "참고한 글"이 함께 쓴다.
// (NotebookLM 은 외부 주입 API 가 없으므로 클립보드 복사 + 새 탭 열기가 유일한 안정 경로)
import { extractPlainText, fetchPostHtml } from "@/lib/posts";

export const NLM_URL = "https://notebooklm.google.com/";

/** 여러 글을 한 소스로 붙여넣을 때 글 사이 구분선 */
export const NLM_SEPARATOR = "\n\n---\n\n";

/** 클립보드 복사 — API 실패(비 HTTPS 등) 시 textarea 폴백 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/** 글 하나 → 붙여넣기용 블록. 본문이 없으면 Firestore 에서 가져와 순수 텍스트로 (없으면 제목+URL만) */
export async function postSourceBlock(item: {
  id: string;
  title: string;
  url: string;
  text?: string;
}): Promise<string> {
  let body = item.text?.trim() ?? "";
  if (!body) {
    const html = await fetchPostHtml(item.id).catch(() => null);
    if (html) body = extractPlainText(html);
  }
  return `# ${item.title}\n출처: ${item.url}\n\n${body || "(본문 없음)"}`;
}

/** NotebookLM 크롤러는 서버 HTML만 읽으므로, 본문을 그대로 내려주는 /r/{id} 주소를 준다 */
export const nlmCrawlUrl = (id: string) => `${window.location.origin}/r/${encodeURIComponent(id)}`;
