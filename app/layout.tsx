import type { Metadata, Viewport } from "next";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import PwaRegister from "@/components/pwa-register";
import AuthGate from "@/components/auth-gate";
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
        <AuthGate>
          <NlmProvider>
            <SiteHeader />
            {children}
            <SiteFooter />
            <NotebookLMTray />
          </NlmProvider>
        </AuthGate>
        <PwaRegister />
      </body>
    </html>
  );
}
