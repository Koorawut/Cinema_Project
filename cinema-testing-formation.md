# ระเบียบการทดสอบ (Testing Formation) — MAISON เว็บจองตั๋วภาพยนตร์

สร้าง: 14 ตุลาคม 2026 · ใช้บังคับตั้งแต่รอบ update v1.2 เป็นต้นไป  
เอกสารนี้คือ "ชุดตรวจที่ต้องรันทุกครั้งที่มีการ update" — agent ผู้ทดสอบ (tester) อ้างรายการในไฟล์นี้เป็นฐาน และบันทึกผลทุกรอบลง `tests/test-log.md`

เอกสารที่เกี่ยวข้อง: แผน `cinema-frontend-plan.md` · ปัญหา `cinema-issues.md` · การเปลี่ยนแปลง `CHANGELOG.md`

## 1. เมื่อไหร่ต้องทดสอบ

- ทุกครั้งที่แก้ไฟล์ `.html` / `assets/js/*.js` / `assets/css/*.css` / `assets/data/seed.json`
- ก่อนเลื่อนเลขเวอร์ชันและส่งงานทุกครั้ง
- เมื่อผู้ใช้รายงานอาการผิดปกติ — รันชุดที่เกี่ยวข้องซ้ำ พร้อมบันทึกขั้นตอนเกิดซ้ำใน `cinema-issues.md`

## 2. บทบาท

| บทบาท | หน้าที่ |
| --- | --- |
| Head | มอบหมายงาน รวมผลทดสอบ ตัดสินว่าผ่านเกณฑ์ปิดรอบหรือยัง |
| Tester (agent) | รัน T1 อัตโนมัติทุกรอบ, ตรวจ T2 wiring ทุกรอบที่แก้หน้าเว็บ, ทดสอบ T3 ตามไหล่ผู้ใช้เมื่อพื้นที่ที่แก้เกี่ยวกับ flow นั้น, ตรวจ T4 เมื่อแก้จุดเกี่ยวกับ auth/สิทธิ์/ข้อมูลผู้ใช้ |

ทุกรอบต้องรายงานในข้อความส่งงาน: ผ่าน/ไม่ผ่านรายข้อ · บัคใหม่เป็น `P-xx` ใน `cinema-issues.md` · สรุปการแก้ใน `CHANGELOG.md` ของเวอร์ชันนั้น

## 3. ชั้นการทดสอบ

### T1 — อัตโนมัติ: ตรรกะ API (`tests/run-tests.js`)

รันด้วย Node (แนะนำ ตั้งเขตเวลาให้ตรงผู้ใช้จริง):

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:TZ = 'Asia/Bangkok'
node tests/run-tests.js        # หรือใช้ runtime ที่มีในเครื่องแทน node
```

หรือรันในเบราว์เซอร์: เปิด `tests/run-tests.html` (หน้าจะสำรอง `localStorage`/`sessionStorage` ของผู้ใช้จริงไว้ก่อน แล้วคืนค่าอัตโนมัติเมื่อจบ — ข้อมูลจริงไม่ถูกแตะ)

| ชุด | ครอบคลุม |
| --- | --- |
| S1 ข้อมูลตั้งต้น | seed หนัง 8+3, โปร 3, โรง 2 โรง × 8×12, ค่าบริการ ฿30, `showDates()` 6 วันเริ่ม "วันนี้" จริง, db key `maison_v1_db` (seedVersion 4) |
| S2 สิทธิ์ (guest) | `me`/`myBookings`/`createBooking`/งาน admin ทั้งหมดตอบ 401 เมื่อยังไม่ login |
| S3 สมาชิกและรหัสผ่าน | register validation (422) ซ้ำ (409), login ด้วย username/email/พิมพ์ใหญ่, session + logout, **Remember me ฟื้น session เมื่อ sessionStorage ถูกล้าง (regression ของ P-10)**, changePassword ครบทุกกรณี |
| S4 ค้นหา/กรอง/รอบฉาย | ค้นหาชื่อ case-insensitive, กรอง genre เดี่ยว + ร่วมกับค้นหา, เรียงชื่อ/ราคา, `movie()` 404, showtimes 4 รอบ/วัน, **รอบ fixture เต็ม (The Hollow Choir 21:15 วันนี้)**, seats 96 ที่นั่ง deterministic + 404 |
| S5 ที่นั่งและการจอง | จอง 0 ที่นั่ง 422, จองรอบเต็ม 409, **ต้นทุน = (ราคา+ค่าบริการ)×จำนวนที่นั่ง**, ที่นั่งเปลี่ยนเป็น booked, **จองซ้ำ 409 พร้อม `conflicts`**, `myBookings` ครบ field, demo มีประวัติ seed 2 รายการ |
| S6 โปรโมชัน | `promotion()` 404, `redeem` ตัดช่องว่าง + ไม่สนตัวพิมพ์, โค้ดไม่มี 404 |
| S7 แอดมิน | ผู้ใช้ทั่วไป 403, `adminStats` รูปร่างครบ + ยอดรวมตรงตาราง, `adminUsers` ค้นหาได้, `adminSetRole` (ห้ามลดสิทธิ์ตัวเอง), `adminDeleteUser` (ห้ามลบตัวเอง), CRUD หนังครบ validation, **ลบหนังแล้วประวัติจองยังเห็นชื่อ (snapshot)**; CRUD คูปองสะท้อน public/redeem, ตรวจไฟล์ภาพ, รับมือ storage เต็ม |
| S8 วันที่/เขตเวลา | **`todayISO` ต้องอิงเขตเวลาท้องถิ่น** — เทียมเวลา 00:30 และ 23:59 ของวันนี้ ผลต้องนับเป็นวันเดิม (จับบัค UTC แบบ P-11) |

หมายเหตุ: หากรันบนเครื่องที่เขตเวลาเป็น UTC การทดสอบ S8 จะไม่สามารถจับบัคเขตเวลาได้ (บัคไม่ปรากฏใน UTC) — ให้ตั้ง `TZ=Asia/Bangkok` ตามคำสั่งด้านบน

### T2 — Wiring 15 หน้า (ตรวจโครงสร้าง ไม่รันโค้ด)

1. ทุกหน้าโหลด `assets/css/styles.css` + `assets/js/api.js` + `assets/js/app.js` ตามลำดับ ก่อน inline script; path ถูกต้อง
2. `MAISON.init()` opts ตรง matrix: login/register → `redirectIfAuth`; seats/checkout/ticket/account/bookings → `guard:'user'`; admin/admin-accounts/admin-movies/admin-promotions → `guard:'admin'` + `chrome:'admin'`; index/movies/movie/offers → สาธารณะ
3. ทุก `byId()` / `getElementById()` ใน inline script มี `id` ตรงกันในไฟล์เดียวกัน
4. ทุกการเรียก `MAISON_API.*` / `MAISON.*` มีอยู่จริงตามสัญญา และ argument ตรง signature
5. ลิงก์ระหว่างหน้า: ไฟล์ปลายทางมีจริง + query string ผู้ส่ง/ผู้รับตรงกัน
6. ไม่มีฟีเจอร์ที่ตัดออกจาก v1: verify email, QR/บาร์โค้ด, download ticket, watch trailer, timer กันที่นั่ง, ชำระเงินจริง/ฟิลด์บัตร
7. ข้อความผู้ใช้เป็นภาษาไทย ไม่มี lorem/placeholder/`{{...}}`
8. จุดแทรกข้อมูลไดนามิกลง `innerHTML` ต้องผ่าน `MAISON.esc()` หรือใช้ textContent
9. หน้าแรกมีเลขเวอร์ชันที่ eyebrow; footer มีเลขเวอร์ชันทุกหน้าผู้ใช้
10. ฟอร์มมี label/aria-label และ `required` ที่จำเป็น

### T3 — ทดสอบตามไหล่ผู้ใช้ (manual, รันเมื่อแก้ flow ที่เกี่ยวข้อง)

1. สมัคร → login → logout → login ด้วย email
2. เปลี่ยนรหัสผ่าน (ผ่านหน้า Account) → login ด้วยรหัสใหม่ได้ รหัสเก่าใช้ไม่ได้
3. หน้าแรก → Movies → ค้นหา + กรอง genre → เลือกหนัง → เลือกวัน/รอบ
4. เลือกที่นั่ง (แดง=ว่าง เทา=จองแล้ว) → สรุปราคา → ยืนยันจอง → หน้าตั๋ว
5. เปิด 2 หน้าต่างจองที่นั่งเดียวกัน → ฝั่งหลังต้องเจอ 409 และกลับไปเลือกใหม่
6. Purchase History แสดงชื่อหนัง ที่นั่ง และค่าบริการ
7. Offers → กดรูปโปรโมชัน → redeem โค้ด
8. Admin: login → ภาพรวม/สถิติ → เพิ่ม/แก้/ลบหนัง (รวมแนบโปสเตอร์และเลื่อนฟอร์ม) → เพิ่ม/แก้/ลบคูปอง (รวมแนบภาพและตรวจหน้าโปรโมชัน) → เปลี่ยนสิทธิ์/ลบบัญชี
9. Remember me: ติ๊กจำฉัน → ปิด/เปิดหน้าใหม่ ยัง login อยู่; ไม่ติ๊ก → ต้อง login ใหม่

### T4 — ความปลอดภัย (รันเมื่อแก้จุดเสี่ยง)

- ทุกจุดแทรกข้อมูลผู้ใช้/DB ลง `innerHTML` ผ่าน `esc()`
- เข้าหน้า admin ตรง ๆ โดยไม่ login / login เป็น user ธรรมดา → ต้องถูกส่งไป login
- ไม่มีการรับ/แสดงข้อมูลบัตรหรืออ้างว่าชำระเงินจริง
- คีย์ storage/cookie ตรงตามที่นิยาม (`maison_v1_db`, `maison_v1_session`, `maison_v1_session_fb`, `maison_v1_remember`, cookie `maison_remember`)

## 4. เกณฑ์ผ่านของรอบ update

- T1 ผ่าน 100% (ผลลัพธ์สรุป `SUMMARY pass=N fail=0`)
- T2 ไม่มีรายการระดับ P0
- บัคใหม่ที่พบทุกรายการต้อง: แก้ในรอบนั้น หรือ บันทึกเป็น `P-xx` พร้อมเงื่อนไขปิดก่อนปิดรอบ
- หากแก้โค้ดจริง ต้องเลื่อนเลขเวอร์ชัน + บันทึก `CHANGELOG.md` + อัปเดต `tests/test-log.md` + แจ้งการเปลี่ยนแปลง `cinema-issues.md` ในข้อความส่งงาน

## 5. การบันทึกผล

ทุกรอบทดสอบบันทึกลง `tests/test-log.md` รูปแบบ: วันที่ · เวอร์ชันที่ทดสอบ · คำสั่ง/สภาพแวดล้อม · ผลรายชุด · บัคที่พบ (อ้าง `P-xx`) · การแก้ · ผลรอบสอง
