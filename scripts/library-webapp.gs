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
 *   2) 아래 FOLDER_ID / ADMIN_KEY 확인
 *   3) 배포 → 새 배포 → 유형: 웹 앱
 *        · 실행: 나(herhero78@gmail.com)
 *        · 액세스 권한: 모든 사용자
 *   4) 발급된 /exec URL 을 사이트 자료실 섹션(관리자 모드)에 붙여넣으면 끝
 *
 * 코드를 고친 뒤에는 반드시 "새 배포"(또는 기존 배포 버전 변경)를 해야 반영된다.
 */

// 자료를 보관할 구글 드라이브 폴더
const FOLDER_ID = '1HlcB_X5WEiuEOqZ-pHwmflYLRpidoFmz';

// 업로드/삭제에 필요한 관리자 키 — 사이트 관리자 모드의 "아이디:비밀번호" 와 같아야 한다
const ADMIN_KEY = 'admin:2525';

// 폴백(base64) 업로드의 최대 크기.
// 큰 파일은 브라우저 → 구글 드라이브 직접 업로드(resumable)를 쓰므로 이 값에 걸리지 않는다.
const MAX_UPLOAD_MB = 30;

// 25world Firebase 웹 API 키 — 로그인 토큰(ID token) 검증용. 공개되어도 안전한 값이다.
const FIREBASE_API_KEY = 'AIzaSyCuog0TdR371MNDKreqk9_4w7yrTIfa8qA';

// 유료회원 이상만 받을 수 있는 확장자
const VIP_EXT = /\.(zip|7z|rar)$/i;

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

/** Firebase ID 토큰 검증 → { email, uid } (실패 시 null).
 *  구글 Identity Toolkit 에 직접 물어보므로 위조 토큰은 통과할 수 없다. */
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
  if (!users || !users.email) return null;
  return { email: String(users.email).toLowerCase(), uid: users.localId };
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
  const out = [];
  while (it.hasNext()) {
    const f = it.next();
    out.push({
      id: f.getId(),
      name: f.getName(),
      size: f.getSize(),
      mimeType: f.getMimeType(),
      desc: f.getDescription() || '',
      updatedAt: f.getLastUpdated().toISOString(),
      vip: VIP_EXT.test(f.getName()),
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
    const isAdmin = String(body.adminKey || '') === ADMIN_KEY;

    // ── 회원용 액션 ────────────────────────────────────────
    // 다운로드: 로그인 토큰을 서버에서 검증하고, 압축파일이면 유료 목록까지 대조한 뒤
    // 그 사람 계정에만 열람 권한을 준다. 폴더를 "제한됨"으로 두면 이 경로 외에는
    // 파일을 받을 방법이 없다.
    if (body.action === 'download') {
      const id = String(body.id || '');
      const file = DriveApp.getFileById(id);

      // 자료실 폴더 밖의 파일 id 를 넣어 내 드라이브 전체를 긁는 것을 막는다
      if (!inLibraryFolder_(file)) {
        return json_({ ok: false, error: 'not-in-library' });
      }
      const url = 'https://drive.google.com/uc?export=download&id=' + id;

      if (isAdmin) return json_({ ok: true, url: url });

      const who = verifyIdToken_(body.idToken);
      if (!who) return json_({ ok: false, error: 'login-required' });

      if (VIP_EXT.test(file.getName()) && paidEmails_().indexOf(who.email) === -1) {
        return json_({ ok: false, error: 'paid-only' });
      }

      file.addViewer(who.email); // 이미 있으면 그대로 (알림 메일 없음)
      return json_({ ok: true, url: url });
    }

    // ── 여기부터 관리자 전용 ──────────────────────────────
    if (!isAdmin) return json_({ ok: false, error: 'unauthorized' });

    // 유료회원 이메일 목록 동기화 (사이트 관리자 화면에서 호출)
    if (body.action === 'syncPaid') {
      const list = (body.emails || []).map(function (x) {
        return String(x).trim().toLowerCase();
      });
      PropertiesService.getScriptProperties().setProperty(
        'PAID_EMAILS',
        JSON.stringify(list)
      );
      return json_({ ok: true, count: list.length });
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
