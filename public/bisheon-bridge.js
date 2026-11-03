/*! 비서ON 브리지 v2 — 내 웹앱을 비서ON(자비스·지니) 음성 제어에 연결합니다. 규약: docs/08_BRIDGE.md
 *
 * 1) 붙이기:  <script src="/bisheon-bridge.js" data-app="my-app" data-allow="http://localhost:3000"></script>
 *    전체 제어(화면의 버튼·링크·입력칸을 모두 읽고 누르고 채우기)를 허락하려면 data-control="full" 을 더합니다.
 * 2) 명령 등록 (선택):
 *    BisheonBridge.register("search", {
 *      description: "상품 검색", params: { q: "string" }, phrases: ["검색", "찾아"], risk: "ui",
 *      run: async ({ q }) => { setQuery(q); return { count: results.length }; },
 *    });
 *
 * 안전 규칙
 * - data-allow 에 적힌 비서ON 주소에서, 이 페이지를 연 창(부모 창 또는 opener)이 보낸 메시지만 받습니다. 비서ON 없이 열면 아무 일도 하지 않습니다.
 * - 결제·삭제·발송·권한 계열 이름의 명령은 등록되지 않습니다.
 * - risk "write" 명령은 비서ON 화면에서 사람이 [실행]을 눌러야 들어옵니다 (confirmed: true).
 * - 전체 제어: 삭제·결제·구매·탈퇴·송금·권한 버튼은 누르지 않고, 비밀번호·카드 칸은 채우지 않습니다.
 *   저장·등록·게시·제출·로그인 같은 기록이 남는 버튼과 다른 폼 제출은 비서ON 화면에서 [실행]을 눌러야 합니다.
 *   다른 사이트로 나가는 링크는 누르지 않습니다.
 */
(function () {
  "use strict";
  if (typeof window === "undefined" || window.BisheonBridge) return;
  var script = document.currentScript;
  var ds = (script && script.dataset) || {};
  var APP = String(ds.app || location.host).slice(0, 40);
  var FULL = ds.control === "full";
  var ALLOW = String(ds.allow || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",").map(function (s) { return s.trim().replace(/\/$/, ""); }).filter(Boolean);
  var FORBIDDEN = /(^|_)(delete|remove|destroy|drop|purge|pay|payment|purchase|checkout|buy|order|refund|transfer|send|email|sms|call|grant|revoke|permission|password)(_|$)/i;
  // 전체 제어에서 비서ON 이 누르지 않는 버튼 / 사람 확인이 필요한 버튼
  var NEVER = /삭제|지우기|제거|탈퇴|해지|결제|구매|주문|송금|이체|환불|정산|충전|권한|비밀번호|delete|remove|destroy|\bpay|purchase|checkout|\bbuy\b|\border\b|refund|transfer|withdraw|password|grant|revoke/i;
  var RECORD = /저장|등록|게시|발행|올리기|작성\s*완료|수정\s*완료|완료|제출|전송|보내기|발송|신청|가입|로그인|로그아웃|업로드|댓글|좋아요|구독|공유|초대|승인|save|submit|post|publish|send|apply|sign\s*(in|up|out)|log\s*(in|out)|upload|comment|like|subscribe|share|invite|approve/i;
  var commands = {};
  var hostOrigin = null;

  function host() { return window.parent !== window ? window.parent : window.opener; }
  function post(msg, origin) {
    var h = host();
    if (!h) return;
    try { h.postMessage(Object.assign({ __bisheon: 1, v: 2, app: APP }, msg), origin); } catch (e) { /* 다른 출처: 무시 */ }
  }
  function list() {
    return Object.keys(commands).map(function (k) {
      var c = commands[k];
      return { name: k, description: c.description, params: c.params, risk: c.risk, phrases: c.phrases };
    });
  }
  function hello() {
    if (!host()) return;
    var msg = { type: "hello", title: document.title, url: location.href, control: FULL ? "full" : "basic", commands: list() };
    if (hostOrigin) post(msg, hostOrigin); else ALLOW.forEach(function (o) { post(msg, o); });
  }
  var helloTimer = null;
  function helloSoon() { clearTimeout(helloTimer); helloTimer = setTimeout(hello, 60); }

  function register(name, def) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(name)) { console.warn("[비서ON] 명령 이름은 영문 소문자·숫자·_ 만 됩니다:", name); return function () {}; }
    if (FORBIDDEN.test(name)) { console.warn("[비서ON] 결제·삭제·발송 계열 명령은 등록할 수 없습니다:", name); return function () {}; }
    if (!def || typeof def.run !== "function") { console.warn("[비서ON] run 함수가 필요합니다:", name); return function () {}; }
    commands[name] = {
      description: String(def.description || "").slice(0, 120),
      params: def.params && typeof def.params === "object" ? def.params : {},
      risk: def.risk === "read" || def.risk === "write" ? def.risk : "ui",
      phrases: Array.isArray(def.phrases) ? def.phrases.slice(0, 8) : [],
      run: def.run,
    };
    helloSoon();
    return function () { delete commands[name]; helloSoon(); };
  }

  // ── 화면 표시: 알림 · 누르거나 채우는 곳을 잠깐 비춤 ──
  var toastEl = null, toastTimer = null, ringEl = null, ringTimer = null;
  function toast(text) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.setAttribute("role", "status");
      toastEl.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:8px 12px;border-radius:10px;" +
        "background:rgba(6,20,30,.92);color:#bff6ff;font:13px/1.4 system-ui,sans-serif;border:1px solid rgba(80,220,255,.5);pointer-events:none;transition:opacity .3s";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = "0"; }, 1600);
  }
  function spotlight(el) {
    if (!document.body || !el.getBoundingClientRect) return;
    if (!ringEl) {
      ringEl = document.createElement("div");
      ringEl.setAttribute("aria-hidden", "true");
      ringEl.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #6ad9f5;border-radius:10px;" +
        "box-shadow:0 0 0 4px rgba(106,217,245,.25),0 0 18px rgba(106,217,245,.7);transition:all .25s ease;opacity:0";
      document.body.appendChild(ringEl);
    }
    var r = el.getBoundingClientRect();
    ringEl.style.left = (r.left - 4) + "px"; ringEl.style.top = (r.top - 4) + "px";
    ringEl.style.width = (r.width + 8) + "px"; ringEl.style.height = (r.height + 8) + "px"; ringEl.style.opacity = "1";
    clearTimeout(ringTimer);
    ringTimer = setTimeout(function () { ringEl.style.opacity = "0"; }, 1200);
  }

  function needConfirm(message) { var e = new Error(message || "비서ON 화면에서 확인이 필요합니다"); e.code = "NEEDS_CONFIRM"; throw e; }
  function refuse(message) { var e = new Error(message); e.code = "NOT_ALLOWED"; throw e; }
  function textOf(el) { return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); }
  function norm(s) { return String(s || "").replace(/\s+/g, "").toLowerCase(); }
  function findAction(label) {
    var want = norm(label);
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-bisheon]"));
    return els.find(function (el) { return norm(el.getAttribute("data-bisheon")) === want; }) ||
      els.find(function (el) { return norm(el.getAttribute("data-bisheon")).indexOf(want) >= 0; });
  }
  function fieldHay(el) {
    var lab = el.id ? document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]') : null;
    var wrap = el.closest && el.closest("label");
    return [el.getAttribute("data-bisheon-field"), el.getAttribute("name"), el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("title"), lab && textOf(lab), wrap && textOf(wrap)].join(" ");
  }
  function findField(name) {
    var want = norm(name);
    var els = Array.prototype.slice.call(document.querySelectorAll("input,textarea,select,[contenteditable=true]"));
    return els.find(function (el) { return norm(el.getAttribute("data-bisheon-field")) === want; }) ||
      els.find(function (el) { return want && norm(fieldHay(el)).indexOf(want) >= 0; });
  }
  function setValue(el, v) {
    if (el.isContentEditable) { el.textContent = v; el.dispatchEvent(new Event("input", { bubbles: true })); return; }
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set; // React 등 제어 컴포넌트에도 반영
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ── 전체 제어: 화면 요소에 번호(e1, e2 …)를 붙여 읽고, 번호나 글자로 누르고 채움 ──
  var INTERACTIVE = "a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=option],[contenteditable=true],[onclick]";
  var refSeq = 0;
  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  }
  function inView(el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth; }
  function refOf(el) { var r = el.getAttribute("data-bisheon-ref"); if (!r) { r = "e" + (++refSeq); el.setAttribute("data-bisheon-ref", r); } return r; }
  function isField(el) { return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable; }
  function kindOf(el) {
    var t = (el.getAttribute("type") || "").toLowerCase(), role = el.getAttribute("role");
    if (el.tagName === "A" || role === "link") return "link";
    if (el.tagName === "SELECT") return "select";
    if (el.tagName === "TEXTAREA" || el.isContentEditable) return "textarea";
    if (el.tagName === "INPUT") {
      if (t === "checkbox" || t === "radio") return t;
      if (t === "submit" || t === "button" || t === "reset" || t === "image") return "button";
      return t === "search" ? "search" : "input";
    }
    if (role === "checkbox" || role === "switch") return "checkbox";
    if (role === "tab") return "tab";
    return "button";
  }
  function labelOf(el) {
    var s = el.getAttribute("aria-label") || el.getAttribute("data-bisheon") || "";
    if (!s && isField(el)) {
      var lab = el.id ? document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]') : null;
      s = el.getAttribute("data-bisheon-field") || (lab && textOf(lab)) || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || "";
    }
    if (!s) s = textOf(el);
    if (!s && el.value && el.tagName === "INPUT") s = el.value;
    if (!s) { var img = el.querySelector && el.querySelector("img[alt],svg[aria-label]"); s = img ? (img.getAttribute("alt") || img.getAttribute("aria-label")) : ""; }
    if (!s) s = el.getAttribute("title") || "";
    return s.replace(/\s+/g, " ").trim().slice(0, 60);
  }
  function secretField(el) {
    var t = (el.getAttribute("type") || "").toLowerCase(), ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    return t === "password" || t === "hidden" || t === "file" || /^cc-|card|one-time-code/.test(ac) || /비밀번호|password|카드번호|cvc|cvv/i.test(fieldHay(el));
  }
  function searchForm(form) {
    if (!form) return false;
    return form.getAttribute("role") === "search" || /search|검색/i.test((form.getAttribute("action") || "") + " " + (form.getAttribute("aria-label") || "")) || !!form.querySelector("input[type=search]");
  }
  function externalLink(el) {
    var a = el.closest && el.closest("a[href]");
    if (!a) return false;
    try { var u = new URL(a.getAttribute("href"), location.href); return u.origin !== location.origin && /^https?:$/.test(u.protocol); } catch (e) { return false; }
  }
  /** never: 누르지 않음, record: 사람 확인, external: 다른 사이트, ui: 바로 */
  function riskOf(el) {
    var hay = labelOf(el) + " " + (el.getAttribute("name") || "") + " " + (el.id || "") + " " + (el.getAttribute("href") || "");
    if (NEVER.test(hay)) return "never";
    var t = (el.getAttribute("type") || "").toLowerCase();
    var submits = (el.tagName === "BUTTON" && (t === "" || t === "submit") && el.form) || (el.tagName === "INPUT" && (t === "submit" || t === "image"));
    if (submits && !searchForm(el.form)) return "record";
    if (RECORD.test(hay)) return "record";
    if (externalLink(el)) return "external";
    return "ui";
  }
  function elements() {
    var all = Array.prototype.slice.call(document.querySelectorAll(INTERACTIVE)).filter(function (el) {
      return visible(el) && !(el.closest && el.closest("[data-bisheon-ignore],[aria-hidden=true]")) && !el.disabled;
    });
    var seen = new Set();
    return all.filter(function (el) { // 버튼 안의 링크처럼 겹친 것은 바깥 것만
      for (var p = el.parentElement; p; p = p.parentElement) if (seen.has(p)) return false;
      seen.add(el); return true;
    });
  }
  function describe(el) {
    var k = kindOf(el), o = { ref: refOf(el), kind: k, label: labelOf(el), risk: riskOf(el) };
    if (!inView(el)) o.offscreen = true;
    if (k === "link") { try { o.href = new URL(el.getAttribute("href"), location.href).pathname; } catch (e) { /* 무시 */ } }
    if (isField(el)) {
      if (secretField(el)) { o.risk = "never"; o.secret = true; }
      else if (k === "checkbox" || k === "radio") o.checked = !!el.checked;
      else if (k === "select") { o.value = el.value; o.options = Array.prototype.slice.call(el.options).slice(0, 12).map(function (x) { return x.text.trim().slice(0, 30); }); }
      else o.value = String(el.value != null ? el.value : textOf(el)).slice(0, 60);
    }
    return o;
  }
  function find(target, wantField) {
    var s = String(target == null ? "" : target).trim();
    if (/^e\d+$/.test(s)) {
      var byRef = document.querySelector('[data-bisheon-ref="' + s + '"]');
      if (byRef && visible(byRef)) return byRef;
    }
    var want = norm(s);
    if (!want) return null;
    var els = elements().filter(function (el) { return wantField ? isField(el) && kindOf(el) !== "button" : true; });
    var score = function (el) {
      var l = norm(labelOf(el));
      if (l === want) return 3;
      if (l.indexOf(want) >= 0) return 2 + (inView(el) ? 0.5 : 0);
      if (want.indexOf(l) >= 0 && l.length >= 2) return 1;
      return 0;
    };
    var best = null, bestS = 0;
    els.forEach(function (el) { var sc = score(el); if (sc > bestS) { best = el; bestS = sc; } });
    return best || (wantField ? findField(s) : null);
  }
  var KIND_KO = { link: "링크", button: "버튼", tab: "탭", checkbox: "체크박스", radio: "선택 단추", select: "선택 목록", input: "입력칸", search: "검색창", textarea: "입력칸" };
  function guard(el, ctx, verb) {
    var r = riskOf(el), name = "'" + (labelOf(el) || KIND_KO[kindOf(el)]) + "'";
    if (r === "never" || (isField(el) && secretField(el))) refuse(name + " 은(는) 비서ON 이 " + verb + "지 않습니다 (삭제·결제·비밀번호 등). 직접 해 주세요.");
    if (r === "external") refuse(name + " 은(는) 다른 사이트로 나가는 링크라 누르지 않습니다.");
    if (r === "record" && !ctx.confirmed) needConfirm(name + " " + KIND_KO[kindOf(el)] + "을 누릅니다 — 저장·게시·제출·로그인처럼 기록이 남을 수 있습니다.");
  }

  // ── 기본 명령 (앱이 같은 이름으로 다시 등록하면 앱 것이 우선) ──
  register("navigate", { description: "같은 사이트 안의 경로로 이동", params: { path: "string" }, phrases: ["페이지로 이동", "이동해"], risk: "ui",
    run: function (a) { var p = String(a.path || "/"); if (p.charAt(0) !== "/" || p.indexOf("//") === 0) throw new Error("같은 사이트 경로(/로 시작)만 됩니다"); location.assign(p); return { path: p }; } });
  register("back", { description: "뒤로 가기", params: {}, phrases: ["뒤로"], risk: "ui", run: function () { history.back(); return {}; } });
  register("reload", { description: "새로고침", params: {}, phrases: ["새로고침"], risk: "ui", run: function () { setTimeout(function () { location.reload(); }, 80); return {}; } });
  register("scroll", { description: "스크롤", params: { direction: "string" }, phrases: ["스크롤", "내려", "올려", "맨 위", "맨 아래"], risk: "ui",
    run: function (a) {
      var d = String(a.direction || "down"), el = document.scrollingElement || document.documentElement, h = window.innerHeight * 0.8;
      if (d === "top") el.scrollTo({ top: 0, behavior: "smooth" });
      else if (d === "bottom") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      else el.scrollBy({ top: d === "up" ? -h : h, behavior: "smooth" });
      return { direction: d };
    } });

  if (!FULL) {
    register("read_page", { description: "지금 화면의 제목·소제목·본문 앞부분 읽기", params: {}, phrases: ["읽어", "요약", "무슨 내용"], risk: "read",
      run: function () {
        var main = document.querySelector("main") || document.body;
        var hs = Array.prototype.slice.call(document.querySelectorAll("h1,h2,h3")).slice(0, 12).map(textOf).filter(Boolean).map(function (s) { return s.slice(0, 80); });
        var acts = Array.prototype.slice.call(document.querySelectorAll("[data-bisheon]")).slice(0, 30).map(function (el) { return el.getAttribute("data-bisheon"); });
        return { title: document.title, path: location.pathname, headings: hs, actions: acts, text: textOf(main).slice(0, 3000) };
      } });
    register("click", { description: "data-bisheon 이름표가 붙은 버튼 누르기", params: { label: "string" }, phrases: ["눌러", "클릭"], risk: "ui",
      run: function (a, ctx) {
        var el = findAction(a.label);
        if (!el) throw new Error("그 이름표의 버튼이 없습니다: " + a.label);
        if (el.getAttribute("data-bisheon-risk") === "write" && !ctx.confirmed) needConfirm();
        el.click();
        return { clicked: el.getAttribute("data-bisheon") };
      } });
    register("fill", { description: "입력칸 채우기 (data-bisheon-field, 라벨, placeholder 로 찾음)", params: { field: "string", value: "string" }, phrases: ["입력해", "적어 줘"], risk: "ui",
      run: function (a) { var el = findField(a.field); if (!el) throw new Error("입력칸을 찾지 못했습니다: " + a.field); el.focus(); setValue(el, String(a.value == null ? "" : a.value)); return { field: a.field }; } });
  } else {
    register("read_page", { description: "지금 화면 읽기: 제목·소제목·본문 + 누를 수 있는 버튼·링크·입력칸 목록(번호 e1, e2…)", params: {}, phrases: ["읽어", "요약", "무슨 내용", "뭐가 있어"], risk: "read",
      run: function () {
        var main = document.querySelector("main") || document.body;
        var hs = Array.prototype.slice.call(document.querySelectorAll("h1,h2,h3")).filter(visible).slice(0, 14).map(textOf).filter(Boolean).map(function (s) { return s.slice(0, 80); });
        var els = elements().map(describe).filter(function (o) { return o.label || o.kind !== "button"; });
        els.sort(function (a, b) { return (a.offscreen ? 1 : 0) - (b.offscreen ? 1 : 0); }); // 지금 보이는 것 먼저
        return { title: document.title, path: location.pathname, headings: hs, elements: els.slice(0, 80), total: els.length, text: textOf(main).slice(0, 2500) };
      } });
    register("click", { description: "화면의 버튼·링크·탭 누르기. target 은 read_page 번호(e12) 또는 보이는 글자", params: { target: "string" }, phrases: ["눌러", "클릭", "들어가", "열어"], risk: "ui",
      run: function (a, ctx) {
        var el = find(a.target, false);
        if (!el) throw new Error("화면에서 찾지 못했습니다: " + a.target + " (read_page 로 번호를 확인해 주세요)");
        guard(el, ctx, "누르");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        spotlight(el);
        var label = labelOf(el);
        setTimeout(function () { el.click(); helloSoon(); }, 260);
        return { clicked: label, ref: refOf(el), kind: kindOf(el) };
      } });
    register("fill", { description: "입력칸 채우기. target 은 번호(e3) 또는 칸 이름, enter 가 true 면 입력 후 Enter (검색창은 바로, 다른 폼은 확인 필요)", params: { target: "string", value: "string", enter: "boolean" }, phrases: ["입력해", "적어 줘", "써 줘", "검색해"], risk: "ui",
      run: function (a, ctx) {
        var el = find(a.target, true);
        if (!el || !isField(el)) throw new Error("입력칸을 찾지 못했습니다: " + a.target);
        guard(el, { confirmed: true }, "채우"); // 채우기 자체는 되돌릴 수 있음 (삭제·비밀번호 칸만 막음)
        if (a.enter === true && el.form && !searchForm(el.form) && kindOf(el) !== "search" && !ctx.confirmed) needConfirm("'" + labelOf(el) + "' 칸을 채우고 Enter 로 폼을 제출합니다.");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        spotlight(el);
        el.focus();
        var v = a.value == null ? "" : String(a.value), k = kindOf(el);
        if (k === "checkbox" || k === "radio") { var want = !/^(false|0|off|아니|해제|끄)/i.test(v); if (!!el.checked !== want) el.click(); }
        else if (k === "select") {
          var opt = Array.prototype.slice.call(el.options).find(function (o) { return norm(o.text) === norm(v) || o.value === v; }) ||
            Array.prototype.slice.call(el.options).find(function (o) { return norm(o.text).indexOf(norm(v)) >= 0; });
          if (!opt) throw new Error("선택지에 없습니다: " + v);
          setValue(el, opt.value);
        } else setValue(el, v.slice(0, 5000));
        if (a.enter === true) {
          ["keydown", "keypress", "keyup"].forEach(function (t) { el.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true })); });
          if (el.form && typeof el.form.requestSubmit === "function") el.form.requestSubmit();
        }
        helloSoon();
        return { filled: labelOf(el), ref: refOf(el), enter: a.enter === true };
      } });
    register("scroll_to", { description: "요소가 보이게 스크롤 (번호 또는 글자)", params: { target: "string" }, phrases: ["보여 줘", "찾아가"], risk: "ui",
      run: function (a) {
        var el = find(a.target, false);
        if (!el) { var want = norm(a.target); el = Array.prototype.slice.call(document.querySelectorAll("h1,h2,h3,h4,p,li,section")).find(function (x) { return norm(textOf(x)).indexOf(want) >= 0; }); }
        if (!el) throw new Error("화면에서 찾지 못했습니다: " + a.target);
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        spotlight(el);
        return { shown: (labelOf(el) || textOf(el)).slice(0, 60) };
      } });
  }

  function safe(r) {
    try {
      var s = JSON.stringify(r === undefined ? null : r);
      return s.length > 20000 ? { truncated: true, text: s.slice(0, 20000) } : JSON.parse(s);
    } catch (e) { return { note: "직렬화할 수 없는 결과" }; }
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.__bisheon !== 1 || typeof d.type !== "string") return;
    if (ALLOW.indexOf(e.origin) < 0 || e.source !== host()) return;
    hostOrigin = e.origin;
    if (d.type === "ping") { hello(); return; }
    if (d.type !== "call") return;
    var reply = function (ok, data) { post({ type: "result", id: d.id, ok: ok, result: ok ? data : undefined, error: ok ? undefined : data }, e.origin); };
    var c = commands[d.command];
    if (!c) return reply(false, { code: "UNKNOWN_COMMAND", message: "등록되지 않은 명령: " + d.command });
    if (c.risk === "write" && d.confirmed !== true) return reply(false, { code: "NEEDS_CONFIRM", message: "비서ON 화면에서 확인이 필요합니다" });
    toast("🤖 비서ON · " + (c.description || d.command).split(".")[0].slice(0, 40));
    Promise.resolve()
      .then(function () { return c.run(d.args && typeof d.args === "object" ? d.args : {}, { confirmed: d.confirmed === true, needConfirm: needConfirm }); })
      .then(function (r) { reply(true, safe(r)); }, function (err) { reply(false, { code: (err && err.code) || "COMMAND_FAILED", message: String((err && err.message) || err).slice(0, 300) }); });
  });

  // SPA 화면 이동 시 제목·주소 갱신
  ["pushState", "replaceState"].forEach(function (k) {
    var orig = history[k];
    history[k] = function () { var r = orig.apply(this, arguments); helloSoon(); return r; };
  });
  window.addEventListener("popstate", helloSoon);

  window.BisheonBridge = { version: 2, app: APP, control: FULL ? "full" : "basic", register: register, hello: hello, commands: list };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", helloSoon); else helloSoon();
})();
