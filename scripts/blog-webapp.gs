/**
 * 25WORLD 블로그 + 동적 사이트 — Google Sheets 연동 Apps Script 웹앱
 *
 * 시트 구조:
 *   posts 탭 — id | title | savedAt | from | chatId | file
 *   sites 탭 — id | cat | name | desc | url
 *
 * 배포 방법:
 *   1) https://script.google.com → 이 프로젝트(Code.gs) → 이 파일 내용을 통째로 붙여넣기
 *   2) 배포 → 배포 관리 → 기존 배포 수정(연필 아이콘) → 새 버전으로 배포
 *      (반드시 "새 배포"가 아니라 기존 배포의 버전을 올려야 /exec URL 이 그대로 유지된다)
 *
 * 2026-08-04 수정 — savedAt 시간대 버그 수정:
 *   tg-post-saver 는 savedAt 을 진짜 UTC 문자열("YYYY-MM-DD HH:mm:ss")로 보내는데,
 *   appendRow 가 이 값을 시트에 쓰는 순간 구글 시트가 "날짜처럼 생긴 텍스트"를
 *   자동으로 날짜 값으로 인식하면서, 그 시:분:초 숫자를 UTC 가 아니라 시트 자체의
 *   시간대(한국 표준시)로 잘못 해석해버린다. 그 결과 실제보다 9시간 이른 시각으로
 *   굳어져 저장되고, 사이트가 이후 이 값을 다시 정확히 +9시간 해서 보여줘도
 *   원본이 이미 틀렸으니 화면엔 실제 저장 시각보다 9시간 느리게 뜬다.
 *   → doPost 의 'add' 분기에서 저장 직후 해당 칸을 "일반 텍스트" 서식으로 고정한
 *     뒤 원래 문자열을 다시 써넣어, 시트가 재해석하지 못하게 막았다.
 *   → 이미 저장된 과거 글은 fixPastTimestampsOnce() 를 한 번 실행해 일괄 보정한다.
 */

const TAB = 'posts';
const SITES_TAB = 'sites';
const ADMIN_KEY = 'admin:2525';

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TAB);
  if (!sh) { sh = ss.insertSheet(TAB); sh.appendRow(['id','title','savedAt','from','chatId','file']); }
  return sh;
}

function getSitesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SITES_TAB);
  if (!sh) { sh = ss.insertSheet(SITES_TAB); sh.appendRow(['id','cat','name','desc','url']); }
  return sh;
}

function out(s) { return ContentService.createTextOutput(s); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  if (e && e.parameter && e.parameter.type === 'sites') {
    const rows = getSitesSheet().getDataRange().getValues();
    return json(rows.filter(r => r[0] && r[0] !== 'id')
      .map(r => ({ id:String(r[0]), cat:String(r[1]), name:String(r[2]), desc:String(r[3]), url:String(r[4]) })));
  }
  const rows = getSheet().getDataRange().getValues();
  return json(rows.filter(r => r[0] && r[0] !== 'id')
    .map(r => ({ id:String(r[0]), title:r[1], savedAt:r[2], from:r[3], chatId:String(r[4]), file:r[5] })));
}

function doPost(e) {
  const m = JSON.parse(e.postData.contents);
  const action = m.action || 'add';

  if (action === 'add') {  // 텔레그램 봇 글 저장 (기존 호환)
    const sh = getSheet();
    sh.appendRow([m.id, m.title, m.savedAt, m.from, String(m.chatId || ''), m.file || '']);
    // 저장 시각 칸이 시트에 의해 자동으로 날짜로 인식되면서 시간대가 잘못
    // 재해석되는 것을 막기 위해, 일반 텍스트로 고정한 뒤 원래 값을 다시 써넣는다.
    const savedAtCell = sh.getRange(sh.getLastRow(), 3);
    savedAtCell.setNumberFormat('@').setValue(m.savedAt);
    return out('ok');
  }
  if (m.adminKey !== ADMIN_KEY) return out('unauthorized');
  if (action === 'verify') return out('ok');

  // ── 사이트 관리 ──
  if (action === 'site-add') {
    getSitesSheet().appendRow([m.id, m.cat, m.name, m.desc, m.url]);
    return out('ok');
  }
  if (action === 'site-update' || action === 'site-delete') {
    const sh = getSitesSheet();
    const rows = sh.getDataRange().getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(m.id)) {
        if (action === 'site-delete') { sh.deleteRow(i + 1); return out('ok'); }
        sh.getRange(i + 1, 2, 1, 4).setValues([[m.cat, m.name, m.desc, m.url]]);
        return out('ok');
      }
    }
    return out('not-found');
  }

  // ── 블로그 글 제목 수정 / 삭제 ──
  const sh = getSheet();
  const rows = sh.getDataRange().getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(m.id)) {
      if (action === 'delete') { sh.deleteRow(i + 1); return out('ok'); }
      if (action === 'update') { sh.getRange(i + 1, 2).setValue(m.title); return out('ok'); }
    }
  }
  return out('not-found');
}

/**
 * 일회성 보정 — 구글 시트가 저장 시각 문자열을 날짜로 자동 인식하면서 한국시간
 * 기준으로 잘못 해석해, 실제보다 9시간 느리게 저장돼 있던 과거 값을 전부
 * +9시간 되돌려 바로잡는다. Apps Script 편집기에서 이 함수를 선택해 "실행"을
 * 딱 한 번 누르면 되고, 실행 후에는 이 함수를 지워도 된다.
 */
function fixPastTimestampsOnce() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 3, lastRow - 1, 1); // C열 = savedAt (헤더 제외)
  const values = range.getValues();
  const pad = (n) => String(n).padStart(2, '0');

  const fixed = values.map(([v]) => {
    if (!v) return [v];
    const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
    if (isNaN(d.getTime())) return [v];
    d.setTime(d.getTime() + 9 * 3600 * 1000); // 밀렸던 9시간을 되돌린다
    const s =
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    return [s];
  });

  range.setNumberFormat('@'); // 다시 날짜로 자동 변환되지 않도록 일반 텍스트로 고정
  range.setValues(fixed);
}
