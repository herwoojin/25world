// 네이버 블로그(스마트에디터 ONE) 붙여넣기용 변환
//
// 저장된 글 HTML 을 그대로 복사하면 세 가지 문제가 생긴다.
//  1) 이미지가 data URI 라 네이버 에디터가 받지 못한다
//     → 서버(tg-post-saver)가 내주는 실제 이미지 주소로 바꾼다
//  2) 네이버는 제목칸과 본문이 따로다 → 첫 <h1> 을 제목으로 떼어낸다
//  3) 생성기 흔적([cite: 12], "자동 변환" 문구, 통째로 반복된 문단, 레이아웃 스타일)이
//     남으면 사람이 쓴 글처럼 보이지 않는다 → 정리한다
import { BOT_SERVER_URL } from "@/lib/firebase";

export const NAVER_WRITE_URL = "https://blog.naver.com/heroher?Redirect=Write&categoryNo=12";

export interface NaverCopy {
  title: string;
  html: string;
  text: string;
  imageUrls: string[];
}

const IMG_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// 붙여넣을 HTML 에 남길 속성 — onerror 같은 이벤트 속성은 여기서 전부 떨어진다
const KEEP_ATTRS = new Set(["href", "src", "alt", "style", "colspan", "rowspan"]);
const INLINE_TAGS = new Set(["SPAN", "STRONG", "B", "EM", "I", "U", "A", "FONT", "MARK"]);
const BLOCK_SELECTOR = "p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,table,figure,blockquote,pre,hr";

export function buildNaverCopy(postId: string, rawHtml: string): NaverCopy {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const body = doc.body;

  // 1) 이미지 번호부터 매긴다 — 요소를 지우기 전에 세야 서버의 순서 규칙과 맞는다
  const imageUrls: string[] = [];
  let n = 0;
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    const d = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(src);
    if (d) {
      const ext = IMG_EXT[d[1].toLowerCase()] || "jpg";
      const url = `${BOT_SERVER_URL}/api/posts/${encodeURIComponent(postId)}/img/${n}.${ext}`;
      img.setAttribute("src", url);
      imageUrls.push(url);
      n++;
    } else if (/^https?:\/\//i.test(src)) {
      imageUrls.push(src);
      n++;
    } else {
      img.remove(); // 상대경로·blob 등 네이버가 가져갈 수 없는 이미지
    }
  });

  // 2) 에디터에 필요 없는 요소
  body
    .querySelectorAll("script,style,link,meta,noscript,iframe,svg,button,form,input,select,textarea")
    .forEach((el) => el.remove());

  // 3) 제목 — 네이버 제목칸용으로 떼어낸다. 생성기가 붙이는 " — 블로그" 꼬리는 뺀다
  const h1 = body.querySelector("h1");
  const title = (h1?.textContent || doc.title || "")
    .replace(/\s*[—–-]\s*블로그\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  h1?.remove();

  // 4) figure → 이미지 문단 + 설명 문단 (네이버 붙여넣기는 figcaption 을 모른다)
  body.querySelectorAll("figure").forEach((fig) => {
    const frag = doc.createDocumentFragment();
    fig.querySelectorAll("img").forEach((img) => {
      const p = doc.createElement("p");
      p.appendChild(img);
      frag.appendChild(p);
    });
    const cap = fig.querySelector("figcaption")?.textContent?.trim();
    if (cap) {
      const p = doc.createElement("p");
      p.textContent = cap;
      frag.appendChild(p);
    }
    fig.replaceWith(frag);
  });

  // 5) 생성기 흔적 — [cite: 12] 마커, 자동 변환 안내 문구
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach((t) => {
    t.nodeValue = (t.nodeValue || "").replace(/\s*\[cite:[^\]]*\]/g, "");
  });
  body.querySelectorAll("p").forEach((p) => {
    if (/25WORLD 자동 변환/.test(p.textContent || "")) p.remove();
  });

  // 6) 블록 자식이 없는 div(버튼처럼 꾸민 링크 상자 등)는 평범한 문단으로
  body.querySelectorAll("div").forEach((div) => {
    if (div.querySelector(BLOCK_SELECTOR)) return;
    const p = doc.createElement("p");
    while (div.firstChild) p.appendChild(div.firstChild);
    div.replaceWith(p);
  });

  // 7) 속성 정리 — 여백·배경·폰트 크기 같은 레이아웃은 네이버 서식과 충돌한다.
  //    사람이 흔히 쓰는 글자색만 인라인 요소에 남긴다.
  body.querySelectorAll("*").forEach((el) => {
    const color = (el as HTMLElement).style?.color || "";
    for (const a of Array.from(el.attributes)) {
      if (!KEEP_ATTRS.has(a.name)) el.removeAttribute(a.name);
    }
    el.removeAttribute("style");
    if (color && INLINE_TAGS.has(el.tagName)) (el as HTMLElement).style.color = color;
    const href = el.getAttribute("href");
    if (href && !/^(https?:|mailto:)/i.test(href)) el.removeAttribute("href");
  });

  // 8) 소제목 — 붙여넣을 때 제목 서식이 빠져도 굵게 남도록
  body.querySelectorAll("h2,h3,h4,h5,h6").forEach((h) => {
    if (h.querySelector("b,strong")) return;
    const b = doc.createElement("b");
    while (h.firstChild) b.appendChild(h.firstChild);
    h.appendChild(b);
  });

  // 9) 통째로 반복된 내용 제거 — 생성기가 본문을 두 번 넣는 경우가 있다
  const seen = new Set<string>();
  body.querySelectorAll("h2,h3,h4,p,li").forEach((el) => {
    const key = (el.textContent || "").replace(/\s+/g, " ").trim();
    const min = /^H/.test(el.tagName) ? 15 : 40; // 짧은 문장은 원래 반복될 수 있다
    if (key.length < min || el.querySelector("img")) return;
    if (seen.has(key)) el.remove();
    else seen.add(key);
  });

  // 10) 비어 버린 목록·문단, 연달아 붙은 구분선 정리
  body.querySelectorAll("ul,ol").forEach((l) => {
    if (!l.querySelector("li")) l.remove();
  });
  body.querySelectorAll("p").forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector("img")) p.remove();
  });
  body.querySelectorAll("hr").forEach((hr) => {
    const prev = hr.previousElementSibling;
    if (!prev || prev.tagName === "HR") hr.remove();
  });
  while (body.firstElementChild?.tagName === "BR") body.firstElementChild.remove();

  const html = body.innerHTML.trim();
  const text = Array.from(body.querySelectorAll("h2,h3,h4,p,li"))
    .map((el) => `${el.tagName === "LI" ? "• " : ""}${(el.textContent || "").trim()}`)
    .filter((s) => s.trim())
    .join("\n\n");

  return { title, html, text, imageUrls };
}

/** 무료 서버를 깨우고 이미지를 미리 불러둔다 — 붙여넣는 순간 네이버가 바로 가져가도록 */
export async function warmNaverImages(urls: string[]): Promise<void> {
  await fetch(`${BOT_SERVER_URL}/api/wake`).catch(() => {});
  await Promise.all(
    urls
      .filter((u) => u.startsWith(BOT_SERVER_URL))
      .map((u) => fetch(u, { mode: "no-cors" }).catch(() => {}))
  );
}

/** 서식(HTML) 그대로 복사. 안 되는 브라우저는 선택 영역 복사로 폴백 */
export async function copyRichHtml(html: string, text: string): Promise<void> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([`<meta charset="utf-8">${html}`], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    // 권한 거부 등 — 아래 폴백으로
  }

  const box = document.createElement("div");
  box.contentEditable = "true";
  box.innerHTML = html;
  Object.assign(box.style, { position: "fixed", left: "-99999px", top: "0", opacity: "0" });
  document.body.appendChild(box);
  const range = document.createRange();
  range.selectNodeContents(box);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand("copy");
  sel?.removeAllRanges();
  box.remove();
  if (!ok) throw new Error("복사하지 못했어요. 브라우저가 클립보드 접근을 막았어요.");
}

export async function copyPlainText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    Object.assign(ta.style, { position: "fixed", left: "-99999px" });
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("복사하지 못했어요.");
  }
}
