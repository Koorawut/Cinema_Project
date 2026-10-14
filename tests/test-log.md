# บันทึกผลการทดสอบ (Test Log) — MAISON

บันทึกผลการทดสอบทุกรอบตามระเบียบ `cinema-testing-formation.md` (สร้างในรอบ v1.2)

---

## รอบที่ 1 — 14 ตุลาคม 2026 · เวอร์ชันที่ทดสอบ 1.2.0

### สภาพแวดล้อม / วิธีรัน

- Windows + Chrome 154.0.8037.99 headless ผ่าน `Start-Process` (`--dump-dom`, `--virtual-time-budget=9000`) — เรียก Chrome ตรงผ่าน PowerShell pipeline ไม่ได้ (GUI app)
- **T1:** เปิด `tests/run-tests.html` ใน headless Chrome เขตเวลาท้องถิ่น UTC+7 (Asia/Bangkok) — เครื่องไม่มี Node runtime จึงรันผ่านหน้าเบราว์เซอร์ (หน้าสำรอง/คืนค่า storage ของผู้ใช้จริงเอง)
- **Smoke test:** สคริปต์ `smoke2.ps1` (temp ของเครื่อง) สร้าง wrapper HTML เขียน sessionStorage `maison_v1_session` + localStorage `maison_v1_session_fb` (จำลอง login `u-demo` หรือ `u-admin`) แล้ว redirect ไปหน้าเป้าหมาย — ตรวจผลจาก DOM ที่ dump ได้

### T1 — อัตโนมัติ ตรรกะ API (S1–S8)

- รอบแรก: **S8 fail** — `todayISO()` อิง UTC ทำให้เวลา 00:30 น. เขตไทยถูกนับเป็นวันถัดไป (**P-11**)
- หลังแก้ (เปลี่ยนเป็น `isoDateStr()` อ่านปี/เดือน/วันจากเวลาท้องถิ่น) รันซ้ำ: **SUMMARY pass=39 fail=0** — ผ่าน 100%

### T2 — Wiring 14 หน้า

พบ 4 จุดและแก้ครบก่อนปิดรอบ:

1. seats.html ขาด `guard:'user'` — ผู้ไม่ login เข้าหน้าเลือกที่นั่งได้โดยตรง → เพิ่มแล้ว
2. admin-movies.html ไม่ esc ค่า `price` / `durationMin` ที่แทรกใน template ฟอร์ม → เพิ่ม `MAISON.esc()`
3. `GENRE_MAP` อยู่ inline ใน admin-movies.html และหน้าอื่นแสดง genre ภาษาอังกฤษ → ย้ายไป app.js พร้อม `genreThai()` / `genresLabel()` แล้วแสดงภาษาไทยทุกหน้า
4. index.html eyebrow อ้างเวอร์ชันเก่า → "เวอร์ชัน 1.2 (v1.2)"

ตรวจซ้ำหลังแก้: ผ่านครบทั้ง 10 ข้อ ไม่มี P0 คงเหลือ

### Smoke test หน้าเว็บจริง (T3 เบื้องต้น + ยืนยันผล T2/T4)

15 เคส ผ่านทั้งหมด:

| เคส | สิ่งที่ยืนยันจาก DOM | ผล |
| --- | --- | --- |
| index | Top 5 ยอดนิยม / โปรโมชันประจำเดือน / กำลังจะมาถึง + eyebrow "เวอร์ชัน 1.2 (v1.2)" | ผ่าน |
| movies | การ์ดหนัง now showing + genre ไทย (เช่น "แอ็กชัน") | ผ่าน |
| movie | รายละเอียดหนัง + ตัวเลือกวัน/รอบ | ผ่าน |
| offers | โปรโมชัน 3 รายการ | ผ่าน |
| seats (ไม่มี session) | guard ส่งกลับหน้า login | ผ่าน |
| seats (login u-demo) | แผนที่ที่นั่ง 96 ปุ่ม + ปุ่มดำเนินการต่อ + คำเตือนไม่ล็อกที่นั่ง | ผ่าน |
| login | ฟอร์มเข้าสู่ระบบ + จำฉัน | ผ่าน |
| register | ฟอร์มสมัครสมาชิก | ผ่าน |
| account (u-demo) | email demo@maison.demo + แท็บข้อมูล | ผ่าน |
| account ?tab=password | ฟอร์มเปลี่ยนรหัสผ่าน | ผ่าน |
| bookings (u-demo) | ประวัติจอง seed MAI-7Q3F | ผ่าน |
| ticket (MAI-7Q3F) | รายละเอียดตั๋ว + ที่นั่ง E7/E8 | ผ่าน |
| checkout (st-m01 วันนี้ 12:10, hall-01-A3+A4) | สรุปราคา ยอดรวม ฿580 = (260+30)×2 + ปุ่มยืนยันการจอง | ผ่าน |
| admin (u-admin) | ภาพรวม + สถิติ | ผ่าน |
| admin-accounts (u-admin) | ตารางผู้ใช้ + ช่องค้นหา | ผ่าน |
| admin-movies (u-admin) | ตารางหนัง + genre ไทยในฟอร์ม | ผ่าน |

หมายเหตุ: เคส checkout ครั้งแรก fail เพราะ URL ทดสอบใช้ label ที่นั่ง (`A3,A4`) แต่ระบบใช้ id เต็ม (`hall-01-A3`) — ตัวระบบทำงานถูกต้อง (seats.html ส่ง id เต็มเสมอ) แต่การที่ checkout แสดงข้อความ "ที่นั่งที่เลือกถูกจองไปแล้ว" กับ id ที่ไม่ตรง format นั้นกำกวม → บันทึก **P-12**

### T4 — ความปลอดภัย (static review + ยืนยันด้วย smoke)

- guard user/admin ทำงานจริง (seats ไม่มี session → login; หน้า admin ผ่านเมื่อมี session admin)
- จุดแทรก innerHTML ผ่าน `esc()` รวมจุดที่แก้รอบนี้ (admin-movies price/durationMin)
- ไม่พบฟีเจอร์นอกขอบเขต v1 ปรากฏใน DOM ที่ dump ได้ (verify email, QR, download, trailer, timer, ช่องข้อมูลบัตร)

### บัคที่พบและการแก้

- **P-11** แก้แล้วในรอบนี้ — ดูรายละเอียดใน `cinema-issues.md`
- **P-12** เปิด (low) — ข้อความ empty state ของ checkout.html กำกวมกรณีพารามิเตอร์ `seats` ไม่ตรง format id

### สรุปรอบ

- T1 ผ่าน 100% (39/39) · T2 ผ่านหลังแก้ 4 จุด · Smoke 15/15
- T3 manual เต็มรูปแบบ (โหลดซ้อน 409, remember me ข้ามแท็บ) และ T4 เชิงลึกยังไม่ได้ทำ — ทำเท่าที่ smoke + static review ครอบคลุม บันทึกไว้เป็นหนี้ของรอบถัดไป
- ผ่านเกณฑ์ปิดรอบตามข้อ 4 ของระเบียบ: บัคใหม่ P-11 แก้ในรอบนี้, P-12 บันทึกพร้อมเงื่อนไขปิด

---

## รอบที่ 2 — 14 ตุลาคม 2026 · เวอร์ชันที่ทดสอบ 1.3.0

### สภาพแวดล้อม / วิธีรัน

- เช่นรอบก่อน (headless Chrome `--dump-dom` ผ่าน `Start-Process`) ปรับสองจุด: T1 ใช้ `--virtual-time-budget=60000` (ชุด 42 รายการเรียก API มากขึ้น ทดสอบแล้ว 15000 ตัดที่ S4 และ 30000 ตัดที่ S7), smoke test ใช้ Chrome profile ใหม่ต่อเคส (`smoke3-profile-{i}` ลบก่อนรัน) ให้ seed เริ่มใหม่ทุกเคส
- smoke ยังใช้ wrapper HTML เขียน session (`u-demo`/`u-admin`) แล้ว redirect; เคส checkout ใช้ smart wrapper โหลด api.js + `MAISON_API.seats()` เลือกที่นั่งว่างจริง 2 ที่แรกแล้ว redirect พร้อม query string

### T1 — อัตโนมัติ ตรรกะ API (S1–S8)

- เพิ่ม 3 รายการเกี่ยวกับระบบรอบฉายใหม่ (2 โรง / 3 ช่วงเวลา / สถานะรอบเต็มและไม่มีรอบ) พร้อม helper `refISO(offsetDays)` / `stIdOf(movieId, dateISO, periodKey)` รวม 42 รายการ
- พบบั๊ก syntax ระหว่าง rewrite api.js: `normalizeSchedule` ถูกวางใน object literal ทำให้ไฟล์ parse ไม่ผ่าน → ย้ายขึ้น IIFE scope ก่อน `var API = {` — จับได้ก่อน release หน้าเว็บไม่เคยได้รับผลกระทบ
- ผลหลังแก้: **SUMMARY pass=42 fail=0** — ผ่าน 100%

### T2 — Wiring หน้าที่แก้ใน v1.3

ตรวจ marker ใหม่ทุกหน้าที่แก้ — ผ่านครบ: login (ปุ่มกรอกบัญชี demo/admin + กล่องบัญชีทดลอง), movies (ตาราง 7 คอลัมน์ + badge มีที่นั่ง/รอบเต็ม/ไม่มีรอบ), movie (meta ช่วงวันฉาย/ช่วงเวลาฉาย/โรงฉาย + ปุ่ม "รอบ{ช่วงเวลา} · {โรง}" + dateStrip), admin-movies (ฟอร์มโรง `#mf-hall` / ช่วงเวลา `#mf-period` + badge รอบวันนี้), checkout (บรรทัดโรงฉาย + รอบ/เวลา), index/footer ("เวอร์ชัน 1.3 (v1.3)")

### Smoke test หน้าเว็บจริง (17 เคส)

| เคส | สิ่งที่ยืนยันจาก DOM | ผล |
| --- | --- | --- |
| index | Top 5 ยอดนิยม + โปร 3 รายการ + coming soon + "เวอร์ชัน 1.3 (v1.3)" | ผ่าน |
| movies | ตาราง 7 คอลัมน์ + badge สถานะ + โรงฉาย Hall 01 | ผ่าน |
| movie (m01) | meta ช่วงวันฉาย + ปุ่ม "รอบเช้า · Hall 01" | ผ่าน |
| movie (m06) | แถบวันมี class `out` (วันนอกช่วงฉาย) + รอบกลางวัน | ผ่าน |
| offers | MAISON20 / EVENINGPAIR / FRIDAY180 | ผ่าน |
| seats (ไม่มี session) | guard ส่งกลับหน้า login | ผ่าน |
| seats (login u-demo) | แผนผัง Hall 01 + ที่นั่ง A1 + ชื่อหนัง | ผ่าน |
| checkout (u-demo, smart wrapper) | รายละเอียดการจอง + ยอดชำระ + Iron Requiem + รอบเช้า + **฿580 = (260+30)×2** | ผ่าน |
| ticket (b-MAI-7Q3F) | Orbit 9 + ที่นั่ง E7 + Hall 01 + รหัสจอง | ผ่าน |
| bookings (u-demo) | ประวัติ MAI-7Q3F + Orbit 9 | ผ่าน |
| account (u-demo) | demo@maison.demo + แท็บข้อมูล | ผ่าน |
| account ?tab=password | ฟอร์มเปลี่ยนรหัสผ่าน ("รหัสผ่านปัจจุบัน") | ผ่าน |
| login | ปุ่มกรอกบัญชี demo/admin + กล่องบัญชีทดลอง | ผ่าน |
| register | ฟอร์มสมัครสมาชิก | ผ่าน |
| admin (u-admin) | ภาพรวมระบบ + ยอดขายแยกตามภาพยนตร์ | ผ่าน |
| admin-accounts (u-admin) | ตารางผู้ใช้ + ช่องค้นหา | ผ่าน |
| admin-movies (u-admin) | ฟอร์มโรง/ช่วงเวลา + badge "ไม่มีรอบวันนี้" + รอบกลางวัน | ผ่าน |

ครั้งแรก fail 2 เคส — ทั้งคู่เป็นเรื่องเคสทดสอบ ไม่ใช่บัคระบบ:

1. **index:** marker `Iron Requiem` ผิดเพราะ Top 5 ยอดนิยม (เรียงตามยอดขาย) วันนี้ไม่มี m01 → เปลี่ยนเป็น `Neon Province` (coming soon คงที่จาก seed)
2. **checkout:** ที่นั่งคงที่ `hall-01-A1,A2` ใน URL โดน `seededOccupancy()` (จองขวัญแบบ deterministic 28–70% ต่อรอบ) จับเป็น booked หน้า checkout แสดง empty state "ที่นั่งที่เลือกถูกจองไปแล้ว" **ถูกต้องตามออกแบบ** → เปลี่ยนเป็น smart wrapper เลือกที่นั่งว่างจริงผ่าน API แล้วค่อย redirect

### บั๊กที่พบและการแก้

- **P-13** ปิด (v1.3) — ปุ่ม ghost "เข้าสู่ระบบ" บนพื้น theme-dark กลืนกับพื้นหลัง → `.theme-dark .btn-ghost` ใช้ขอบทองโปร่งแสง
- บั๊ก syntax `normalizeSchedule` (ดู T1 ด้านบน) — แก้แล้ว
- **P-12** ยังเปิด (low) — ไม่มีการแก้ในรอบนี้

### สรุปรอบ

- T1 ผ่าน 100% (42/42) · T2 ผ่านครบทุก marker ใหม่ · Smoke 17/17
- ไฟล์ปัญหา: เพิ่ม P-13 (ปิดในรอบเดียวกัน) / คงค้าง: P-01, P-03, P-04, P-06, P-07, P-08, P-12
- หนี้การทดสอบเดิมคงอยู่: T3 manual เต็มรูปแบบ (โหลดซ้อน 409, remember me ข้ามแท็บ) และ T4 เชิงลึก

---

## รอบที่ 3 — 14 ตุลาคม 2026 · เวอร์ชันที่ทดสอบ 1.4.0

### สภาพแวดล้อม / วิธีรัน

- Windows, headless Chrome ผ่าน `Start-Process` + `--dump-dom --virtual-time-budget=60000` เปิด `tests/run-tests.html` (เครื่องนี้เรียก `node` ไม่ได้); test page สำรอง/คืนค่า storage เมื่อจบ; ใช้ Chrome profile แยกใน temp
- ตรวจ smoke หน้า `offers.html` (guest), `admin-promotions.html` (guest ถูก redirect), และ `admin-promotions.html` (login mock admin ผ่านหน้า wrapper ชั่วคราว แล้วลบ wrapper ออก)

### T1 — อัตโนมัติ S1–S8

- เพิ่ม 2 รายการใน S7 พร้อมขยาย guest/user guard: CRUD คูปอง, รายการ public/redeem ตามหลังแก้ไข, ตรวจรหัสซ้ำ/ภาพไม่ถูกต้อง, storage เต็มแล้วไม่แสดงผลสำเร็จ
- ผล: **SUMMARY pass=44 fail=0 total=44** (S1–S8 ผ่านครบ; Chrome รายงานเขตเวลาท้องถิ่น UTC+7)

### T2 — Wiring 15 หน้า

- ตรวจจุดที่แก้: `admin-promotions.html` โหลด CSS → API → app ก่อน inline script, ใช้ `MAISON.init({chrome:'admin',guard:'admin'})`, เมธอด `MAISON_API`/`MAISON` และ id ตรงกับ markup; sidebar admin ทั้ง 4 หน้าเชื่อมกัน, หน้าแรกและ offers เรียก `promotions()` จาก DB เดียวกัน; ฟอร์มภาพยนตร์ใช้ `MAISON.readImage()` และการแทรกข้อมูลลง HTML ใช้ `MAISON.esc()` หรือ text nodes
- ตรวจเลขเวอร์ชัน eyebrow หน้าแรก/footer, label ของไฟล์ภาพและช่อง required; ไม่เพิ่มฟีเจอร์ที่ตัดออกจาก v1; ไม่พบ P0 จาก wiring จุดที่แก้ (ไม่ได้รัน automation ตรวจ 15 หน้าเต็ม)

### T3 / T4 — เบราว์เซอร์และความปลอดภัย

- Offers guest: การ์ด seed ทั้ง 3 รายการ (MAISON20, EVENINGPAIR, FRIDAY180) และ footer v1.4 ปรากฏ
- Admin promotions guest: redirect ไปหน้า login; admin mock: ตาราง seed 3 คูปองพร้อมปุ่มเพิ่ม/แก้ไข/ลบปรากฏ
- T4 API: guest 401 / user 403 สำหรับ CRUD คูปอง; ปฏิเสธ `javascript:` และ data URL ปลอม; ข้อความ admin ในตารางใช้ text nodes, ข้อมูลในฟอร์มใช้ `MAISON.esc()`; ไม่มีช่องบัตรหรือการคำนวณส่วนลดจริง
- ยังไม่ได้ใช้เครื่องมือกดฟอร์ม/เลือกไฟล์จริงหรือวัด layout บนจอมือถือด้วย screenshot; T3 manual การเลื่อน modal, แนบไฟล์, reload หลัง CRUD และ T3 เดิม (409 จองซ้อน/remember me ข้ามแท็บ) ยังต้องตรวจด้วยมือ

### สรุปรอบ / ปัญหา

- T1 ผ่าน 44/44; T2 ตรวจจุดแก้ไม่พบ P0; smoke 3 กรณีผ่าน; ไม่พบปัญหาใหม่ที่ยืนยันได้ระหว่างตรวจ
- `cinema-issues.md`: ไม่มี ID ใหม่หรือปิดเพิ่มเติม; P-01, P-03, P-04, P-06, P-07, P-08, P-12 ยังตามสถานะเดิม; บันทึกข้อจำกัด quota/localStorage ของภาพแนบสำหรับ backend ใน `cinema-v1-summary.md`

---

## รอบที่ 4 — 15 ตุลาคม 2026 · เวอร์ชันที่ทดสอบ 2.0.0 (backend จริง)

### สภาพแวดล้อม / วิธีรัน

- Windows 11, Node.js v24.12.0, Microsoft Edge 155.0.4283.45 (headless ผ่าน Chrome DevTools Protocol)
- ฐานข้อมูล: **PGlite** (Postgres แบบ WASM) แทน Neon — ใช้ schema/SQL ชุดเดียวกัน (`server/db.js` สลับ driver ตาม `DATABASE_URL`); แต่ละชุดทดสอบ seed DB ของตัวเองด้วย `--reset` (`.pglite-test`, `.pglite-test-client`) ไม่แตะ `.pglite` ของ dev
- เซิร์ฟเวอร์: `scripts/dev-server.js` ใช้ handler `api/index.js` ตัวเดียวกับ Vercel; cookie ทดสอบใช้ `COOKIE_INSECURE=1` (http://127.0.0.1)
- คำสั่ง: `npm test` (T1 + unit + T5 + client parity) · `npm run test:smoke` (หลัง `npm run db:seed -- --reset` ด้วย `DATABASE_URL=pglite:./.pglite`)
- **ยังไม่ได้รัน**บน Neon จริงและ Vercel Preview — ต้อง smoke ซ้ำหลัง deploy

### T1 — mock เดิม (ยืนยันการย้ายไฟล์)

- `assets/js/api.js` เดิมย้ายเป็น `assets/js/api-mock.js` ไม่แก้เนื้อหา; `tests/run-tests.js` / `run-tests.html` ชี้ไฟล์ใหม่
- `TZ=Asia/Bangkok node tests/run-tests.js`: **SUMMARY pass=44 fail=0 total=44**

### Unit — เขตเวลา (`tests/time.test.js`) 6/6

- 17:30 UTC = 00:30 วันถัดไปเขตไทย (กรณี P-11 ฝั่ง server ที่ Vercel เป็น UTC), `addDays` ข้ามเดือน/ปี/ปีอธิกสุรทิน, `isISODate`, `toBangkokISO` (`+07:00`), `startsAtISO`, `dateOnly`

### T5 — HTTP API จริง (`tests/api-http.test.js`) 20/20 (~9 วินาที)

| # | เคส | ผล |
| --- | --- | --- |
| 1 | `GET /api/config` คืนวันนี้เขตไทย + ค่าคงที่ + `user: null` | ผ่าน |
| 2 | endpoint ไม่มี 404, เมธอดผิด 405, body ไม่ใช่ JSON 415 (กัน CSRF) | ผ่าน |
| 3 | ไม่เสิร์ฟ `server/`, `scripts/`, `db/`, `.env*`, `package.json` เป็น static | ผ่าน |
| 4 | catalog: รายการ, ค้นหา, coming soon, รายละเอียด, 404 | ผ่าน |
| 5 | รอบเย็น m02 วันนี้เต็ม (fixture จาก seed) จองไม่ได้ | ผ่าน |
| 6 | ทุก endpoint ที่ต้อง login คืน 401 เมื่อไม่มี session | ผ่าน |
| 7 | ผู้ใช้ทั่วไปเรียก `/api/admin/*` ได้ 403 | ผ่าน |
| 8 | register 422 / 201 / 409 (ซ้ำแบบไม่สนตัวพิมพ์) | ผ่าน |
| 9 | login ด้วย username และ email → cookie `HttpOnly; SameSite=Lax`, remember me มี `Max-Age=2592000`; รหัสผิด 401 | ผ่าน |
| 10 | logout แล้ว `me` = 401 และ cookie เดิมใช้ซ้ำไม่ได้ (session ถูกลบใน DB) | ผ่าน |
| 11 | token ปลอม/สุ่มไม่ผ่าน | ผ่าน |
| 12 | เปลี่ยนรหัสผ่าน: ตรวจรหัสเดิม, session อื่นถูกตัด, รหัสใหม่ใช้ได้ | ผ่าน |
| 13 | จอง: server คิดราคาเอง (ไม่สนราคาที่ client ส่ง), ประวัติใน `/api/me/bookings`, ที่นั่งเป็น booked | ผ่าน |
| 14 | จอง: 422 ที่นั่งว่าง/ผิดโรง, 404 รอบไม่มีจริง | ผ่าน |
| 15 | **จองที่นั่งเดียวกันพร้อมกัน 2 คำขอ → 201 หนึ่ง 409 หนึ่ง** พร้อม `conflicts` (P-03) | ผ่าน |
| 16 | promotions: รายการ, รายละเอียด, redeem ถูก/ผิด | ผ่าน |
| 17 | admin คูปอง CRUD + ภาพ magic bytes ไม่ตรงชนิด → 422 "เนื้อหาไฟล์ภาพไม่ตรงกับชนิดภาพ" | ผ่าน |
| 18 | admin หนัง CRUD + ตรวจรอบชนกันในโรงเดียวกัน + ชื่อซ้ำ | ผ่าน |
| 19 | admin บัญชี: guest 48 บัญชี, ค้นหา (`%` ถูก escape), เปลี่ยนสิทธิ์, ห้ามลดสิทธิ์/ลบตัวเอง, ลบแล้วประวัติการจองยังอยู่ | ผ่าน |
| 20 | admin stats: `serviceFeeEstimate = tickets × 30`, ผลรวม byMovie ตรงยอดรวม, daily 14 แถว, `days=7` กรองได้ | ผ่าน |

### Client parity (`tests/api-client.test.js`) 3/3

- โหลด `api.js` (HTTP) และ `api-mock.js` ใน vm แยกกัน: เมธอด/property ครบและชนิดตรงกันทุกตัว
- เรียกทุกเมธอดคู่กัน (รวม `createBooking`) — ผลจาก server มีทุกฟิลด์ที่ mock คืน (หน้าเว็บใช้ฟิลด์เหล่านี้); `api.js` ไม่เขียน localStorage
- error จาก server เป็น `ApiError` รูปแบบเดียวกับ mock: 401 (ข้อความ "ยังไม่ได้เข้าสู่ระบบ"), 409 พร้อม `conflicts`, 403; logout ล้างผู้ใช้และ cookie

### Smoke — เบราว์เซอร์จริง (`tests/smoke-browser.js`) 20/20

ทุกขั้นตรวจว่าไม่มี exception / `console.error` / resource error (ยกเว้น 401 ของ `/api/auth/me` ตอนยังไม่ login และ `favicon.ico` ที่เบราว์เซอร์ขอเอง)

| ขั้น | สิ่งที่ยืนยัน | ผล |
| --- | --- | --- |
| index (guest) | eyebrow + footer "เวอร์ชัน 2.0" | ผ่าน |
| movies | การ์ดหนัง 8 ลิงก์ | ผ่าน |
| movie?id=m02 | ชื่อหนัง + แสดงรอบเต็ม | ผ่าน |
| offers, register | โหลดไม่มี error | ผ่าน |
| bookings (guest) | redirect ไป login | ผ่าน |
| login ผ่านฟอร์ม (ปุ่มกรอก demo) | redirect ออกจาก login; `document.cookie` ไม่เห็น `maison_sid`; CDP ยืนยัน cookie `httpOnly` | ผ่าน |
| seats (m04 พรุ่งนี้) | ผังที่นั่งแสดง เลือก 2 ที่นั่ง (H8, H10) มีปุ่มไป checkout | ผ่าน |
| checkout → ticket | กด "ยืนยันการจอง" ไปหน้า ticket แสดงรหัส (เช่น MAI-MK3J) | ผ่าน |
| checkout ที่นั่งเดิมซ้ำ | หน้าแจ้งว่าที่นั่งไม่ว่าง | ผ่าน |
| bookings | มีประวัติ seed MAI-7Q3F | ผ่าน |
| account | แสดงชื่อผู้ใช้ demo | ผ่าน |
| admin (บัญชี user) | redirect ไป index | ผ่าน |
| logout | cookie ถูกล้าง | ผ่าน |
| login admin → admin | demo-note "ข้อมูลจากฐานข้อมูล", ผู้ใช้ทั้งหมด 50 (ไม่บวก baseline), กดกรอง 7 วันได้ | ผ่าน |
| admin-movies / admin-promotions / admin-accounts | รายการหนัง, คูปอง, บัญชี guest แสดง | ผ่าน |
| localStorage | ไม่มีคีย์ `maison_v1_*` (ว่างทั้งหมด) | ผ่าน |

### บั๊กที่พบและการแก้

- T5 ค้างหลังผ่านครบ — keep-alive socket + PGlite handle เปิดค้าง → `server.closeAllConnections()` + `driver().close()` ใน teardown
- client parity เทียบ object ข้าม realm (vm) ด้วย `deepEqual` ไม่ผ่าน → เทียบผ่าน `JSON.stringify`
- smoke รอบแรก fail 1 ขั้นจาก 404 ของ `favicon.ico` ที่เบราว์เซอร์ขออัตโนมัติ (เว็บไม่มี favicon ตั้งแต่ v1, ไม่ใช่บัค) → ยกเว้นในตัวกรอง error

### สรุปรอบ

- T1 44/44 · unit 6/6 · T5 20/20 · client parity 3/3 · smoke 20/20
- `cinema-issues.md`: ปิด P-03, P-06, P-10, L-1, L-2 · ปิดบางส่วน P-04 · อัปเดต P-05, P-07, P-11 · คงค้าง P-01, P-07, P-08, P-12 · ไม่มี ID ใหม่
- หนี้การทดสอบ: smoke บน Neon + Vercel Preview (รวมอัปโหลดภาพขึ้น Blob จริง), การแนบไฟล์ผ่าน input file ในเบราว์เซอร์, layout มือถือด้วย screenshot, remember me ข้ามการปิดเบราว์เซอร์

---

## รอบที่ 5 — 15 ตุลาคม 2026 · v2.1 (คำนวณส่วนลดที่ checkout, ปิด P-08)

คำสั่ง: `npm test` (T1 + unit + T5 HTTP + client parity) และ `npm run test:smoke` (Edge headless, PGlite, `seed --reset`)

| ชุด | ผล |
| --- | --- |
| T1 mock (`tests/run-tests.js`) | 47/47 (เพิ่ม 3 เคส: redeem แบบ quote, MAISON20/FRIDAY180 ตามวันของรอบ, จองด้วยโค้ดแล้วเก็บ total/discount/promoCode) |
| Unit (`time` + `pricing`) | 19/19 |
| T5 HTTP (`tests/api-http.test.js`) | 24/24 (เพิ่ม EVENINGPAIR, โค้ดผิดเงื่อนไขไม่สร้างการจอง, MAISON20/FRIDAY180 เมื่อมีวันนั้นในช่วงฉาย, โค้ดจาก admin ไม่มีกติกา) |
| Client parity | 3/3 |
| Smoke เบราว์เซอร์ | 21/21 — ขั้นใหม่: ใส่ MAISON20 รอบวันศุกร์ได้ข้อความ 422, ใส่ EVENINGPAIR ยอดรวม 540 (480 + ค่าบริการ 60), กดยืนยัน ตั๋วแสดง "ส่วนลด (EVENINGPAIR)" |

### บัคที่พบและการแก้

- T1 S1 เทียบ `seedVersion` เดิม (4) เมื่อ bump mock เป็น 5 → ปรับ assertion
- ข้อมูลสำรอง `SEED.promotions` ใน `api-mock.js` ไม่มี `rule` (ใช้เมื่อโหลด seed.json ไม่ได้) ทำให้ T1 โค้ดทุกใบตอบ "ยังไม่เปิดให้คำนวณ" → sync กับ `seed.json`
- smoke ขั้นใหม่นับ 422 ของ redeem (ตั้งใจลองโค้ดผิดเงื่อนไข) เป็น error → ยกเว้นเฉพาะ `/api/promotions/redeem` ที่เป็น 422

### สรุปรอบ

- `cinema-issues.md`: ปิด P-08 · ไม่มี ID ใหม่ · คงค้าง P-01, P-04 (บางส่วน), P-07, P-12
- หนี้การทดสอบ: ยังไม่ได้รัน migrate/ทดสอบกับ Neon จริง; MAISON20 (พุธ) ทดสอบแบบมีเงื่อนไข เพราะรอบฉาย 6 วันอาจไม่มีวันพุธ — ส่วนนี้ครอบด้วย unit `tests/pricing.test.js`
