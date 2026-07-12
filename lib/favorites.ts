"use client";

// 즐겨찾기 — 로그인 사용자별 저장 (Firestore `favorites/{postId}_{uid}`)
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase";

export async function loadMyFavorites(uid: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const db = getFirestore(getFirebaseApp());
    const snap = await getDocs(
      query(collection(db, "favorites"), where("uid", "==", uid))
    );
    snap.forEach((d) => {
      const postId = d.data().postId as string | undefined;
      if (postId) out.add(postId);
    });
  } catch {}
  return out;
}

export async function toggleFavorite(
  uid: string,
  postId: string,
  on: boolean
): Promise<void> {
  const db = getFirestore(getFirebaseApp());
  const ref = doc(db, "favorites", `${postId}_${uid}`);
  if (on) {
    await setDoc(ref, { uid, postId, createdAt: new Date().toISOString() });
  } else {
    await deleteDoc(ref);
  }
}
