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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function folder_() {
  return DriveApp.getFolderById(FOLDER_ID);
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
      // 브라우저에서 바로 내려받는 링크 (폴더의 공유 설정을 그대로 따른다)
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + f.getId(),
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

    // 업로드·삭제는 관리자만 (일반/유료/VIP 회원은 조회·다운로드만 가능)
    if (String(body.adminKey || '') !== ADMIN_KEY) {
      return json_({ ok: false, error: 'unauthorized' });
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
