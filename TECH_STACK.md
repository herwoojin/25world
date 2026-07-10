# TECH_STACK — 25world

> 바이브코딩 20개 사이트 포털. Next.js 14 정적 내보내기 → Netlify 호스팅. **마지막 업데이트: 2026-07-10**

## 아키텍처

```
lib/sites.ts (데이터 SSOT)
   │
   ▼
Next.js 14 App Router (전부 서버 컴포넌트, 클라이언트 JS 최소)
   ├─ WorldHero ── IconMarquee ×2 ── SiteIcon (캐러셀 칩)
   └─ CategorySection ×5 ── NodeCard (타원 노드)
   │
   ▼  npm run build (output:'export')
out/  ──────────────►  Netlify 정적 호스팅
```

## 스택 상세

| 이름 | 버전 | 용도 | 위치 | 비고 |
|---|---|---|---|---|
| Next.js | 14.2.x | 정적 사이트 생성 | `next.config.mjs` | `output:'export'` |
| React | 18.3.x | UI 렌더링 | `app/`, `components/` | 전부 서버 컴포넌트 |
| TypeScript | 5.x | 타입 안전성 | `tsconfig.json` | strict, `CategoryId` 유니언으로 FK 강제 |
| Tailwind CSS | 3.4.x | 스타일 + 캐러셀 keyframes | `tailwind.config.ts` | `darkMode:'class'`, scroll-left/right 30s |
| shadcn/ui Button·Badge·Card | — | CTA·궤도 상세 카드 | `components/ui/` | radix-slot + cva |
| Paperlogy 폰트 | 400/600/700/800 | 전역 서체 (셀프호스팅 woff2) | `public/fonts/`, `app/globals.css` | 외부 CDN 미사용 |
| CategoryOrbital | — | 카테고리별 궤도 UI (자동 회전 + 상세 카드) | `components/category-orbital.tsx` | 클라이언트 컴포넌트 |
| clsx / tailwind-merge | — | `cn()` 유틸 | `lib/utils.ts` | |
| lucide-react | — | 테마 스위처 아이콘 | `components/theme-switcher.tsx` | Sun/Moon/Scroll |
| 테마 시스템 | — | 주간/야간/종이재질 3모드 | `components/theme-switcher.tsx`, `app/globals.css` | localStorage `25world:theme`, FOUC 방지 인라인 스크립트 |
| PWA | — | 홈 화면 설치 + 오프라인 | `public/manifest.webmanifest`, `public/sw.js` | SW는 프로덕션에서만 등록 |
| Firebase Auth | 12.x (npm) | 첫 화면 구글 로그인 게이트 | `components/auth-gate.tsx`, `lib/firebase.ts` | UI 게이트 (정적 사이트) |
| 블로그 섹션 | — | 저장 글 목록·새 창 읽기·다운로드·하트 | `components/blog-section.tsx` | 목록=Apps Script, 본문=Firestore, 좋아요=Firestore likes(1인 1하트) |
| Netlify | — | 호스팅 | — | Build `npm run build` / Publish `out` |

## 왜 이 선택인가

- **DB 없음**: 20건의 정적 데이터는 `lib/sites.ts` TS 상수가 가장 싸고 안전 (타입 검증 공짜). 30개 초과 시 ERD §7 경로로 이관.
- **정적 내보내기**: 서버 비용 0, Netlify 무료 티어로 충분. 이미지 요청 0건(전부 인라인 SVG)이라 Lighthouse 성능 확보.
- **서버 컴포넌트 only**: 캐러셀 일시정지·호버 효과를 전부 CSS로 처리해 클라이언트 JS 번들 최소화 (First Load 87.5kB).

## 외부 의존 서비스

- **Netlify 무료 티어**: 대역폭 100GB/월 — 정적 HTML 1페이지라 사실상 무제한. 요금 영향 없음.
- 외부 CDN/폰트/이미지 요청 **0건** (보안·성능 규칙, TRD §9).

## 알려진 한계

- 배터리 인디케이터(서버 용량 신호등)는 **해당 없음** — 백엔드·서버리스 함수가 전혀 없는 순수 정적 사이트.
- 방문 카운트·검색·상태 배지는 Phase 2 백로그 (TASK.md T-15~T-18).
