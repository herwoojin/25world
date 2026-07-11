"use client";

// 하단 블로그 섹션 — 텔레그램 "글 저장" 봇으로 쌓인 글을 보여준다.
// 목록: 구글시트 Apps Script 웹앱 / 본문: Firestore(posts) → Storage 폴백
// 좋아요: Firestore likes 컬렉션 — 문서 id `{postId}_{uid}` 로 1인 1하트 보장
import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, Heart, Pencil, Plus, Trash2 } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  setDoc,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ADMIN_EVENT, getAdminKey } from "@/components/admin-button";
import {
  BLOG_WEBAPP_URL,
  BLOG_STORAGE_BUCKET,
  firebaseConfig,
  getFirebaseApp,
  getFirebaseAuth,
} from "@/lib/firebase";

interface BlogPost {
  id: string;
  title: string;
  savedAt: string;
  from: string;
  file: string;
}

// 본문 HTML 조회: ① Firestore(posts/{id} 문서) → ② Storage 파일 폴백
async function fetchHtml(id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/posts/${encodeURIComponent(id)}?key=${firebaseConfig.apiKey}`
    );
    if (res.ok) {
      const docJson = await res.json();
      const html = docJson.fields?.html?.stringValue;
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

function formatDate(s: string) {
  return s ? s.replace("T", " ").slice(0, 16) : "";
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 관리자가 텍스트로 새 글을 등록할 때 쓰는 간단한 HTML 래퍼
function wrapHtml(title: string, content: string) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#FAF8F2;color:#2A241C;font-family:Paperlogy,Pretendard,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}article{max-width:720px;margin:0 auto;padding:48px 24px 80px}h1{font-size:1.7rem;margin:0 0 24px;padding-bottom:16px;border-bottom:1px solid #E5DFD2}p{line-height:1.85;font-size:1.02rem;margin:0 0 1.2em}</style>
</head><body><article><h1>${escapeHtml(title)}</h1>${paragraphs}</article></body></html>`;
}

// Apps Script 웹앱 POST — Content-Type 미지정(text/plain)으로 CORS preflight 회피
async function webappPost(payload: object) {
  const res = await fetch(BLOG_WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.text();
}

export default function BlogSection() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [likeBusy, setLikeBusy] = useState<string | null>(null);
  // 관리자 모드 (푸터 🔐 버튼으로 켜고 끔)
  const [adminKey, setAdminKey] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  useEffect(
    () => onAuthStateChanged(getFirebaseAuth(), (u) => setUid(u?.uid ?? null)),
    []
  );

  useEffect(() => {
    const sync = () => setAdminKey(getAdminKey());
    sync();
    window.addEventListener(ADMIN_EVENT, sync);
    return () => window.removeEventListener(ADMIN_EVENT, sync);
  }, []);

  const loadPosts = useCallback(() => {
    return fetch(BLOG_WEBAPP_URL)
      .then((r) => r.json())
      .then((data: BlogPost[]) =>
        setPosts(
          (Array.isArray(data) ? data : []).sort((a, b) =>
            a.savedAt < b.savedAt ? 1 : -1
          )
        )
      )
      .catch(() => setError("블로그 목록을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // 좋아요 현황 로드
  useEffect(() => {
    if (!uid) return;
    const db = getFirestore(getFirebaseApp());
    getDocs(collection(db, "likes"))
      .then((snap) => {
        const counts: Record<string, number> = {};
        const mine = new Set<string>();
        snap.forEach((d) => {
          const data = d.data() as { postId?: string; uid?: string };
          if (!data.postId) return;
          counts[data.postId] = (counts[data.postId] ?? 0) + 1;
          if (data.uid === uid) mine.add(data.postId);
        });
        setLikeCounts(counts);
        setMyLikes(mine);
      })
      .catch(() => {});
  }, [uid]);

  const toggleLike = async (postId: string) => {
    if (!uid || likeBusy) return;
    setLikeBusy(postId);
    const db = getFirestore(getFirebaseApp());
    const ref = doc(db, "likes", `${postId}_${uid}`);
    const liked = myLikes.has(postId);
    try {
      if (liked) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, { postId, uid, createdAt: new Date().toISOString() });
      }
      setMyLikes((prev) => {
        const next = new Set(prev);
        if (liked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] ?? 0) + (liked ? -1 : 1)),
      }));
    } catch {
      // 규칙 미게시 등 — 조용히 무시 (다음 클릭에서 재시도)
    } finally {
      setLikeBusy(null);
    }
  };

  // 새 창에서 글 읽기 — 팝업 차단을 피하려고 클릭 즉시 창을 연다
  const openPost = (post: BlogPost) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<title>${post.title.replace(/</g, "&lt;")}</title><p style="font-family:sans-serif;padding:32px;color:#666">글을 불러오는 중…</p>`
    );
    fetchHtml(post.id).then((html) => {
      if (w.closed) return;
      w.document.open();
      w.document.write(
        html ??
          `<p style="font-family:sans-serif;padding:32px">본문을 불러올 수 없습니다.</p>`
      );
      w.document.close();
    });
  };

  // ── 관리자 액션 ──────────────────────────────────────────
  const editTitle = async (post: BlogPost) => {
    const title = window.prompt("새 제목을 입력하세요", post.title);
    if (!title || title === post.title) return;
    setAdminBusy(true);
    try {
      const r = await webappPost({ action: "update", id: post.id, title, adminKey });
      if (!r.includes("ok")) window.alert("수정 실패: " + r);
      await loadPosts();
    } finally {
      setAdminBusy(false);
    }
  };

  const removePost = async (post: BlogPost) => {
    if (!window.confirm(`"${post.title}" 글을 삭제할까요?`)) return;
    setAdminBusy(true);
    try {
      const r = await webappPost({ action: "delete", id: post.id, adminKey });
      if (!r.includes("ok")) window.alert("삭제 실패: " + r);
      await loadPosts();
    } finally {
      setAdminBusy(false);
    }
  };

  const addPost = async () => {
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title || !content) return;
    setAdminBusy(true);
    try {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      // 완성된 HTML 문서를 붙여넣으면 그대로, 일반 텍스트면 템플릿으로 감싼다
      const html = /^\s*(<!doctype|<html)/i.test(content)
        ? content
        : wrapHtml(title, content);
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(db, "posts", id), {
        html,
        savedAt: new Date().toISOString(),
      });
      await webappPost({
        id,
        title,
        savedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
        from: "관리자",
        chatId: "",
        file: `posts/${id}.html`,
      });
      setShowAdd(false);
      setNewTitle("");
      setNewContent("");
      await loadPosts();
    } catch {
      window.alert("등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setAdminBusy(false);
    }
  };

  const download = async (post: BlogPost) => {
    const html = await fetchHtml(post.id);
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${post.title.replace(/[\\/:*?"<>|]/g, "_")}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section id="blog" className="scroll-mt-16">
      <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-zinc-400" />
        <span aria-hidden="true">📮</span>
        <span>유튜브 글로 다시 읽어보자</span>
        <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
          ({posts?.length ?? "…"})
        </span>
      </h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        텔레그램 봇에게 &quot;글 저장 + 내용&quot;이나 .html 파일을 보내면 이
        목록에 쌓입니다. 제목을 클릭하면 새 창에서 열립니다.
      </p>

      {adminKey && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-amber-500">
              🔓 관리자 모드
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAdd((v) => !v)}
              disabled={adminBusy}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {showAdd ? "닫기" : "새 글 등록"}
            </Button>
          </div>
          {showAdd && (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="글 제목"
                className="w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={6}
                placeholder="본문 내용 — 일반 텍스트 또는 완성된 HTML 문서(<!DOCTYPE …) 붙여넣기"
                className="w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
              />
              <Button
                size="sm"
                onClick={addPost}
                disabled={adminBusy || !newTitle.trim() || !newContent.trim()}
              >
                {adminBusy ? "등록 중…" : "등록"}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {posts === null && !error && (
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        )}
        {posts?.length === 0 && (
          <p className="text-sm text-zinc-500">아직 저장된 글이 없습니다.</p>
        )}
        {posts?.map((post) => {
          const liked = myLikes.has(post.id);
          const count = likeCounts[post.id] ?? 0;
          return (
            <article
              key={post.id}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-background/60 px-4 py-3 dark:border-zinc-800"
            >
              <button
                type="button"
                onClick={() => openPost(post)}
                title="새 창에서 읽기"
                className="group flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold group-hover:underline">
                    {post.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(post.savedAt)}
                    {post.from ? ` · ${post.from}` : ""}
                  </span>
                </span>
                <ExternalLink
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>

              <button
                type="button"
                onClick={() => toggleLike(post.id)}
                aria-pressed={liked}
                aria-label={liked ? "좋아요 취소" : "좋아요"}
                disabled={likeBusy === post.id}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                  liked
                    ? "border-rose-400/60 text-rose-500"
                    : "border-zinc-300 text-zinc-500 hover:border-rose-400/60 hover:text-rose-500 dark:border-zinc-700 dark:text-zinc-400"
                }`}
              >
                <Heart
                  aria-hidden="true"
                  className={`h-4 w-4 ${liked ? "fill-current" : ""}`}
                />
                {count}
              </button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => download(post)}
                aria-label={`${post.title} HTML 다운로드`}
                className="h-9 w-9 shrink-0"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </Button>

              {adminKey && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => editTitle(post)}
                    disabled={adminBusy}
                    aria-label={`${post.title} 제목 수정`}
                    className="h-9 w-9 shrink-0 text-amber-500"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => removePost(post)}
                    disabled={adminBusy}
                    aria-label={`${post.title} 삭제`}
                    className="h-9 w-9 shrink-0 text-red-500"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
