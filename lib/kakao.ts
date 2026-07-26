"use client";

// 카카오 로그인 — authorization code 플로우.
//   1) 카카오 인증 페이지로 보냄 (redirect_uri = <이 사이트>/kakao)
//   2) /kakao 페이지가 code 를 받아 백엔드(tg-post-saver)로 넘김
//   3) 백엔드가 Firebase 커스텀 토큰을 돌려주면 signInWithCustomToken 으로 로그인
// REST 키는 공개돼도 되는 값(리다이렉트 URI 화이트리스트로 보호됨).
// 클라이언트 시크릿은 프론트에 절대 두지 않는다 — 백엔드 env 에만.

import { BOT_SERVER_URL } from "@/lib/firebase";

export const KAKAO_REST_KEY = "0f4e254c8ee38649ace36e3cbe7782a1";

/** 이 사이트 기준의 리다이렉트 URI (배포/로컬 자동 판별) */
export function kakaoRedirectUri(): string {
  return `${window.location.origin}/kakao`;
}

/** 카카오 인증 페이지로 이동 */
export function startKakaoLogin(): void {
  const params = new URLSearchParams({
    client_id: KAKAO_REST_KEY,
    redirect_uri: kakaoRedirectUri(),
    response_type: "code",
  });
  window.location.href = `https://kauth.kakao.com/oauth/authorize?${params}`;
}

/** code → 백엔드 → Firebase 커스텀 토큰 */
export async function exchangeKakaoCode(code: string): Promise<string> {
  // Render 무료 플랜이 잠들어 있을 수 있어 먼저 깨운다
  await fetch(`${BOT_SERVER_URL}/api/wake`).catch(() => {});
  const res = await fetch(`${BOT_SERVER_URL}/api/auth/kakao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri: kakaoRedirectUri() }),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  if (!data.ok || !data.token) {
    throw new Error(data.error || "카카오 로그인에 실패했습니다.");
  }
  return data.token as string;
}
