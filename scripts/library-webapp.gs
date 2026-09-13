/**
 * 25WORLD 자료실 — Google Drive 연동 Apps Script 웹앱
 *
 * 왜 Apps Script 인가:
 *   이 스크립트는 "나(소유자) 권한으로" 실행되므로 서비스 계정처럼 저장용량
 *   문제(Service Accounts do not have storage quota)가 없고, GCP OAuth 설정 없이
 *   내 구글 드라이브 폴더에 바로 파일을 만들 수 있다.
 *
 * 배포 방법 (한 번만):
 *   1) https://script.google.com → 새 프로젝트 → 이 파일 내용을 통째로 붙여넣기
 *   2) 프로젝트 설정(⚙️) → 스크립트 속성에 두 값을 넣는다 (코드에는 절대 적지 않는다)
 *        · ADMIN_KEY     — 사이트 관리자 모드의 "아이디:비밀번호" 와 같은 값
 *        · SERVER_SECRET — tg-post-saver(Render) 환경변수 LIBRARY_SERVER_SECRET 과 같은 값
 *   3) 배포 → 새 배포 → 유형: 웹 앱
 *        · 실행: 나(herhero78@gmail.com)
 *        · 액세스 권한: 모든 사용자
 *   4) 발급된 /exec URL 을 사이트 자료실 섹션(관리자 모드)에 붙여넣으면 끝
 *
 * 코드를 고친 뒤에는 반드시 "새 배포"(또는 기존 배포 버전 변경)를 해야 반영된다.
 *
 * 2026-09-13 — 관리자 키를 코드에서 뺐다. 이 저장소가 공개라 코드에 적힌 키를 누구나
 * 볼 수 있었고, 그 키로 action:'token' 을 부르면 소유자 드라이브 토큰까지 받을 수 있었다.
 */

// 자료를 보관할 구글 드라이브 폴더
const FOLDER_ID = '1HlcB_X5WEiuEOqZ-pHwmflYLRpidoFmz';

/** 스크립트 속성에 둔 비밀값. 없으면 '' — 호출부는 빈 값과 절대 일치시키지 않는다. */
function secret_(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || '');
}

// 폴백(base64) 업로드의 최대 크기.
// 큰 파일은 브라우저 → 구글 드라이브 직접 업로드(resumable)를 쓰므로 이 값에 걸리지 않는다.
const MAX_UPLOAD_MB = 30;

// 25world Firebase 웹 API 키 — 로그인 토큰(ID token) 검증용. 공개되어도 안전한 값이다.
const FIREBASE_API_KEY = 'AIzaSyCuog0TdR371MNDKreqk9_4w7yrTIfa8qA';

// 유료회원 이상만 받을 수 있는 기본 확장자 (관리자가 파일별로 덮어쓸 수 있다)
const VIP_EXT = /\.(zip|7z|rar)$/i;

/** 관리자가 파일별로 지정한 VIP 오버라이드 맵 {fileId: true|false} (스크립트 속성에 보관) */
function vipMap_() {
  const raw = PropertiesService.getScriptProperties().getProperty('VIP_FILES');
  try {
    return JSON.parse(raw || '{}');
  } catch (err) {
    return {};
  }
}

/** 이 파일이 VIP(유료 전용)인가 — 관리자 오버라이드가 있으면 그것을, 없으면 확장자 기본값 */
function isVipFile_(id, name) {
  const m = vipMap_();
  if (Object.prototype.hasOwnProperty.call(m, id)) return m[id] === true;
  return VIP_EXT.test(name);
}

/** 관리자가 파일별로 지정한 한시적 무료 기간 맵
 *  {fileId: {start: 'YYYY-MM-DD', end: 'YYYY-MM-DD'}} (스크립트 속성에 보관) */
function freeWindowMap_() {
  const raw = PropertiesService.getScriptProperties().getProperty('FREE_WINDOWS');
  try {
    return JSON.parse(raw || '{}');
  } catch (err) {
    return {};
  }
}

/** 지금이 무료 기간 안인가 — 날짜는 한국시간 기준, 종료일은 그날 23:59:59 까지 포함.
 *  판정을 서버 시계로 하는 이유: 회원이 브라우저 시계를 바꿔도 기간을 늘릴 수 없다. */
function inFreeWindow_(w, now) {
  if (!w || !w.start || !w.end) return false;
  const start = new Date(w.start + 'T00:00:00+09:00').getTime();
  const end = new Date(w.end + 'T23:59:59.999+09:00').getTime();
  const t = now || Date.now();
  return t >= start && t <= end;
}

/** 다운로드 허용 이메일 목록 (관리자가 사이트에서 동기화 → 스크립트 속성에 보관).
 *  Firestore 가 아니라 여기에 두는 이유: 회원이 브라우저에서 자기 등급을 조작해도
 *  이 목록은 바꿀 수 없다. 진짜 판단 근거는 항상 서버에 있어야 한다. */
function paidEmails_() {
  const raw = PropertiesService.getScriptProperties().getProperty('PAID_EMAILS');
  try {
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

/** 다운로드 허용 회원 ID(uid) 목록 — 이메일이 없는 카카오 유료회원 판정용 */
function paidUids_() {
  const raw = PropertiesService.getScriptProperties().getProperty('PAID_UIDS');
  try {
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

/** 유료회원 이상인가 — 이메일 또는 회원 ID 가 동기화된 목록에 있으면 */
function isPaid_(who) {
  if (who.email && paidEmails_().indexOf(who.email) !== -1) return true;
  return paidUids_().indexOf(who.uid) !== -1;
}

/** Firebase ID 토큰 검증 → { email, uid } (실패 시 null).
 *  구글 Identity Toolkit 에 직접 물어보므로 위조 토큰은 통과할 수 없다.
 *  email 은 빈 문자열일 수 있다 — 카카오 로그인 회원은 로그인 기록에 이메일이 없다.
 *  (예전에는 이메일이 없으면 null 을 돌려줘, 카카오 회원이 전부 login-required 로 막혔다) */
function verifyIdToken_(idToken) {
  if (!idToken) return null;
  const res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
      FIREBASE_API_KEY,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true,
    }
  );
  if (res.getResponseCode() !== 200) return null;
  const users = (JSON.parse(res.getContentText()).users || [])[0];
  if (!users || !users.localId) return null;
  return {
    email: users.email ? String(users.email).toLowerCase() : '',
    uid: String(users.localId),
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function folder_() {
  return DriveApp.getFolderById(FOLDER_ID);
}

/** 이 파일이 자료실 폴더 안에 있는가 (폴더 밖 파일 요청 차단용) */
function inLibraryFolder_(file) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === FOLDER_ID) return true;
  }
  return false;
}

/** 폴더 안의 파일 목록 (최신순) */
function listFiles_() {
  const it = folder_().getFiles();
  const windows = freeWindowMap_(); // 파일마다 속성을 다시 읽지 않도록 한 번만
  const now = Date.now();
  const out = [];
  while (it.hasNext()) {
    const f = it.next();
    const w = windows[f.getId()] || null;
    out.push({
      id: f.getId(),
      name: f.getName(),
      size: f.getSize(),
      mimeType: f.getMimeType(),
      desc: f.getDescription() || '',
      updatedAt: f.getLastUpdated().toISOString(),
      vip: isVipFile_(f.getId(), f.getName()),
      freeStart: w ? w.start : '',
      freeEnd: w ? w.end : '',
      freeNow: inFreeWindow_(w, now),
      // 다운로드 링크는 목록에 싣지 않는다 — action:'download' 로 신원을 검증한 뒤에만 내준다
      viewUrl: f.getUrl(),
    });
  }
  out.sort(function (a, b) {
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return out;
}

function doGet(e) {
  const type = (e && e.parameter && e.parameter.type) || 'list';
  try {
    if (type === 'list') return json_({ ok: true, files: listFiles_() });
    if (type === 'ping') return json_({ ok: true, folder: folder_().getName() });
    return json_({ ok: false, error: 'unknown type: ' + type });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const adminKey = secret_('ADMIN_KEY');
    const isAdmin = !!adminKey && String(body.adminKey || '') === adminKey;

    /** 이 요청자가 이 파일을 받을 수 있는가 → { ok, file, who } 또는 { ok:false, error } */
    function checkAccess_(id) {
      const file = DriveApp.getFileById(id);
      // 자료실 폴더 밖의 파일 id 를 넣어 내 드라이브 전체를 긁는 것을 막는다
      if (!inLibraryFolder_(file)) return { ok: false, error: 'not-in-library' };
      if (isAdmin) return { ok: true, file: file, who: null };

      const who = verifyIdToken_(body.idToken);
      if (!who) return { ok: false, error: 'login-required' };

      // 한시적 무료 기간 안이면 등급과 무관하게 받을 수 있다 (로그인은 여전히 필요)
      const freeNow = inFreeWindow_(freeWindowMap_()[id], Date.now());
      if (!freeNow && isVipFile_(id, file.getName()) && !isPaid_(who)) {
        return { ok: false, error: 'paid-only' };
      }
      return { ok: true, file: file, who: who };
    }

    // ── 서버 전용: 다운로드 허가 (tg-post-saver 가 호출) ─────────
    // 판정을 통과하면 소유자 OAuth 토큰을 돌려준다. 서버는 이 토큰으로 드라이브에서
    // 파일을 받아 회원에게 흘려보낸다. 토큰은 드라이브 전체 권한이므로 SERVER_SECRET 을
    // 아는 서버에게만 주고, 회원 브라우저로는 절대 나가지 않는다.
    if (body.action === 'authorize') {
      const serverSecret = secret_('SERVER_SECRET');
      if (!serverSecret || String(body.serverSecret || '') !== serverSecret) {
        return json_({ ok: false, error: 'unauthorized' });
      }
      const r = checkAccess_(String(body.id || ''));
      if (!r.ok) return json_(r);
      return json_({
        ok: true,
        token: ScriptApp.getOAuthToken(),
        name: r.file.getName(),
        mimeType: r.file.getMimeType(),
        size: r.file.getSize(),
      });
    }

    // ── 회원용 (예전 방식 — 호환용으로만 남김) ────────────────
    // 회원 이메일에 드라이브 보기 권한을 주고 드라이브 링크를 연다. 이메일이 없는 카카오
    // 회원은 권한을 줄 수 없어 받을 수 없다. 사이트는 이제 위의 authorize 경로를 쓴다.
    if (body.action === 'download') {
      const id = String(body.id || '');
      const r = checkAccess_(id);
      if (!r.ok) return json_(r);
      const url = 'https://drive.google.com/uc?export=download&id=' + id;
      if (r.who) {
        if (!r.who.email) return json_({ ok: false, error: 'email-required' });
        r.file.addViewer(r.who.email); // 이미 있으면 그대로 (알림 메일 없음)
      }
      return json_({ ok: true, url: url });
    }

    // ── 여기부터 관리자 전용 ──────────────────────────────
    if (!isAdmin) return json_({ ok: false, error: 'unauthorized' });

    // 유료회원 목록 동기화 (사이트 관리자 화면에서 호출) — 이메일 + 회원 ID(uid).
    // uid 는 이메일이 없는 카카오 유료회원을 판정하는 데 쓴다.
    if (body.action === 'syncPaid') {
      const clean = function (arr, lower) {
        return (arr || [])
          .map(function (x) {
            const s = String(x).trim();
            return lower ? s.toLowerCase() : s;
          })
          .filter(function (x) {
            return x;
          });
      };
      const emails = clean(body.emails, true);
      const uids = clean(body.uids, false);
      const props = PropertiesService.getScriptProperties();
      props.setProperty('PAID_EMAILS', JSON.stringify(emails));
      props.setProperty('PAID_UIDS', JSON.stringify(uids));
      return json_({ ok: true, count: Math.max(emails.length, uids.length) });
    }

    // 파일별 VIP 지정/해제 (확장자 기본값을 덮어쓴다)
    if (body.action === 'setVip') {
      const id = String(body.id || '');
      if (!id) return json_({ ok: false, error: 'id required' });
      const m = vipMap_();
      m[id] = body.vip === true;
      PropertiesService.getScriptProperties().setProperty(
        'VIP_FILES',
        JSON.stringify(m)
      );
      return json_({ ok: true });
    }

    // 한시적 무료 기간 설정/해제.
    // 기간을 두면 그 파일은 VIP 로 지정된다 — 기간 안에는 모두, 기간 밖(시작 전·종료 후)에는
    // 유료회원 이상만 받을 수 있게 되어, 종료일이 지나면 저절로 유료 전용으로 돌아간다.
    // start/end 를 둘 다 비우면 기간만 해제한다 (VIP 지정은 그대로 둔다).
    if (body.action === 'setFreeWindow') {
      const id = String(body.id || '');
      if (!id) return json_({ ok: false, error: 'id required' });
      const start = String(body.start || '').trim();
      const end = String(body.end || '').trim();
      const props = PropertiesService.getScriptProperties();
      const windows = freeWindowMap_();

      if (!start && !end) {
        delete windows[id];
      } else {
        const re = /^\d{4}-\d{2}-\d{2}$/;
        // 형식만 보면 2026-02-31 이 통과한다 (V8 이 3/3 으로 넘겨버림).
        // 파싱한 시각을 한국시간 날짜로 되돌려 입력과 같은지까지 확인한다.
        const valid = function (s) {
          if (!re.test(s)) return false;
          const t = new Date(s + 'T00:00:00+09:00').getTime();
          return !isNaN(t) && new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10) === s;
        };
        if (!valid(start) || !valid(end)) return json_({ ok: false, error: 'bad-date' });
        if (start > end) return json_({ ok: false, error: 'bad-range' });
        windows[id] = { start: start, end: end };

        const m = vipMap_();
        m[id] = true;
        props.setProperty('VIP_FILES', JSON.stringify(m));
      }
      props.setProperty('FREE_WINDOWS', JSON.stringify(windows));
      return json_({ ok: true, freeNow: inFreeWindow_(windows[id], Date.now()) });
    }

    // 지금까지 부여된 열람 권한을 모두 회수 (등급이 내려간 사람 정리용)
    if (body.action === 'revokeAll') {
      const it = folder_().getFiles();
      let n = 0;
      while (it.hasNext()) {
        const f = it.next();
        f.getViewers().forEach(function (v) {
          f.removeViewer(v);
          n++;
        });
      }
      return json_({ ok: true, revoked: n });
    }

    if (body.action === 'verify') return json_({ ok: true });

    // 대용량 업로드용 1회성 토큰.
    // 관리자 브라우저가 이 토큰으로 구글 드라이브에 파일을 직접(resumable) 올린다.
    // → Apps Script 요청 본문 한도(base64)를 우회하므로 GB 단위도 가능.
    // 토큰은 이 스크립트 소유자 권한이고 약 1시간 뒤 만료된다.
    if (body.action === 'token') {
      return json_({
        ok: true,
        token: ScriptApp.getOAuthToken(),
        folderId: FOLDER_ID,
      });
    }

    if (body.action === 'upload') {
      const name = String(body.name || '').trim();
      if (!name) return json_({ ok: false, error: 'name required' });
      const bytes = Utilities.base64Decode(String(body.data || ''));
      if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024) {
        return json_({ ok: false, error: MAX_UPLOAD_MB + 'MB 를 넘는 파일입니다.' });
      }
      const blob = Utilities.newBlob(
        bytes,
        body.mimeType || 'application/octet-stream',
        name
      );
      // 폴더의 공유 설정을 상속한다 (여기서 setSharing 을 하지 않는 이유:
      // 나중에 폴더를 비공개로 바꿔도 파일만 공개로 남는 사고를 막기 위함)
      const f = folder_().createFile(blob);
      if (body.desc) f.setDescription(String(body.desc));
      return json_({ ok: true, id: f.getId() });
    }

    if (body.action === 'delete') {
      const id = String(body.id || '');
      if (!id) return json_({ ok: false, error: 'id required' });
      DriveApp.getFileById(id).setTrashed(true); // 휴지통으로 (복구 가능)
      return json_({ ok: true });
    }

    if (body.action === 'rename') {
      DriveApp.getFileById(String(body.id)).setName(String(body.name));
      return json_({ ok: true });
    }

    return json_({ ok: false, error: 'unknown action: ' + body.action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
