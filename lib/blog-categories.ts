// 블로그 글 카테고리 — 서버(preview.js)의 분류 규칙과 id 를 맞춘다.
export type BlogCatId = "ainews" | "money" | "life" | "misc";

export interface BlogCat {
  id: BlogCatId;
  emoji: string;
  name: string;
  color: string;
}

export const BLOG_CATS: BlogCat[] = [
  { id: "ainews", emoji: "🤖", name: "AI뉴스", color: "#A78BFA" },
  { id: "money", emoji: "💰", name: "돈경제", color: "#17E9C0" },
  { id: "life", emoji: "🌿", name: "생활·건강", color: "#4DA3FF" },
  { id: "misc", emoji: "🧩", name: "잡학다식", color: "#FFC24D" },
];

export function blogCat(id?: string | null): BlogCat {
  return BLOG_CATS.find((c) => c.id === id) ?? BLOG_CATS[3];
}
