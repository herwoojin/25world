// 카카오 로그인 → Firebase 커스텀 토큰 (Netlify Function, 무료·상시).
//
// Render 서버 대신 여기서 처리한다:
//   1) 프론트(/kakao)가 보낸 카카오 authorization code 를
//   2) 카카오 토큰 → 프로필로 교환하고
//   3) Firebase 커스텀 토큰(uid=kakao_{id})을 서비스계정 키로 직접 서명해 돌려준다.
//      (firebase-admin 없이 node:crypto 로 RS256 JWT 서명 — 함수 가볍게 유지)
//   4) 카카오 닉네임·사진·이메일을 Firestore users/{uid} 에 미리 써 둔다.
//
// 필요한 Netlify 환경변수:
//   KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET, FIREBASE_SERVICE_ACCOUNT_KEY (JSON 문자열)
// 클라이언트 시크릿은 여기(서버) 환경변수에만 둔다.

import crypto from "node:crypto";

const PROJECT_ID = "jini-vibe-coding";
const FIREBASE_API_KEY = "AIzaSyCuog0TdR371MNDKreqk9_4w7yrTIfa8qA"; // 웹 공개 키
const DB = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Firebase 커스텀 토큰(RS256 JWT) 직접 서명 */
function signCustomToken(sa, uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  };
  const signingInput =
    b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(payload));
  const sig = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(sa.private_key);
  return signingInput + "." + b64url(sig);
}

async function exchangeCode(code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.KAKAO_REST_API_KEY || "",
    redirect_uri: redirectUri,
    code,
  });
  if (process.env.KAKAO_CLIENT_SECRET)
    body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);

  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      `카카오 토큰 교환 실패: ${data.error_description || data.error || res.status}`
    );
  }
  return data.access_token;
}

async function fetchProfile(accessToken) {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    throw new Error(`카카오 프로필 조회 실패: ${data.msg || res.status}`);
  }
  const acc = data.kakao_account || {};
  const prof = acc.profile || {};
  return {
    id: String(data.id),
    nickname: prof.nickname || "카카오회원",
    photo: prof.profile_image_url || "",
    email: acc.email || "",
  };
}

/** 카카오 프로필을 Firestore users/{uid} 에 저장 (updateMask 로 name/photo/email 만 병합) */
async function writeProfile(uid, p) {
  const url =
    `${DB}/users/${encodeURIComponent(uid)}?key=${FIREBASE_API_KEY}` +
    `&updateMask.fieldPaths=name&updateMask.fieldPaths=photo` +
    `&updateMask.fieldPaths=email&updateMask.fieldPaths=provider`;
  const fields = {
    name: { stringValue: p.nickname },
    photo: { stringValue: p.photo },
    email: { stringValue: p.email },
    provider: { stringValue: "kakao" },
  };
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  }).catch(() => {});
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    if (!process.env.KAKAO_REST_API_KEY)
      return json({ ok: false, error: "KAKAO_REST_API_KEY 환경변수가 없습니다." }, 500);
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!saRaw)
      return json({ ok: false, error: "FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 없습니다." }, 500);
    const sa = JSON.parse(saRaw);

    const { code, redirectUri } = await req.json().catch(() => ({}));
    if (!code || !redirectUri)
      return json({ ok: false, error: "code/redirectUri 필요" }, 400);

    const accessToken = await exchangeCode(code, redirectUri);
    const p = await fetchProfile(accessToken);
    const uid = `kakao_${p.id}`;

    await writeProfile(uid, p);
    const token = signCustomToken(sa, uid, { provider: "kakao" });

    return json({
      ok: true,
      token,
      profile: { uid, name: p.nickname, photo: p.photo, email: p.email },
    });
  } catch (e) {
    return json({ ok: false, error: e?.message || "카카오 로그인 실패" }, 400);
  }
};
