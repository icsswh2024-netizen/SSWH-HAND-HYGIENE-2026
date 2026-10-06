/**
 * Global Handwashing Day – Video Contest
 * Google Apps Script backend (Web App) สำหรับเก็บข้อมูลลง Google Sheet
 *
 * รองรับ:
 *  1) ชื่อผลงาน/ผู้เข้าแข่งขัน, หน่วยงาน, ลิงก์วิดีโอ (MP4)  -> แท็บ Submissions
 *  2) ยอดเข้าชม / คะแนนโหวต / ความคิดเห็น                 -> แท็บ Views / Votes / Comments (log)
 *  3) หลายเครื่องพร้อมกันไม่ error                        -> LockService เข้าคิวเขียนทีละคน
 *  4) ข้อมูลใหม่ไม่ทับของเดิม                              -> appendRow (เติมต่อท้ายเสมอ)
 *
 * วิธีติดตั้งอ่านที่ไฟล์ README.md ในโฟลเดอร์เดียวกัน
 */

// ====== ตั้งค่า ======
// ใส่ ID ของ Google Sheet (ดูได้จาก URL: https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit )
const SHEET_ID = 'ใส่_SHEET_ID_ของคุณที่นี่';

const TAB_SUBMISSIONS = 'Submissions';
const TAB_VIEWS       = 'Views';
const TAB_VOTES       = 'Votes';
const TAB_COMMENTS    = 'Comments';

// ====== รันครั้งเดียวเพื่อสร้างแท็บ + หัวตาราง ======
function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheet(ss, TAB_SUBMISSIONS, ['Timestamp', 'VideoID', 'ชื่อผลงาน/ผู้เข้าแข่งขัน', 'หน่วยงาน', 'ลิงก์วิดีโอ (URL MP4)', 'Status']);
  ensureSheet(ss, TAB_VIEWS,    ['Timestamp', 'VideoID', 'DeviceID']);
  ensureSheet(ss, TAB_VOTES,    ['Timestamp', 'VideoID', 'Score', 'DeviceID']);
  ensureSheet(ss, TAB_COMMENTS, ['Timestamp', 'VideoID', 'ผู้แสดงความเห็น', 'ข้อความ', 'DeviceID']);
}

function ensureSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

// ====== รับข้อมูลเข้า (เขียน) ======
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // กันหลายเครื่องเขียนชนกัน (คิวสูงสุด 30 วินาที)
  try {
    const action = e.parameter.action;
    const payload = JSON.parse(e.parameter.payload || '{}');
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const now = new Date();

    if (action === 'ADD_VIDEO') {
      ss.getSheetByName(TAB_SUBMISSIONS).appendRow([
        now, payload.id, payload.title || '', payload.organization || '', payload.url || '', 'active'
      ]);
    } else if (action === 'ADD_VIEW') {
      ss.getSheetByName(TAB_VIEWS).appendRow([now, payload.id, payload.device || '']);
    } else if (action === 'ADD_VOTE') {
      ss.getSheetByName(TAB_VOTES).appendRow([now, payload.id, payload.score, payload.device || '']);
    } else if (action === 'ADD_COMMENT') {
      ss.getSheetByName(TAB_COMMENTS).appendRow([now, payload.id, payload.user || 'ผู้เยี่ยมชม', payload.text || '', payload.device || '']);
    } else {
      return jsonOut({ ok: false, error: 'unknown action: ' + action });
    }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ====== ส่งข้อมูลออก (อ่าน) — รองรับ JSONP ด้วย ?callback= ======
function doGet(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  const subs     = rowsAfterHeader(ss, TAB_SUBMISSIONS); // [Timestamp, VideoID, Title, Org, URL, Status]
  const views    = rowsAfterHeader(ss, TAB_VIEWS);       // [Timestamp, VideoID, Device]
  const comments = rowsAfterHeader(ss, TAB_COMMENTS);    // [Timestamp, VideoID, User, Text, Device]

  // นับยอดวิวต่อคลิป
  const viewCount = {};
  views.forEach(r => { const id = String(r[1]); viewCount[id] = (viewCount[id] || 0) + 1; });

  // รวมความคิดเห็นต่อคลิป (เรียงเก่า -> ใหม่ ตามลำดับแถว)
  const commentMap = {};
  comments.forEach(r => {
    const id = String(r[1]);
    (commentMap[id] = commentMap[id] || []).push({ user: String(r[2]), text: String(r[3]) });
  });

  const data = subs
    .filter(r => String(r[5] || 'active') !== 'hidden') // ซ่อนผลงานที่ตั้ง Status=hidden ได้
    .map(r => {
      const id = String(r[1]);
      return {
        id: r[1],
        title: String(r[2]),
        organization: String(r[3]),
        url: String(r[4]),
        views: viewCount[id] || 0,
        comments: commentMap[id] || []
      };
    });

  // JSONP (เลี่ยง CORS) ถ้ามี callback, ไม่งั้นส่ง JSON ปกติ
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(data) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOut(data);
}

// ====== helpers ======
function rowsAfterHeader(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
