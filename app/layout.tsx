import type { Metadata, Viewport } from "next";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import ContactOwner from "@/components/contact-owner";
import PwaRegister from "@/components/pwa-register";
import AuthGate from "@/components/auth-gate";
import ErrorBoundary from "@/components/error-boundary";
import LoadingPopup from "@/components/loading-popup";
import StarField from "@/components/star-field";
import { NlmProvider } from "@/components/notebooklm/nlm-context";
import { NotebookLMTray } from "@/components/notebooklm/notebooklm-tray";
import DayWave from "@/components/day-wave";
import "./globals.css";

export const metadata: Metadata = {
  title: "25WORLD — 바이브코딩 사이트 모음집",
  description: "바이브코딩으로 만든 20개의 사이트, 한 곳에서.",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "25WORLD",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0B",
};

// 저장된 테마를 페인트 전에 복원 (기본 dark)
const THEME_INIT = `(function(){try{var t=localStorage.getItem('25world:theme')||'dark';var c=document.documentElement.classList;c.remove('dark','paper');if(t==='dark'||t==='paper')c.add(t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <StarField />
        <DayWave />
        <ErrorBoundary>
          <AuthGate>
            <NlmProvider>
              <SiteHeader />
              <LoadingPopup />
              {children}
              <ContactOwner />
              <SiteFooter />
              <NotebookLMTray />
            </NlmProvider>
          </AuthGate>
        </ErrorBoundary>
        <PwaRegister />
        {/* 비서ON(지니) 음성 제어 브리지: 비서ON 이 연 창·탭에서만 동작하고 일반 방문자에게는 아무 일도 하지 않음.
            삭제·결제·비밀번호는 하지 않고, 저장·게시·로그인 같은 버튼은 비서ON 화면에서 사람이 [실행]을 눌러야 함 */}
        <script src="/bisheon-bridge.js" data-app="25world" data-control="full" data-allow="http://localhost:3000,http://127.0.0.1:3000,https://heoujin-ui-macbookair-1591.tail43923a.ts.net:8443" defer />
      </body>
    </html>
  );
}
