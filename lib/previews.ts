"use client";

// 카드뉴스 미리보기 — Firestore `previews` 컬렉션을 한 번에 읽어 캐시한다.
// (첫 이미지 · 첫 제목 · 카테고리)
import { collection, doc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase";
import type { BlogCatId } from "@/lib/blog-categories";

export interface Preview {
  image: string | null;
  heading: string | null;
  excerpt: string | null;
  category: BlogCatId | null;
}

export async function loadAllPreviews(): Promise<Record<string, Preview>> {
  const out: Record<string, Preview> = {};
  try {
    const snap = await getDocs(collection(getFirestore(getFirebaseApp()), "previews"));
    snap.forEach((d) => {
      const v = d.data();
      out[d.id] = {
        image: v.image ?? null,
        heading: v.heading ?? null,
        excerpt: v.excerpt ?? null,
        category: (v.category as BlogCatId) ?? null,
      };
    });
  } catch {}
  return out;
}

/** 관리자: 글의 카테고리 변경 */
export async function setPostCategory(postId: string, category: BlogCatId) {
  await setDoc(
    doc(getFirestore(getFirebaseApp()), "previews", postId),
    { category },
    { merge: true }
  );
}
