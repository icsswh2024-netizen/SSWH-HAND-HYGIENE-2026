# วิธีเชื่อมต่อเว็บกับ Google Sheet (Apps Script)

ระบบนี้ให้ **ทุกเครื่อง (iPad / มือถือ / PC) เห็นข้อมูลตรงกันแบบ real-time** (เว็บรีเฟรชข้อมูลเองทุก 10 วินาที)
โดยออกแบบให้ **หลายเครื่องเขียนพร้อมกันไม่ error** และ **ข้อมูลใหม่ไม่ทับของเดิม**

---

## 1. สร้าง Google Sheet
1. ไปที่ https://sheets.google.com สร้างสเปรดชีตใหม่ 1 ไฟล์
2. คัดลอก **SHEET_ID** จาก URL
   `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`

## 2. ติดตั้ง Apps Script
1. ในสเปรดชีต เมนู **Extensions → Apps Script**
2. ลบโค้ดเดิมทั้งหมด แล้ววางเนื้อหาจากไฟล์ **`Code.gs`** (ในโฟลเดอร์นี้) ลงไป
3. แก้บรรทัด `const SHEET_ID = '...'` ให้เป็น SHEET_ID ของคุณ
4. กด **Save** (💾)

## 3. สร้างแท็บและหัวตารางอัตโนมัติ
1. ที่แถบเลือกฟังก์ชันด้านบน เลือก **`setup`** แล้วกด **Run** (▶)
2. ครั้งแรกจะขออนุญาต → **Review permissions → เลือกบัญชี → Advanced → Go to ... (unsafe) → Allow**
3. กลับไปดูในสเปรดชีต จะได้ 4 แท็บ: `Submissions`, `Views`, `Votes`, `Comments` พร้อมหัวตาราง

## 4. Deploy เป็น Web App
1. มุมขวาบน **Deploy → New deployment**
2. ไอคอนเฟือง ⚙ → เลือก **Web app**
3. ตั้งค่า:
   - **Description:** handwashing contest
   - **Execute as:** **Me** (บัญชีคุณ)
   - **Who has access:** **Anyone**  ← สำคัญ! ต้องเป็น Anyone ให้ทุกเครื่องเข้าได้
4. กด **Deploy** → อนุญาตสิทธิ์ (ถ้าถามอีกครั้ง)
5. คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

## 5. ใส่ URL ลงในเว็บ
เปิดไฟล์ **`index.html`** หาบรรทัด:
```js
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_WEB_APP_ID/exec';
```
แทนที่ด้วย Web app URL ที่คัดลอกมาจากข้อ 4 แล้วบันทึก

> ตราบใดที่ยังมีคำว่า `YOUR_WEB_APP_ID` อยู่ เว็บจะอยู่ใน **โหมดสาธิต** (แสดงข้อมูลตัวอย่าง 3 คลิป ไม่เชื่อมต่อ Sheet)
> พอใส่ URL จริง เว็บจะโหลดข้อมูลจาก Sheet และรีเฟรชเองทุก 10 วินาทีทันที

---

## การทำงานเบื้องหลัง (ทำไมไม่ error / ไม่ทับกัน)

| โจทย์ | วิธีแก้ในโค้ด |
|---|---|
| ชื่อ/หน่วยงาน/ลิงก์ แสดงได้เลย | แท็บ `Submissions` 1 แถว = 1 คลิป |
| ยอดชม / คะแนน / คอมเมนต์ | แยกเป็น log (`Views`/`Votes`/`Comments`) แล้ว `doGet` นับรวมให้ |
| หลายเครื่องพร้อมกัน **ไม่ error** | `LockService.getScriptLock()` เข้าคิวเขียนทีละคน |
| ข้อมูลใหม่ **ไม่ทับของเดิม** | ใช้ `appendRow` เติมต่อท้ายเสมอ (ไม่เขียนทับเซลล์) |
| หลายโดเมนอ่านข้อมูลได้ (ไม่ติด CORS) | `doGet` รองรับ **JSONP** ผ่าน `?callback=` |

### ข้อมูลที่เว็บส่งมา (doPost)
| action | payload |
|---|---|
| `ADD_VIDEO` | `{ id, title, organization, url }` |
| `ADD_VIEW` | `{ id, device }` |
| `ADD_VOTE` | `{ id, score, device }` |
| `ADD_COMMENT` | `{ id, user, text, device }` |

### หมายเหตุ
- **โหวตซ้ำ / นับวิวซ้ำ**: ฝั่งเว็บกันไว้ด้วย `localStorage` ต่อเครื่อง (จำว่าเครื่องนี้โหวต/ดูคลิปไหนแล้ว) — กันซ้ำระดับเบื้องต้น ไม่ใช่ระดับบัญชีผู้ใช้
- **แก้ไข/ซ่อนผลงาน**: ตั้งค่าในคอลัมน์ `Status` ของแท็บ `Submissions` เป็น `hidden` แล้วคลิปนั้นจะไม่แสดงบนเว็บ
- **อัปเดตโค้ด Apps Script ภายหลัง**: ต้อง **Deploy → Manage deployments → แก้ไข (ดินสอ) → Version: New version → Deploy** เพื่อให้ URL เดิมใช้โค้ดใหม่
