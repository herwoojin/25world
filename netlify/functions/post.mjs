// 크롤러/공유용 서버 렌더 글 페이지 — /r/{글ID}
// NotebookLM 등 웹 크롤러는 서버 HTML만 읽으므로, Firestore 의 본문을
// 그대로 text/html 로 내려준다. (앱 내 읽기는 /post?id= 페이지가 담당)
const PROJECT_ID = "jini-vibe-coding";
const API_KEY = "AIzaSyCuog0TdR371MNDKreqk9_4w7yrTIfa8qA"; // 웹 공개 키 (Firebase 설계상 공개 가능)
const DB = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function notFound(msg) {
  return new Response(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>글을 찾을 수 없습니다</title></head><body><h1>글을 찾을 수 없습니다</h1><p>${msg}</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export default async (req) => {
  const url = new URL(req.url);
  // /r/{id} 또는 ?id={id} 둘 다 지원
  const id =
    url.searchParams.get("id") || url.pathname.split("/").filter(Boolean).pop();

  if (!id || !/^[a-z0-9]+$/i.test(id)) return notFound("잘못된 주소입니다.");

  try {
    const res = await fetch(
      `${DB}/posts/${encodeURIComponent(id)}?key=${API_KEY}`
    );
    if (!res.ok) return notFound("본문이 존재하지 않습니다.");
    const doc = await res.json();
    const html = doc.fields?.html?.stringValue;
    if (!html) return notFound("본문이 비어 있습니다.");

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch {
    return notFound("본문을 불러오지 못했습니다.");
  }
};

export const config = { path: "/r/:id" };
