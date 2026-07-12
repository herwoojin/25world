// Firebase 클라이언트 초기화 — 웹 config는 공개되어도 안전한 값 (Firebase 설계)
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyCuog0TdR371MNDKreqk9_4w7yrTIfa8qA",
  authDomain: "jini-vibe-coding.firebaseapp.com",
  projectId: "jini-vibe-coding",
  storageBucket: "jini-vibe-coding.firebasestorage.app",
  messagingSenderId: "1036949193829",
  appId: "1:1036949193829:web:80541f04626ee360fcb28c",
};

export function getFirebaseApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

// 블로그 데이터 소스 (tg-post-saver 와 공유)
export const BLOG_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbzaHHXKDthsK-sYeTqV0ntvD4lAXChmYHC4i9sh7V2jYy6kV_g73MB3_gPvyaH1LHzH/exec";
export const BLOG_STORAGE_BUCKET = "jini-vibe-coding.firebasestorage.app";

// 봇/TTS 서버 (Render) — 무료 플랜은 잠들 수 있어 요청 전에 깨운다
export const BOT_SERVER_URL = "https://tg-post-saver.onrender.com";
