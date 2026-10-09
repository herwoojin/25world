import type { Metadata } from "next";

// 관리자 페이지는 검색에 노출될 이유가 없다
export const metadata: Metadata = {
  title: "관리자 콘솔 — 25WORLD",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
