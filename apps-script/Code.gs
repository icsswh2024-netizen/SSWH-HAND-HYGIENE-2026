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
const SHEET_ID = '1YEKxrbbCBGAtG3Cyq3tg-ekt3hiBeAiwHP4i9nZ_N2k';

const TAB_SUBMISSIONS = 'Submissions';
const TAB_VIEWS       = 'Views';
const TAB_VOTES       = 'Votes';
const TAB_COMMENTS    = 'Comments';
const TAB_SETTINGS    = 'Settings';

// สถานะที่จะ "แสดงบนเว็บ" (คลิปที่แอดมินอนุมัติแล้ว)
const VISIBLE_STATUS = ['approved', 'active'];

// ====== รันครั้งเดียวเพื่อสร้างแท็บ + หัวตาราง + ค่าตั้งต้น ======
function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheet(ss, TAB_SUBMISSIONS, ['Timestamp', 'VideoID', 'ชื่อผลงาน/ผู้เข้าแข่งขัน', 'หน่วยงาน', 'ลิงก์วิดีโอ (URL MP4)', 'Status']);
  ensureSheet(ss, TAB_VIEWS,    ['Timestamp', 'VideoID', 'DeviceID']);
  ensureSheet(ss, TAB_VOTES,    ['Timestamp', 'VideoID', 'Score', 'DeviceID']);
  ensureSheet(ss, TAB_COMMENTS, ['Timestamp', 'VideoID', 'ผู้แสดงความเห็น', 'ข้อความ', 'DeviceID']);

  // แท็บตั้งค่าหน้าเว็บ (แก้ข้อความได้โดยไม่ต้องแตะโค้ด)
  const settings = ensureSheet(ss, TAB_SETTINGS, ['Key', 'Value']);
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, 7, 2).setValues([
      ['adminKey', 'sswh2026'],
      ['requireApproval', 'TRUE'],
      ['title', 'วันล้างมือโลก'],
      ['subtitle', 'Global Handwashing Day Video Contest'],
      ['rules', 'ส่งผลงานวิดีโอสร้างสรรค์รณรงค์การล้างมือให้ถูกวิธี 7 ขั้นตอน<br><b>กติกา:</b> แนบลิงก์ผลงาน (MP4) อัปโหลดเพื่อร่วมสนุก ให้คะแนน และคอมเมนต์เป็นกำลังใจ!'],
      ['resultTitle', 'ยังไม่สามารถดูได้'],
      ['resultMessage', 'ผลคะแนนโหวตจะสามารถดูได้เมื่อแอดมินทำการปิดระบบโหวตแล้วเท่านั้นครับ']
    ]);
  }
}

function ensureSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// อ่านแท็บ Settings เป็นออบเจกต์ { key: value }
function getSettings(ss) {
  const sh = ss.getSheetByName(TAB_SETTINGS);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const k = String(r[0]).trim();
    if (k) out[k] = r[1];
  });
  return out;
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
      // ต้องอนุมัติก่อนไหม? (Settings.requireApproval) -> pending / approved
      const requireApproval = String(getSettings(ss).requireApproval || 'TRUE').toUpperCase() !== 'FALSE';
      const status = requireApproval ? 'pending' : 'approved';
      ss.getSheetByName(TAB_SUBMISSIONS).appendRow([
        now, payload.id, payload.title || '', payload.organization || '', payload.url || '', status
      ]);
    } else if (action === 'ADD_VIEW') {
      ss.getSheetByName(TAB_VIEWS).appendRow([now, payload.id, payload.device || '']);
    } else if (action === 'ADD_VOTE') {
      ss.getSheetByName(TAB_VOTES).appendRow([now, payload.id, payload.score, payload.device || '']);
    } else if (action === 'ADD_COMMENT') {
      ss.getSheetByName(TAB_COMMENTS).appendRow([now, payload.id, payload.user || 'ผู้เยี่ยมชม', payload.text || '', payload.device || '']);
    } else if (action === 'SET_STATUS') {
      // แอดมินอนุมัติ/ปฏิเสธคลิป — ต้องมีรหัสแอดมินที่ถูกต้อง
      if (String(payload.key || '') !== String(getSettings(ss).adminKey || '')) {
        return jsonOut({ ok: false, error: 'unauthorized' });
      }
      const sh = ss.getSheetByName(TAB_SUBMISSIONS);
      const n = sh.getLastRow() - 1;
      if (n > 0) {
        const ids = sh.getRange(2, 2, n, 1).getValues(); // คอลัมน์ B = VideoID
        for (let i = 0; i < ids.length; i++) {
          if (String(ids[i][0]) === String(payload.id)) {
            sh.getRange(i + 2, 6).setValue(payload.status); // คอลัมน์ F = Status
            break;
          }
        }
      }
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

  // แสดงเฉพาะคลิปที่แอดมินอนุมัติแล้ว (Status = approved/active)
  const videos = subs
    .filter(r => VISIBLE_STATUS.indexOf(String(r[5] || '').toLowerCase()) !== -1)
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

  const settings = getSettings(ss);
  const publicSettings = Object.assign({}, settings);
  delete publicSettings.adminKey; // ไม่ส่งรหัสแอดมินออกไปให้ทุกคน

  const payload = { settings: publicSettings, videos: videos };

  // ถ้าใส่ ?admin=<รหัส> ถูกต้อง -> แนบรายการคลิปที่ยังไม่อนุมัติมาด้วย (สำหรับเมนูแอดมิน)
  const adminKey = e && e.parameter && e.parameter.admin;
  if (adminKey && String(adminKey) === String(settings.adminKey || '')) {
    payload.pending = subs
      .filter(r => VISIBLE_STATUS.indexOf(String(r[5] || '').toLowerCase()) === -1)
      .map(r => ({
        id: r[1],
        title: String(r[2]),
        organization: String(r[3]),
        url: String(r[4]),
        status: String(r[5] || '')
      }));
  }

  // JSONP (เลี่ยง CORS) ถ้ามี callback, ไม่งั้นส่ง JSON ปกติ
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(payload) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOut(payload);
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
