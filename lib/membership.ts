"use client";

// 회원 등급 시스템 — 일반회원 / 유료회원 / VIP회원 / 관리자
//   · 등급은 Firestore users/{uid}.group 에 저장 (기본 general)
//   · 유료 전용 사이트는 등급이 유료회원 이상일 때만 보인다
//   · 정적 사이트라 이 게이팅은 UX 수준(브라우저)에서 동작한다 — 하드 보안이 아님
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseApp, getFirebaseAuth } from "@/lib/firebase";
import { useAdminOn } from "@/components/admin-button";
import { useSiteConfig } from "@/lib/site-config";
import { useSites } from "@/lib/use-sites";
import type { Site } from "@/lib/sites";

export type Group = "general" | "paid" | "vip" | "admin";

export const GROUPS: { id: Group; label: string }[] = [
  { id: "general", label: "일반회원" },
  { id: "paid", label: "유료회원" },
  { id: "vip", label: "VIP회원" },
  { id: "admin", label: "관리자" },
];

const RANK: Record<Group, number> = { general: 0, paid: 1, vip: 2, admin: 3 };

export function groupLabel(g: Group): string {
  return GROUPS.find((x) => x.id === g)?.label ?? "일반회원";
}

// 유료 전용 사이트 기본값 — 관리자가 siteMeta/config.paid 로 덮어쓸 수 있다
export const DEFAULT_PAID_SITE_IDS = ["makeu2v", "stockdetail", "25w"];

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  photo: string;
  group: Group;
  role: "user" | "admin";
}

function db() {
  return getFirestore(getFirebaseApp());
}

/** 사이트가 요구하는 최소 등급 */
function siteMinRank(siteId: string, paidIds: Set<string>): number {
  return paidIds.has(siteId) ? RANK.paid : RANK.general;
}

/** 이 등급으로 해당 사이트를 볼 수 있는가 */
export function canSeeSite(
  siteId: string,
  group: Group,
  paidIds: Set<string>
): boolean {
  return RANK[group] >= siteMinRank(siteId, paidIds);
}

// ── 로그인 시 프로필 upsert ────────────────────────────────
// group/role 은 이미 있으면 보존하고, 없을 때만 기본값을 부여한다.
export async function upsertUserProfile(u: User): Promise<void> {
  const ref = doc(db(), "users", u.uid);
  const snap = await getDoc(ref).catch(() => null);
  const prev = snap?.data() ?? {};
  await setDoc(
    ref,
    {
      uid: u.uid,
      email: u.email ?? "",
      name: u.displayName || u.email?.split("@")[0] || "회원",
      photo: u.photoURL ?? "",
      group: (prev.group as Group) ?? "general",
      role: (prev.role as "user" | "admin") ?? "user",
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

// ── 내 프로필 / 내 등급 ────────────────────────────────────
export function useMyProfile(): UserProfile | null {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    let unsubDoc = () => {};
    const unsubAuth = onAuthStateChanged(getFirebaseAuth(), (u) => {
      unsubDoc();
      if (!u) {
        setProfile(null);
        return;
      }
      unsubDoc = onSnapshot(doc(db(), "users", u.uid), (s) => {
        const d = s.data() ?? {};
        setProfile({
          uid: u.uid,
          email: u.email ?? "",
          name: d.name ?? u.displayName ?? "",
          photo: d.photo ?? u.photoURL ?? "",
          group: (d.group as Group) ?? "general",
          role: (d.role as "user" | "admin") ?? "user",
        });
      });
    });
    return () => {
      unsubDoc();
      unsubAuth();
    };
  }, []);
  return profile;
}

/** 화면에 적용할 유효 등급 — 관리자 모드(id/pass)면 admin 으로 승격 */
export function useEffectiveGroup(): Group {
  const profile = useMyProfile();
  const adminOn = useAdminOn();
  if (adminOn) return "admin";
  return profile?.group ?? "general";
}

/** 현재 등급에서 볼 수 있는 사이트만 필터링해서 돌려준다 */
export function useVisibleSites(): { sites: Site[]; dynamic: Site[] } {
  const { sites, dynamic } = useSites();
  const cfg = useSiteConfig();
  const group = useEffectiveGroup();
  return useMemo(() => {
    const paidIds = new Set(cfg.paid ?? DEFAULT_PAID_SITE_IDS);
    return {
      sites: sites.filter((s) => canSeeSite(s.id, group, paidIds)),
      dynamic,
    };
  }, [sites, dynamic, cfg.paid, group]);
}

// ── 관리자용 회원 관리 ────────────────────────────────────
export async function listUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db(), "users"));
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      uid: d.id,
      email: x.email ?? "",
      name: x.name ?? "",
      photo: x.photo ?? "",
      group: (x.group as Group) ?? "general",
      role: (x.role as "user" | "admin") ?? "user",
    };
  });
}

export async function setUserGroup(uid: string, group: Group): Promise<void> {
  await setDoc(doc(db(), "users", uid), { group }, { merge: true });
}

export async function setUserRole(
  uid: string,
  role: "user" | "admin"
): Promise<void> {
  await setDoc(doc(db(), "users", uid), { role }, { merge: true });
}

export async function deleteUserProfile(uid: string): Promise<void> {
  await deleteDoc(doc(db(), "users", uid));
}
