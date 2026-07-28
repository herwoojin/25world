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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 카카오 인증 페이지로 이동 (이동 전에 서버를 미리 깨워 둔다) */
export function startKakaoLogin(): void {
  // Render 무료 플랜 슬립 대응 — 사용자가 카카오 화면을 보는 동안 서버가 깬다
  fetch(`${BOT_SERVER_URL}/api/wake`, { cache: "no-store" }).catch(() => {});
  const params = new URLSearchParams({
    client_id: KAKAO_REST_KEY,
    redirect_uri: kakaoRedirectUri(),
    response_type: "code",
  });
  window.location.href = `https://kauth.kakao.com/oauth/authorize?${params}`;
}

/** 서버가 깰 때까지 /api/wake 를 폴링한다 (cold start 최대 ~80초).
 *  잠든 동안에는 Render 프록시가 CORS 헤더 없는 502 를 주므로 fetch 가 실패한다 → 재시도. */
async function wakeServer(): Promise<boolean> {
  const deadline = Date.now() + 80_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BOT_SERVER_URL}/api/wake`, { cache: "no-store" });
      if (r.ok) return true;
    } catch {
      // 네트워크/CORS 실패 = 아직 깨는 중
    }
    await sleep(3000);
  }
  return false;
}

/** code → 백엔드 → Firebase 커스텀 토큰 */
export async function exchangeKakaoCode(code: string): Promise<string> {
  const awake = await wakeServer();
  if (!awake) {
    throw new Error("서버를 깨우지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  // 서버가 깬 뒤에도 첫 요청이 순간적으로 실패할 수 있어 네트워크 오류만 몇 번 재시도한다.
  // (인증 코드는 서버가 실제 응답을 준 경우에만 소비되므로, 네트워크 실패 재시도는 안전하다)
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BOT_SERVER_URL}/api/auth/kakao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirectUri: kakaoRedirectUri() }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok || !data.token) {
        // 서버가 응답했으나 실패 — 재시도하지 않고 그대로 알린다
        throw new Error(data.error || "카카오 로그인에 실패했습니다.");
      }
      return data.token as string;
    } catch (e) {
      lastErr = e;
      // 서버가 준 오류(Error)면 재시도 안 함, 네트워크 실패(TypeError)면 재시도
      if (!(e instanceof TypeError)) throw e;
      await sleep(2500);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("카카오 로그인에 실패했습니다.");
}
