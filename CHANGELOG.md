# CHANGELOG — MAISON เว็บจองตั๋วหนัง

รูปแบบอ้างอิง [Keep a Changelog](https://keepachangelog.com/th-TH/1.1.0/) เวอร์ชันตาม [Semantic Versioning](https://semver.org/lang/th/)

## [1.4.0] — 14 ตุลาคม 2026

### เพิ่ม (Added)
- หน้า `admin-promotions.html` เพิ่ม/แก้/ลบคูปองและแนบภาพผ่านไฟล์; mock API `adminPromotions/adminCreatePromotion/adminUpdatePromotion/adminDeletePromotion` ตรวจสิทธิ์ รหัสซ้ำ รายละเอียดและชนิด/ขนาดภาพ ผลลัพธ์ปรากฏที่หน้าแรกและ `offers.html` ผ่านฐานข้อมูลเดียวกัน
- เพิ่ม regression test CRUD คูปอง, สิทธิ์ guest/user, ภาพที่ไม่ถูกต้อง และพื้นที่ localStorage เต็ม

### เปลี่ยนแปลง (Changed)
- ฟอร์มภาพยนตร์เปลี่ยนจาก path โปสเตอร์เป็นไฟล์แนบ PNG/JPEG/WebP ไม่เกิน 180 KB; modal สูงไม่เกินหน้าจอและเลื่อนเนื้อหาได้; ปรับตำแหน่ง header และ sidebar admin ให้ตรงกัน พร้อมลิงก์คูปองทุกหน้า admin
- อัปเดตเวอร์ชันหน้าแรกและ footer เป็น 1.4 (v1.4), `MAISON.version` เป็น 1.4.0; ข้อมูลยังเป็นระบบสาธิต ไม่มีการคำนวณส่วนลดหรือชำระเงินจริง

### แก้ไข (Fixed)
- ปุ่มเข้าสู่ระบบ/ออกจากระบบใน header พื้นเข้มของหน้าโทนสว่างใช้ตัวอักษรและขอบสว่าง; ปุ่มรองใน modal ใช้ข้อความเข้มบนพื้นสว่าง
- แจ้งข้อผิดพลาดเมื่อ localStorage เต็มแทนการแจ้งว่าบันทึกสำเร็จทั้งที่ข้อมูลหาย; rollback งานเพิ่ม/แก้ภาพและ CRUD คูปองใน memory เมื่อบันทึกไม่สำเร็จ

## [1.3.0] — 14 ตุลาคม 2026

รอบปรับปรุง 3 เรื่องตามคำขอ (ปุ่ม header, ทางลัดบัญชีทดลอง, ระบบรอบฉาย 2 โรง) — สรุปผล: T1 42/42, smoke 17 เคส (ดู `tests/test-log.md` รอบที่ 2)

### เพิ่ม (Added)
- ทางลัดบัญชีทดลองบนหน้า login: ปุ่ม "กรอกบัญชี demo อัตโนมัติ" / "กรอกบัญชีผู้ดูแลระบบ" (`#fill-demo` / `#fill-admin`) พร้อมกล่อง "บัญชีทดลองสำหรับระบบสาธิต"
- `MAISON.dateStrip(container, dates, selected, opts)` — แถบปุ่มเลือกวันฉายใช้ซ้ำได้ (ปุ่ม `date-btn`, วันนอกช่วงฉาย class `out`)
- ชุดทดสอบ T1 เพิ่มเป็น 42 รายการ (เดิม 39) — เพิ่มเคสระบบรอบฉายใหม่ พร้อม helper `refISO()` / `stIdOf()`

### เปลี่ยนแปลง (Changed)
- **ระบบรอบฉายใหม่:** โรงฉาย 2 โรง `hall-01` / `hall-02` (แถว A–H × 12 เท่ากัน); 3 ช่วงเวลา/วัน — เช้า 10:30 · กลางวัน 14:20 · เย็น 19:00 (`PERIODS`); วันฉาย 6 วันนับจากวันนี้ (`SHOW_DAYS`); ตารางรายเรื่องกำหนดโรง + ช่วงเวลา + ช่วงวันที่ (SEED_SCHEDULE ใน api.js แบบ runtime injection เพราะวันที่สัมพัทธ์กับวันนี้ — `assets/data/seed.json` ไม่แก้) — SEED_VERSION 4
- รูปแบบรหัส: รอบ `st-{movieId}-{YYYY-MM-DD}-{morning|afternoon|evening}` · ที่นั่ง `{hallId}-{แถว}{เลข}`; API export เพิ่ม `halls[]` / `periods[]`
- หน้า movies / admin-movies: ตาราง 7 คอลัมน์ (ภาพยนตร์ / ราคา / โรงฉาย / ช่วงวันฉาย / สถานะวันที่เลือก / รอบว่าง / การกระทำ) + badge "มีที่นั่ง" / "รอบเต็ม" / "ไม่มีรอบ"; ฟอร์มแก้ไขหนังเลือกโรง (`#mf-hall`) และช่วงเวลา (`#mf-period`)
- หน้า movie: meta "ช่วงวันฉาย / ช่วงเวลาฉาย / โรงฉาย" + ปุ่มรอบ "รอบ{ช่วงเวลา} · {โรง}" + แถบวัน snap กลับวันแรกที่ยังฉายเมื่อเลยช่วง
- หน้า checkout: เพิ่มบรรทัด "โรงฉาย" และ "รอบ{ช่วงเวลา} เวลา {เวลา} น." ในรายละเอียดการจอง
- เลื่อนเลขเวอร์ชันเป็น "เวอร์ชัน 1.3 (v1.3)" ที่ eyebrow หน้าแรกและ footer ทุกหน้า (`VERSION` 1.3.0 ใน app.js)

### แก้ไข (Fixed)
- **P-13** — ปุ่ม "เข้าสู่ระบบ" แบบ ghost ใน header หน้าโทนเข้ม (index, seats) กลืนกับพื้นหลังเพราะขอบใช้ `--border-dark` (#1D201D) บนพื้น bg-dark (#101211) → เพิ่มกฎ `.theme-dark .btn-ghost` ใช้ขอบทองโปร่งแสง + ตัวอักษร gold
- บั๊กจากการ rewrite api.js: `normalizeSchedule` ถูกวางใน object literal ทำให้ไฟล์ parse ไม่ผ่าน (syntax error) → ย้ายขึ้น IIFE scope ก่อน `var API = {` — จับได้ก่อนปิดรอบด้วย T1

## [1.2.0] — 14 ตุลาคม 2026

รอบทดสอบแรกตามระเบียบ `cinema-testing-formation.md` — สรุปผล: T1 39/39, T2 ผ่านหลังแก้, smoke test 15 เคส (ดู `tests/test-log.md`)

### เพิ่ม (Added)
- ระเบียบการทดสอบ `cinema-testing-formation.md` (ชั้น T1–T4 และเกณฑ์ผ่านของรอบ update) พร้อมชุดทดสอบอัตโนมัติ `tests/run-tests.js` / `tests/run-tests.html` 39 รายการ (S1–S8 ครอบคลุมข้อมูลตั้งต้น, สิทธิ์, สมาชิก, ค้นหา/รอบฉาย, ที่นั่ง/จอง, โปรโมชัน, แอดมิน และเขตเวลา) และบันทึกผลรอบแรกใน `tests/test-log.md`

### แก้ไข (Fixed)
- **P-11** — `todayISO()` อิง `toISOString()` (UTC) ทำให้ช่วงเที่ยงคืน–06:59 น. เขตไทย "วันนี้" เลื่อนเป็นวันถัดไป กระทบ `showDates()`, รอบฉายของวันนี้ และสถิติรายวัน — แทนด้วย `isoDateStr()` ที่อ่านปี/เดือน/วันจากเวลาท้องถิ่น (จับได้ด้วยชุดทดสอบ S8)
- **T2/wiring** — seats.html ขาด `guard:'user'` ทำให้ผู้ไม่ได้ login เข้าหน้าเลือกที่นั่งได้โดยตรง → เพิ่มแล้ว
- **T2** — admin-movies.html ไม่ esc ค่า `price` / `durationMin` ก่อนแทรกใน template ฟอร์มแก้ไขหนัง → เพิ่ม `MAISON.esc()`

### เปลี่ยนแปลง (Changed)
- ย้าย `GENRE_MAP` จาก inline ใน admin-movies.html มาไว้ใน app.js พร้อมส่งออก `MAISON.genreThai()` / `MAISON.genresLabel()` — แสดงชื่อแนวหนังภาษาไทยทุกหน้า (movies, movie, admin, admin-movies)
- เลื่อนเลขเวอร์ชันเป็น "เวอร์ชัน 1.2 (v1.2)" ที่ eyebrow หน้าแรกและ footer ทุกหน้า (`VERSION` 1.2.0 ใน app.js)

## [1.1.0] — 14 ตุลาคม 2026

### แก้ไข (Fixed)
- **P-10** — หน้าที่ต้อง login (account, bookings, checkout, ticket, admin ทั้งสาม) ถูกส่งกลับหน้า login ทั้งที่เข้าระบบแล้ว: session mock เก็บใน `sessionStorage` อย่างเดียว ซึ่งถูกล้างเมื่อ host/iframe สร้าง browsing context ใหม่ทุกครั้งที่เปลี่ยนหน้า (พฤติกรรมของ preview แบบฝัง) — ตอนนี้ `login()` เขียน session ลง `sessionStorage` + localStorage สำรอง (`maison_v1_session_fb`), `currentSession()` อ่านคืนเมื่อ sessionStorage ว่าง และ `logout()` ล้างทั้งสองที่พร้อม remember/cookie
- ครอบการเข้าถึง storage ทั้งหมดด้วย try/catch ผ่าน helper `readStore()` / `writeSession()` / `clearSession()` กันพฤติกรรม sandbox ที่เข้าถึง `window.sessionStorage` โดยตรงแล้ว throw

### เปลี่ยนแปลง (Changed)
- เลื่อนเลขเวอร์ชันเป็น "เวอร์ชัน 1.1 (v1.1)" ที่ eyebrow หน้าแรกและ footer ทุกหน้า (`VERSION` 1.1.0 ใน app.js)

## [1.0.0] — 14 ตุลาคม 2026

เวอร์ชันแรกของ frontend (vanilla JavaScript + mock API) ตามขอบเขตใน `cinema-frontend-plan.md` แสดงเลขเวอร์ชัน "เวอร์ชัน 1 (v1.0)" ที่ footer ทุกหน้า

### เพิ่ม (Added)
- หน้า HTML 14 หน้า: index, login, register, account (?tab=), movies, movie, seats, checkout, ticket, bookings, offers, admin, admin-accounts, admin-movies
- `assets/js/api.js` — mock API ครบทุก endpoint ตามหัวข้อ 5 ของแผน (auth, movies, showtimes, seats, bookings, promotions, admin, health) พร้อม latency จำลองและ `ready` promise
- `assets/js/app.js` — app shell (`MAISON`): esc/baht/วันที่-เวลาภาษาไทย, byId, el, qs, go, toast, dialog, confirm, handleApiError, `init(opts)` รองรับหน้า admin ไม่มี nav/footer
- `assets/css/styles.css` — 22 หมวด, hero gradient fallback, breakpoints 1080/720px
- `assets/data/seed.json` — ข้อมูลสาธิต (หนัง 11 เรื่อง, โปร 3 รายการ, ผู้ใช้ 2 บัญชี) sync กับ embedded seed ใน api.js (SEED_VERSION 3)
- ภาพ SVG 12 ไฟล์ใน `assets/img/` (hero, โปรโมชัน 3, โปสเตอร์ 8) ขนาด 800×1200 ใช้โทนสี design tokens สร้างเองทั้งหมด
- การโหลด seed ผ่าน `XMLHttpRequest` (Rubrics ข้อ 10) โดยมี fetch และ embedded seed เป็น fallback ตามลำดับ
- คำเตือน "การเลือกที่นั่งยังไม่ถูกจองล็อกไว้" บนหน้า seats.html (แผนข้อ 37, P-03)
- `CHANGELOG.md` และ `cinema-v1-summary.md` (เอกสารส่งต่อ backend)

### เปลี่ยนแปลง (Changed)
- ที่นั่งว่างเป็นสีแดง (`--danger #A34A32`, ขอบ `#C77B62`) ตามข้อกำหนดผู้ใช้ — ปรับจากแบบ Figma ที่เป็นขอบครีมบนพื้นเข้ม (P-09) พร้อม legend ปรับตาม
- ฟอร์ม login/register/change-password เปิดใช้ browser validation (ถอด `novalidate`) และเพิ่ม `minlength`/`pattern` (Rubrics ข้อ 3)
- ปุ่มรอบที่ผ่านมาแล้วใช้ class `disabled-look` ที่นิยามใน CSS แล้ว
- เพิ่ม child combinator selector (`.seat-legend > .key`) สำหรับ Rubrics ข้อ 2 (Bonus)
- ข้อมูลโปรโมชัน/การสร้าง id หนังใหม่อ่านจากฐานข้อมูลจำลองแทนค่าคงที่

### ลบออก (Removed)
- `MAISON.draft` (sessionStorage `maison_v1_draft`) และจุดเรียกใช้ทั้งหมด — เป็น dead code เพราะหน้า seats/movie ส่ง state ผ่าน query string

### ความปลอดภัย (Security)
- ผลตรวจ agent ความปลอดภัย: ไม่พบระดับ HIGH/MEDIUM; LOW 3 รายการยอมรับได้สำหรับเดโม (cookie แบบ remember ไม่มี Secure/SameSite, ไม่ validate URL ภาพจาก seed, `st.date` ใน href ถูก constraint ด้วย regex) — รายละเอียดใน `cinema-v1-summary.md`
- เพิ่ม `MAISON.esc()` ให้ค่า `st.date` ที่แทรกใน href บน seats.html

### ขอบเขตที่ตัดออกจาก v1
verify email, QR code, download ticket, watch trailer, timer กันที่นั่ง, การชำระเงินจริง (ไม่รับข้อมูลบัตร)
