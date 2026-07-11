// 25world 데이터 계층 — ERD.md §3~4 준수 (Single Source of Truth)
// 사이트 추가/수정은 이 파일만 편집하면 UI 전체에 자동 반영된다.
//
// [보안] icon/art 는 dangerouslySetInnerHTML 로 렌더되므로
// 반드시 이 파일에 정적으로 작성된 SVG 문자열만 허용한다.
// 외부 입력·fetch 데이터를 절대 이 필드에 넣지 말 것 (ERD §6-3).

export type CategoryId = "cvs" | "ai" | "map" | "con" | "util" | "ainative";

export interface Category {
  id: CategoryId;
  emoji: string;
  name: string;
  color: string; // #RRGGBB
}

export interface Site {
  id: string; // 유니크, 서브도메인 기준
  cat: CategoryId; // 논리 FK
  name: string; // ~14자, HTML 금지
  desc: string; // ~40자, HTML 금지
  url: `https://${string}`;
  icon: string; // 24×24 SVG 내부 코드 (히어로 캐러셀 칩)
  art: string; // 320×170 SVG 내부 코드 (노드 배경)
  status?: "live" | "beta" | "archived"; // Phase 2, 기본 live
}

export const CATEGORIES: Category[] = [
  { id: "cvs", emoji: "🏪", name: "편의점 · CVS 업무", color: "#17E9C0" },
  { id: "ai", emoji: "🤖", name: "AI · 에이전트", color: "#A78BFA" },
  { id: "map", emoji: "🗺️", name: "지도 · 공공데이터", color: "#4DA3FF" },
  { id: "con", emoji: "🎬", name: "콘텐츠 제작", color: "#FF7A9E" },
  { id: "util", emoji: "🛠️", name: "생산성 · 유틸리티", color: "#FFC24D" },
  { id: "ainative", emoji: "🏢", name: "AI네이티브조직", color: "#7ED957" },
];

export const SITES: Site[] = [
  // ───────────────────────── cvs #17E9C0 ─────────────────────────
  {
    id: "25bb",
    cat: "cvs",
    name: "CVS 현황보드",
    desc: "CVS 업무 전체 현황보드",
    url: "https://25bb.netlify.app",
    icon: `<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M13 15h8M13 19h5"/>`,
    art: `<g stroke="#17E9C0" fill="none" stroke-width="3"><rect x="22" y="30" width="34" height="26" rx="4"/><rect x="62" y="30" width="34" height="26" rx="4" stroke="#fff" opacity=".7"/><rect x="22" y="62" width="34" height="26" rx="4" stroke="#fff" opacity=".7"/><rect x="62" y="62" width="34" height="26" rx="4"/><path d="M240 122V80M258 122V58M276 122V94" stroke-width="5"/><path d="M232 130h56" stroke="#fff" opacity=".6"/><circle cx="34" cy="122" r="5" fill="#17E9C0" stroke="none"/><path d="M46 122h34" opacity=".6"/></g>`,
  },
  {
    id: "530cvs",
    cat: "cvs",
    name: "GS25 근태관리",
    desc: "GS25 근태관리 웹앱",
    url: "https://530cvs.netlify.app",
    icon: `<circle cx="11" cy="11" r="7"/><path d="M11 7v4l3 2"/><path d="M15 19l2.5 2.5L22 17"/>`,
    art: `<g stroke="#17E9C0" fill="none" stroke-width="3"><circle cx="58" cy="70" r="30"/><path d="M58 52v18l12 8"/><path d="M28 128h60" opacity=".5" stroke-dasharray="6 6"/><path d="M248 46l9 9 16-16" stroke="#fff" stroke-width="4"/><circle cx="252" cy="96" r="5" fill="#17E9C0" stroke="none"/><circle cx="272" cy="96" r="5" fill="#17E9C0" stroke="none"/><circle cx="292" cy="96" r="5" opacity=".5"/><path d="M240 126h64" stroke="#fff" opacity=".4"/></g>`,
  },
  {
    id: "25k",
    cat: "cvs",
    name: "모두의 외근출근부",
    desc: "외근 증빙 제출 · 네이버/카카오맵 연동",
    url: "https://25k.netlify.app",
    icon: `<path d="M12 21s-6-5.2-6-9.5a6 6 0 0 1 12 0C18 15.8 12 21 12 21z"/><circle cx="12" cy="11.5" r="2"/><path d="M19 4c2 2 2 5 .5 7" stroke-dasharray="2 3"/>`,
    art: `<g stroke="#17E9C0" fill="none" stroke-width="3"><path d="M52 98c0-5-15-15-15-27a15 15 0 0 1 30 0c0 12-15 22-15 27z"/><circle cx="52" cy="70" r="5"/><path d="M36 142C110 152 210 152 284 142" stroke-dasharray="5 8" opacity=".8"/><circle cx="282" cy="60" r="6" stroke="#fff"/><path d="M282 66v22" stroke="#fff" opacity=".7"/><path d="M244 34l14 6-14 6v-12z" fill="#17E9C0" stroke="none"/></g>`,
  },
  {
    id: "25do",
    cat: "cvs",
    name: "2D도면 3D체크",
    desc: "2D 도면을 3D로 간단히 확인",
    url: "https://25do.netlify.app",
    icon: `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12v9M12 12l8-4.5M12 12L4 7.5"/>`,
    art: `<g stroke="#17E9C0" fill="none" stroke-width="3"><path d="M25 55h56v56" stroke="#fff" opacity=".5" stroke-dasharray="6 6"/><path d="M53 40l30 17v34l-30 17-30-17V57l30-17z"/><path d="M53 57v34m0-34l30-17m-30 17L23 40" opacity=".7"/><path d="M265 88l30 17-30 17-30-17 30-17z"/><path d="M265 54v34" stroke="#fff" opacity=".6" stroke-dasharray="5 6"/></g>`,
  },
  {
    id: "25as",
    cat: "cvs",
    name: "편의점 고수찾기",
    desc: "숨고 스타일 편의점 전문가 매칭",
    url: "https://25as.netlify.app",
    icon: `<circle cx="10" cy="10" r="6.5"/><path d="M21 21l-6-6"/><path d="M7.5 10.5L10 8l2.5 2.5V13h-5v-2.5z"/>`,
    art: `<g stroke="#17E9C0" fill="none" stroke-width="3"><circle cx="58" cy="64" r="27"/><path d="M78 84l20 20" stroke-width="5"/><path d="M48 67l10-10 10 10v11H48V67z" stroke="#fff"/><path d="M238 116h60M242 116V92h52v24" opacity=".9"/><path d="M238 92l9-16h42l9 16" /><path d="M258 116v-13h20v13" stroke="#fff" opacity=".7"/></g>`,
  },

  // ───────────────────────── ai #A78BFA ─────────────────────────
  {
    id: "seeai",
    cat: "ai",
    name: "seeAI",
    desc: "AI 관련 모음 사이트",
    url: "https://seeai.netlify.app",
    icon: `<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>`,
    art: `<g stroke="#A78BFA" fill="none" stroke-width="3"><path d="M18 70s18-25 46-25 46 25 46 25-18 25-46 25-46-25-46-25z"/><circle cx="64" cy="70" r="11" stroke="#fff"/><circle cx="64" cy="70" r="3.5" fill="#A78BFA" stroke="none"/><path d="M234 58h32m0 0v34m0 0h32" opacity=".8"/><circle cx="234" cy="58" r="5" stroke="#fff"/><circle cx="266" cy="58" r="5" fill="#A78BFA" stroke="none"/><circle cx="298" cy="92" r="5" stroke="#fff"/></g>`,
  },
  {
    id: "25e",
    cat: "ai",
    name: "메타인지 질문",
    desc: "나의 메타인지로 질문하기 (제미나이)",
    url: "https://25e.netlify.app",
    icon: `<path d="M4 4h16v11h-8l-4 4v-4H4V4z"/><path d="M10.3 8c.3-1 1.1-1.6 2-1.6 1.1 0 2 .8 2 1.8 0 1.4-2 1.5-2 2.9"/><circle cx="12.3" cy="13" r=".7" fill="currentColor"/>`,
    art: `<g stroke="#A78BFA" fill="none" stroke-width="3"><path d="M24 34h72v42H54l-14 14V76H24V34z"/><path d="M38 48h44M38 60h30" stroke="#fff" opacity=".6"/><path d="M240 34h64v34h-20v12l-12-12h-32V34z" opacity=".5"/><path d="M256 96c0-11 8-17 17-17s17 6 17 16c0 13-15 12-15 25" stroke-width="5"/><circle cx="275" cy="132" r="4.5" fill="#A78BFA" stroke="none"/></g>`,
  },
  {
    id: "25r",
    cat: "ai",
    name: "Desk RPG",
    desc: "에이전트에게 일 시키기",
    url: "https://25r.netlify.app",
    icon: `<path d="M12 20l-7-6.5V7h4.5L12 9.5 14.5 7H19v6.5L12 20z"/>`,
    art: `<g stroke="#A78BFA" fill="none" stroke-width="3"><path d="M42 126L96 72" stroke="#fff" stroke-width="5"/><path d="M96 72l14-34-34 14 20 20z"/><path d="M52 104l16 16" stroke-width="5"/><path d="M38 130l-8 8" stroke-width="5"/><g fill="#A78BFA" stroke="none"><rect x="256" y="52" width="10" height="10"/><rect x="276" y="52" width="10" height="10"/><rect x="246" y="62" width="50" height="10"/><rect x="256" y="72" width="30" height="10"/><rect x="266" y="82" width="10" height="10"/></g><path d="M244 112h54" opacity=".5" stroke-dasharray="4 6"/></g>`,
  },

  // ───────────────────────── map #4DA3FF ─────────────────────────
  {
    id: "25i",
    cat: "map",
    name: "서울지하철 실시간",
    desc: "실시간 노선 보고 타기 (공공데이터)",
    url: "https://25i.netlify.app",
    icon: `<path d="M3 16c4.5 0 5.5-8 9-8 3 0 4.5 3 9 3"/><circle cx="7.2" cy="13.2" r="1.4" fill="currentColor"/><circle cx="12" cy="8" r="1.4" fill="currentColor"/><circle cx="17" cy="10.4" r="1.4" fill="currentColor"/>`,
    art: `<g fill="none" stroke-width="4"><path d="M10 38C85 38 235 30 310 44" stroke="#0052A4"/><path d="M10 132C90 126 230 142 310 128" stroke="#00A84D"/><path d="M18 154C100 148 220 160 302 150" stroke="#00A5DE"/><circle cx="62" cy="37" r="5" fill="#fff" stroke="#0052A4" stroke-width="3"/><circle cx="252" cy="36" r="5" fill="#fff" stroke="#0052A4" stroke-width="3"/><circle cx="82" cy="129" r="5" fill="#fff" stroke="#00A84D" stroke-width="3"/><circle cx="242" cy="138" r="5" fill="#fff" stroke="#00A84D" stroke-width="3"/><circle cx="160" cy="153" r="5" fill="#fff" stroke="#00A5DE" stroke-width="3"/></g>`,
  },
  {
    id: "25c",
    cat: "map",
    name: "건축물대장 확인",
    desc: "건축물대장 확인방법 (공공데이터)",
    url: "https://25c.netlify.app",
    icon: `<path d="M4 21V5h9v16"/><path d="M7 9h3M7 13h3M7 17h3"/><path d="M13 21h7v-8h-7"/><path d="M16 16.5h1.5"/><path d="M3 21h18"/>`,
    art: `<g stroke="#4DA3FF" fill="none" stroke-width="3"><path d="M30 132V44h44v88"/><path d="M40 58h8M40 74h8M40 90h8M58 58h8M58 74h8M58 90h8" stroke="#fff" opacity=".8"/><path d="M18 132h70"/><rect x="240" y="36" width="54" height="70" rx="4"/><path d="M250 52h34M250 66h34M250 80h22" stroke="#fff" opacity=".8"/><path d="M276 118l9 9 16-16" stroke-width="4"/></g>`,
  },
  {
    id: "kroad",
    cat: "map",
    name: "K-ROAD",
    desc: "CCTV 네비게이션 + 날씨 연동",
    url: "https://k-road.asia",
    icon: `<path d="M8 21L11 4h2l3 17"/><path d="M12 8v2M12 12v2M12 16v2"/><path d="M16.5 4H21v3h-4.5z"/>`,
    art: `<g stroke="#4DA3FF" fill="none" stroke-width="3"><path d="M38 142L72 28M112 142L86 28"/><path d="M74 132v-15M79 100V88M83 68V57" stroke="#fff" stroke-width="4"/><rect x="236" y="40" width="42" height="24" rx="6"/><path d="M278 52l26-9v18l-26-9z"/><path d="M254 64v20m-16 0h32" stroke="#fff" opacity=".8"/><circle cx="292" cy="120" r="12" stroke="#fff" opacity=".7"/><path d="M292 112v8l5 4" stroke="#fff" opacity=".7"/></g>`,
  },
  {
    id: "barogo",
    cat: "map",
    name: "바로고 신규가게",
    desc: "배달대행(강서·양천) 신규 가게 찾기",
    url: "https://barogo.netlify.app",
    icon: `<circle cx="7" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M9.5 17.5H15"/><path d="M17.5 17.5L15.5 9H11"/><path d="M2 8.5h5M2.5 11.5h4"/>`,
    art: `<g stroke="#4DA3FF" fill="none" stroke-width="3"><circle cx="244" cy="118" r="15"/><circle cx="296" cy="118" r="15"/><path d="M259 118h22M296 118l-11-40h-17"/><path d="M268 78h18l7 16" stroke="#fff"/><path d="M18 52h54M28 72h44M18 92h54M28 112h44" stroke="#fff" opacity=".7" stroke-width="4"/></g>`,
  },

  {
    id: "stockdetail",
    cat: "map",
    name: "국내 주식 정보",
    desc: "국내 주식 시세·상세 정보 조회",
    url: "https://stock-detail.onrender.com",
    icon: `<path d="M3 20.5h18"/><path d="M4 16l4.5-4.5 3 3L18 8"/><path d="M14.5 7.5H18V11"/>`,
    art: `<g stroke="#4DA3FF" fill="none" stroke-width="3"><path d="M30 44v52M22 56h16v28H22z"/><path d="M62 36v58M54 46h16v34H54z" stroke="#fff" opacity=".8"/><path d="M94 52v44M86 62h16v24H86z"/><path d="M20 132h84" opacity=".5"/><path d="M232 116l22-22 14 14 34-38" stroke="#fff" stroke-width="4"/><path d="M288 68h16v16" stroke="#fff" stroke-width="4"/><circle cx="254" cy="94" r="4" fill="#4DA3FF" stroke="none"/><path d="M228 132h76" opacity=".5" stroke-dasharray="5 6"/></g>`,
  },

  {
    id: "25w",
    cat: "map",
    name: "주식 거시지표 분석",
    desc: "주식 거시(macro)지표 분석",
    url: "https://25w.netlify.app",
    icon: `<path d="M3 20.5h18"/><path d="M3.5 15c2.5-1 3.5-7 5.5-7s3 4.5 5 4.5S17.5 6 20.5 5"/><circle cx="9" cy="8" r="1.3" fill="currentColor"/><circle cx="14" cy="12.5" r="1.3" fill="currentColor"/>`,
    art: `<g stroke="#4DA3FF" fill="none" stroke-width="3"><path d="M28 108a34 34 0 0 1 68 0" /><path d="M62 108L82 84" stroke="#fff" stroke-width="4"/><circle cx="62" cy="108" r="5" fill="#4DA3FF" stroke="none"/><path d="M34 124h56" opacity=".5"/><path d="M232 110c10-4 14-34 24-34s12 22 22 22 12-28 22-28" stroke="#fff" stroke-width="4"/><path d="M228 128h80" opacity=".5"/><circle cx="256" cy="76" r="4" fill="#4DA3FF" stroke="none"/><circle cx="278" cy="98" r="4" fill="#4DA3FF" stroke="none"/></g>`,
  },

  // ───────────────────────── con #FF7A9E ─────────────────────────
  {
    id: "25y",
    cat: "con",
    name: "유튜브→블로그",
    desc: "유튜브 영상을 글로 전환",
    url: "https://25y.netlify.app",
    icon: `<rect x="2" y="6" width="10" height="8" rx="2"/><path d="M6 8.5v3l3-1.5-3-1.5z" fill="currentColor"/><path d="M15 8h7M15 12h7M15 16h5"/>`,
    art: `<g stroke="#FF7A9E" fill="none" stroke-width="3"><rect x="22" y="44" width="72" height="52" rx="10"/><path d="M50 58v24l23-12-23-12z" fill="#FF7A9E" stroke="none"/><path d="M40 128h44" opacity=".5" stroke-dasharray="4 6"/><path d="M240 48h60M240 64h60M240 80h44M240 96h52M240 112h36" stroke="#fff" opacity=".85"/><path d="M104 36h26m0 0l-8-8m8 8l-8 8" stroke="#fff" opacity=".8"/></g>`,
  },
  {
    id: "makeu2v",
    cat: "con",
    name: "makeU2V",
    desc: "유튜브 영상으로 제작하기",
    url: "https://makeu2v.netlify.app",
    icon: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14"/><path d="M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21"/><path d="M10.8 10v4l3.2-2-3.2-2z" fill="currentColor"/>`,
    art: `<g stroke="#FF7A9E" fill="none" stroke-width="3"><rect x="20" y="40" width="84" height="60" rx="6"/><path d="M38 40v60M86 40v60" opacity=".7"/><path d="M20 55h18M20 85h18M86 55h18M86 85h18" opacity=".7"/><path d="M54 58v24l21-12-21-12z" fill="#fff" stroke="none"/><rect x="242" y="42" width="54" height="36" rx="5"/><path d="M258 78v16M282 78v16" opacity=".6"/><path d="M234 128c22-14 50-14 70 0" stroke="#fff" opacity=".7" stroke-dasharray="5 7"/></g>`,
  },
  {
    id: "25n",
    cat: "con",
    name: "상세페이지 메이커",
    desc: "제품 상세페이지 만들기",
    url: "https://25n.netlify.app",
    icon: `<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="6" rx="1"/><path d="M8 15.5h8M8 18.5h5"/>`,
    art: `<g stroke="#FF7A9E" fill="none" stroke-width="3"><rect x="28" y="28" width="66" height="94" rx="8"/><rect x="38" y="38" width="46" height="34" rx="4" stroke="#fff" opacity=".8"/><path d="M38 84h46M38 98h32M38 112h38" opacity=".8"/><path d="M252 38l6 12 13 2-9.5 9 2.3 13.4L252 68l-11.8 6.4L242.5 61 233 52l13-2 6-12z" stroke="#fff"/><path d="M234 108h58M234 124h40" opacity=".7"/></g>`,
  },

  // ───────────────────────── util #FFC24D ─────────────────────────
  {
    id: "25l",
    cat: "util",
    name: "태스크 그래프",
    desc: "업무 태스크를 옵시디언처럼",
    url: "https://25l.netlify.app",
    icon: `<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="7.5" r="2.5"/><circle cx="8" cy="18" r="2.5"/><circle cx="17.5" cy="17" r="2"/><path d="M8.4 6.6l7.2.7M6.6 8.4l1 7.2M10.4 17.6l5.2-.4M17.9 9.9l-.2 5.1"/>`,
    art: `<g stroke="#FFC24D" fill="none" stroke-width="3"><circle cx="46" cy="44" r="12"/><circle cx="92" cy="90" r="9" stroke="#fff"/><circle cx="40" cy="126" r="9"/><circle cx="254" cy="44" r="9" stroke="#fff"/><circle cx="292" cy="94" r="12"/><circle cx="246" cy="132" r="8"/><path d="M54 53l31 30M84 96l-36 24M58 44h187M262 50l23 34M285 105l-32 21" opacity=".6"/></g>`,
  },
  {
    id: "hanguk",
    cat: "util",
    name: "글로벌 미팅",
    desc: "글로벌 미팅·약속잡기 웹앱",
    url: "https://hanguk.netlify.app",
    icon: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3.5 4 3.5 14 0 18-3.5-4-3.5-14 0-18z"/>`,
    art: `<g stroke="#FFC24D" fill="none" stroke-width="3"><circle cx="62" cy="78" r="35"/><path d="M27 78h70M62 43c14 17 14 53 0 70-14-17-14-53 0-70z" opacity=".8"/><circle cx="252" cy="56" r="17" stroke="#fff"/><path d="M252 46v10l7 5" stroke="#fff"/><circle cx="294" cy="112" r="17"/><path d="M294 102v10l-6 5"/></g>`,
  },
  {
    id: "824u",
    cat: "util",
    name: "824u 주소단축",
    desc: "긴 주소를 짧은 주소로",
    url: "https://824u.xyz",
    icon: `<path d="M2 4.5h20"/><path d="M10.6 16.2a3 3 0 0 0 4.2 0l2.8-2.8a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M13.4 11.8a3 3 0 0 0-4.2 0l-2.8 2.8a3 3 0 0 0 4.2 4.2l1-1"/>`,
    art: `<g stroke="#FFC24D" fill="none" stroke-width="3"><path d="M18 38h104M18 54h76M18 70h44" stroke="#fff" opacity=".6"/><path d="M36 132h50m0 0l-10-10m10 10l-10 10" opacity=".8"/><path d="M254 100a15 15 0 0 1 0-21l13-13a15 15 0 0 1 21 21l-5 5" stroke-width="4"/><path d="M274 79a15 15 0 0 1 0 21l-13 13a15 15 0 0 1-21-21l5-5" stroke-width="4"/></g>`,
  },
  {
    id: "25o",
    cat: "util",
    name: "화면 미러링",
    desc: "휴대폰 화면 미러링",
    url: "https://25o.netlify.app",
    icon: `<rect x="2" y="4" width="13" height="10" rx="1.5"/><path d="M6 18h5"/><path d="M8.5 14v4"/><rect x="16" y="9" width="6" height="11" rx="1.5"/><path d="M18.5 17.5h1"/>`,
    art: `<g stroke="#FFC24D" fill="none" stroke-width="3"><rect x="30" y="34" width="52" height="92" rx="10"/><path d="M48 44h16" opacity=".7"/><rect x="228" y="44" width="78" height="54" rx="6" stroke="#fff"/><path d="M267 98v16m-22 0h44" stroke="#fff" opacity=".7"/><path d="M100 142h58m0 0l-10-10m10 10l-10 10" opacity=".8"/><path d="M218 26h-56m0 0l10-10m-10 10l10 10" opacity=".8"/></g>`,
  },
  {
    id: "25x",
    cat: "util",
    name: "우리동네 고수찾기",
    desc: "우리동네 전문가(고수) 매칭",
    url: "https://25x.netlify.app",
    icon: `<path d="M12 2.5l1.9 3.8 4.2.6-3 3 .7 4.2L12 12.1l-3.8 2 .7-4.2-3-3 4.2-.6L12 2.5z"/><circle cx="12" cy="18" r="1.8"/><path d="M8 22.5c.7-1.8 2.2-2.8 4-2.8s3.3 1 4 2.8"/>`,
    art: `<g stroke="#FFC24D" fill="none" stroke-width="3"><path d="M62 30l9 18 20 3-14.5 14 3.4 20L62 75.6 44.1 85l3.4-20L33 51l20-3 9-18z"/><circle cx="62" cy="118" r="9" stroke="#fff"/><path d="M44 142c3.5-9 10-13.5 18-13.5s14.5 4.5 18 13.5" stroke="#fff"/><circle cx="252" cy="48" r="8"/><path d="M236 70c3-8 9-12 16-12s13 4 16 12" opacity=".8"/><circle cx="294" cy="100" r="8" stroke="#fff"/><path d="M278 122c3-8 9-12 16-12s13 4 16 12" stroke="#fff" opacity=".8"/></g>`,
  },
];

// ERD §6-2: 개발 모드 중복 검사 assert
if (process.env.NODE_ENV !== "production") {
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const s of SITES) {
    if (ids.has(s.id)) throw new Error(`[sites.ts] 중복 id: ${s.id}`);
    if (urls.has(s.url)) throw new Error(`[sites.ts] 중복 url: ${s.url}`);
    ids.add(s.id);
    urls.add(s.url);
  }
}

export function getCategoryColor(cat: CategoryId): string {
  return CATEGORIES.find((c) => c.id === cat)!.color;
}
