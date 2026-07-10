"use client";

// 하단 블로그 섹션 — 텔레그램 "글 저장" 봇으로 쌓인 글을 보여준다.
// 목록: 구글시트 Apps Script 웹앱 / 본문: Firestore(posts) → Storage 폴백
// 좋아요: Firestore likes 컬렉션 — 문서 id `{postId}_{uid}` 로 1인 1하트 보장
import { useEffect, useState } from "react";
import { Download, ExternalLink, Heart } from "lucide-react";
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

export default function BlogSection() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [likeBusy, setLikeBusy] = useState<string | null>(null);

  useEffect(
    () => onAuthStateChanged(getFirebaseAuth(), (u) => setUid(u?.uid ?? null)),
    []
  );

  useEffect(() => {
    fetch(BLOG_WEBAPP_URL)
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
