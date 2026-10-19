# CHANGELOG — MAISON เว็บจองตั๋วหนัง

รูปแบบอ้างอิง [Keep a Changelog](https://keepachangelog.com/th-TH/1.1.0/) เวอร์ชันตาม [Semantic Versioning](https://semver.org/lang/th/)

## [2.3.0] — 19 ตุลาคม 2026

รอบ Wave 2: กันลบหนังที่มีการจองรอบอนาคต (P-18), กันใช้โค้ดส่วนลดกับรอบที่เริ่มฉายไปแล้ว (P-19), ฟอร์มกำหนดกติกาคูปองฝั่ง admin และแบ่งหน้า (pagination) — สรุปผล: T1 52/52, unit 19/19, T5 HTTP 34/34, client parity 3/3, รวม 108/108 · smoke เบราว์เซอร์ 22/22 (ดู `tests/test-log.md` รอบที่ 9)

### เพิ่ม (Added)
- ฟอร์ม "กติกาส่วนลด" ใน `admin-promotions.html` — 3 ชนิดตรงตามคูปอง seed (`percent_off` ลดตาม %, `bundle_price` ราคารวม, `unit_price` ราคาต่อที่นั่ง) พร้อมเงื่อนไขวันในสัปดาห์/ช่วงเวลา; แสดง/ซ่อนฟิลด์ตามชนิดที่เลือก, กรอกข้อมูลเดิมตอนแก้ไข และคอลัมน์สรุปกติกาในตาราง — **admin กำหนดกติกาคูปองที่สร้างเองได้แล้ว** (ปลดข้อจำกัดเดิม "โค้ดจาก admin ยังไม่มีกติกา ใช้คำนวณไม่ได้ 422")
- `server/validate.js` — ตรวจ `promotionRule`: percent 1–99, bundle 1–100000, unit 1–5000, weekday 0–6, เวลา `HH:MM` และ `timeFrom < timeTo`; `promotions.js` adminCreate/adminUpdate บันทึกคอลัมน์ `rule_*` ด้วย SQL parameter — ความหมายตอนแก้ไข: ไม่ส่ง `rule` = คงกติกาเดิม, `rule: null` = ล้างกติกา; `api-mock.js` ทำเหมือนกันเพื่อ parity
- Pagination (Rubric 8 bonus) ที่ `admin/users`, `admin/movies`, `me/bookings` — ไม่ส่ง `page` = คืน array เดิมทุกประการ (backward compatible); ส่ง `page` = `{items, page, limit, total, totalPages}`; limit clamp 1–100 (default 20), หน้าเกินช่วง snap ไปหน้าสุดท้าย
- `MAISON.pager` — UI ตัวแบ่งหน้าใช้ร่วมกันใน `app.js` เชื่อมที่ `admin-accounts.html`, `admin-movies.html` (ค้นหาแล้วกลับหน้า 1) และ `bookings.html` (pager แสดงแม้รายการหน้านั้นว่าง)
- เคสทดสอบใหม่: P-18 (T5), P-19 (T5 + T1 parity), กติกาคูปอง CRUD + ข้อความ invalid (T5 + T1 parity), pagination 3 endpoint (T5 + T1 parity + client parity), smoke ฟอร์มกติกาผ่าน UI จริง

### เปลี่ยนแปลง (Changed)
- **P-18** — `server/routes/admin.js` `deleteMovie` ปฏิเสธการลบหนังที่มี booking รอบอนาคต → 409 "ลบไม่ได้: มีการจองอยู่ใน N รอบที่ยังไม่ถึงเวลาฉาย (…) กรุณารอจนรอบที่มีการจองฉายไปแล้วจึงจะลบได้ (ระบบยังไม่รองรับการยกเลิกการจอง)"; หนังที่การจองเป็นอดีตแล้วยังลบได้ตามเดิม; helper ของ P-16 แยกเป็น `futureBookedRounds`/`roundLabel`/`roundListText` (พฤติกรรม P-16 เดิมไม่เปลี่ยน ยืนยันด้วยชุดทดสอบเดิม)
- **P-19** — `server/routes/promotions.js` redeem แบบส่ง `showtimeId` ตรวจรอบที่เริ่มฉายไปแล้ว → 422 "รอบนี้เริ่มฉายไปแล้ว ไม่สามารถใช้โค้ดส่วนลดได้ กรุณาเลือกรอบอื่น" (server + mock parity) — ข้อความต่างจากรอบการจอง (P-15) โดยตั้งใจ เพื่อให้ตรงบริบทการใช้โค้ด
- `admin-promotions.html` ส่งเฉพาะฟิลด์ของชนิดกติกาที่เลือก และล้างค่าฟิลด์ที่ซ่อนอยู่เมื่อสลับชนิด (จากผล review — เดิมค่าฟิลด์ที่ซ่อนถูกส่งไปบันทึกด้วย)
- เลขเวอร์ชันเป็น "เวอร์ชัน 2.3 (v2.3)" (`VERSION` 2.3.0 ใน app.js, eyebrow หน้าแรก, footer, package.json)

### แก้ไข (Fixed)
- pagination: `page` เลขหลักยาว (เช่น 9999999999999999999) เคยทำให้ Postgres overflow เป็น 500 — ตอนนี้กันด้วย cap 1e6 แล้วตอบ 200
- `tests/api-http.test.js` (เคส P-16): ย้ายคำสั่งลบหนังทดสอบเข้าไปอยู่ในหน้าต่าง `setNow` อนาคตเดียวกับที่สร้าง booking เพื่อไม่ให้การจองอนาคตของเคสนั้นกลายเป็นอดีตก่อนถูกลบ (เคสจะ time-bomb เมื่อรันตอนเย็น)

## [2.2.0] — 19 ตุลาคม 2026

รอบแก้ปัญหาจากการอ่านโค้ดหลัง deploy (P-12, P-15, P-16, P-17, P-14 บางส่วน) + cron เลื่อนตารางฉายอัตโนมัติ — สรุปผล: T1 49/49, unit 19/19, T5 HTTP 30/30, client parity 3/3, รวม 101/101 · smoke เบราว์เซอร์ 22/22 (ดู `tests/test-log.md` รอบที่ 7)

### เพิ่ม (Added)
- `server/schedule-refresh.js` — ย้ายตรรกะเลื่อนตารางฉายออกจาก `seed.js`: เลื่อนเฉพาะหนัง seed ที่ `date_end` ผ่านวันนี้, ตรวจชนโรง, idempotent, ไม่แตะ `bookings`/หนังที่ admin เพิ่มเอง พร้อมรายงาน moved/skipped
- route `GET /api/cron/refresh-schedule` ใน `api/index.js` — ยืนยันด้วย Bearer `CRON_SECRET` เทียบแบบ timing-safe (sha256 + `timingSafeEqual`, fail-closed 401); `vercel.json` เพิ่ม `"crons"` รายวัน `0 17 * * *` (00:00 เวลาไทย) — ไม่ต้องรัน `--refresh-schedule` มือทุก ~6 วันอีกต่อไป
- `server/time.js` — injectable clock: `setNow()` สำหรับเทสต์ + env `MAISON_NOW` (มี guard ไม่ใช้เมื่อ `VERCEL_ENV=production`) และ `isPast()` ใช้กันจองรอบที่เริ่มไปแล้ว
- เคสทดสอบใหม่ 11+ เคส: P-15 (T1 2 + T5 2), P-16 (T5 1), P-17 (T5 1), P-14 (T5 1), cron (T5 1), P-12 (smoke 1 ขั้น)

### เปลี่ยนแปลง (Changed)
- **P-15** — `POST /api/bookings` ตรวจรอบที่ `startsAt` ผ่านแล้ว → 422 "รอบนี้เริ่มฉายไปแล้ว..." (`server/routes/bookings.js`); `api-mock.js` ทำเหมือนกันเพื่อ parity
- **P-16** — `server/routes/admin.js` เพิ่ม `assertNoAffectedBookings`: แก้โรง/หด `date_end`/ตัดช่วงเวลา/ตั้ง `nowShowing=false` ของหนังที่มี booking รอบอนาคต → 409 "แก้ตารางไม่ได้...มีการจองอยู่ใน N รอบ"; แก้ชื่อ/ราคา/ยืดวันฉาย/booking ที่เป็นอดีตแล้วยังแก้ได้
- **P-12** — `checkout.html` แยกข้อความ "ไม่พบรหัสที่นั่งนี้ในรอบฉาย" (unknown id) ออกจาก "ที่นั่งที่เลือกถูกจองไปแล้ว" (booked); กรณี mixed แสดงทั้งสอง และแสดง id ผ่าน `textContent`
- `scripts/seed.js` — pglite คง `admin123`/`demo123`; เส้นทาง non-pglite อ่าน `ADMIN_PASSWORD`/`DEMO_PASSWORD` จาก env หรือสุ่ม 16 ตัวอักษร (`crypto.randomBytes`) พิมพ์ครั้งเดียวพร้อมคำเตือน; README ระบุว่าบัญชีสาธิตใช้ได้เฉพาะ dev
- `seed --refresh-schedule` เปลี่ยนพฤติกรรม: เดิมเลื่อนทุกเรื่องโดยไม่ตรวจ — ใหม่เลื่อนเฉพาะเรื่องที่หมดวัน + ตรวจชนโรง + รายงาน skipped
- เลขเวอร์ชันเป็น "เวอร์ชัน 2.2 (v2.2)" (`VERSION` 2.2.0 ใน app.js, eyebrow หน้าแรก, footer)

### ความปลอดภัย (Security)
- **P-17** — `POST /api/promotions/redeem` จำกัด 20 ครั้ง/15 นาทีต่อ IP ผ่านตาราง `login_attempts` (identifier `rl:redeem|{ip}`, prefix `rl:` กันชนกับ bucket ของ login) → 429 "ส่งรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง"; login บัญชีจริงยังทำงาน (แยก bucket กัน)
- cron endpoint ตรวจ Bearer secret ทุกคำขอ — ไม่มี/ผิด = 401

## Deploy production — 19 ตุลาคม 2026 (ไม่เปลี่ยนเลขเวอร์ชัน คงเป็น 2.1.0)

ขึ้นระบบจริงครั้งแรกบน Vercel + Neon Postgres — ไม่มีการแก้โค้ดแอป

- รัน `npm run db:migrate` และ `npm run db:seed -- --reset` กับ Neon สำเร็จ: users 50, movies 11, bookings 3,299, seats 8,073 (วันที่ seed 2026-10-19)
- push `main` (`9c9e906`) → Vercel build deployment `maison-cinema-g6rpa9ndm` สถานะ Ready (11 วินาที)
- ตรวจ API บน deployment จริง: `GET /api/config` ตอบ 200 และ `GET /api/movies` ตอบหนังที่กำลังฉาย 8 เรื่องจาก Neon (อีก 3 เรื่องเป็น "เร็ว ๆ นี้")
- ตัวแปร `DATABASE_URL` ตั้งผ่าน Neon integration ใน Vercel (Preview + Production); **ยังไม่ได้ตั้ง** `BLOB_READ_WRITE_TOKEN` จึงแนบภาพโปสเตอร์/คูปองบน production ไม่ได้ (ตอบ 503)
- Vercel Authentication ยังเปิดอยู่ ผู้ที่ไม่ได้ล็อกอิน Vercel เปิดเว็บไม่ได้จนกว่าจะปิดที่ Settings → Deployment Protection
- ผลตรวจโค้ด backend รอบนี้ (อ่านโค้ด ยังไม่ได้ทดสอบยืนยัน) บันทึกเป็น P-14 ถึง P-17 ใน `cinema-issues.md`

## [2.1.0] — 15 ตุลาคม 2026

ปิด P-08: หน้า checkout ใส่โค้ดส่วนลดแล้วเห็นราคาจริง — สรุปผล: T1 47/47, unit 19/19, T5 HTTP 24/24, client parity 3/3, smoke เบราว์เซอร์ 21/21 (ดู `tests/test-log.md` รอบที่ 5)

### เพิ่ม (Added)
- ช่องกรอกโค้ด + ปุ่ม "ใช้โค้ด" + ปุ่มลบโค้ดใน `checkout.html`; แสดงบรรทัด "ส่วนลด (CODE)" และยอดรวมใหม่ก่อนกดยืนยัน; ตั๋ว (`ticket.html`) และประวัติ (`bookings.html`) แสดงส่วนลดที่ใช้
- `server/pricing.js` — ฟังก์ชัน `quote()` คำนวณราคาตามกติกา (วันในสัปดาห์ของรอบ, เวลารอบ, จำนวนที่นั่ง); ผิดเงื่อนไข/ไม่ทำให้ราคาถูกลง/โค้ดไม่มีกติกา ตอบ 422 พร้อมเหตุผลภาษาไทย
- กติกาโค้ดทั้งสาม: `MAISON20` เฉพาะรอบวันพุธ ลด 20% ของค่าตั๋ว · `EVENINGPAIR` พอดี 2 ที่นั่ง รอบ 18:00 ขึ้นไป ตั๋วรวม 480 · `FRIDAY180` รอบวันศุกร์ก่อน 15:00 ตั๋วที่นั่งละ 180 — ใช้ได้ 1 โค้ดต่อ 1 การจอง และไม่ลดค่าบริการ ฿30/ตั๋ว
- DB: `promotions` เพิ่ม `rule_type, rule_value, weekday, time_from, time_to, seat_count`; `bookings` เพิ่ม `promo_code, discount`
- `tests/pricing.test.js` และเคสโค้ดส่วนลดใน T1 / T5 HTTP / smoke เบราว์เซอร์

### เปลี่ยนแปลง (Changed)
- `POST /api/promotions/redeem` รับ `showtimeId` + `seatIds` เพิ่มและคืน `quote` (ส่งแค่โค้ดยังทำงานเหมือนเดิมสำหรับ `offers.html`); `POST /api/bookings` รับ `promoCode` และคืน `discount`, `promoCode`
- `api-mock.js` ทำกติกาเดียวกับ server (`SEED_VERSION` 5); `seed.json` ใส่ `rule` และปรับข้อความเงื่อนไขของโปรทั้งสาม
- เลขเวอร์ชันเป็น "เวอร์ชัน 2.1 (v2.1)" (`VERSION` 2.1.0)

### หมายเหตุการ deploy
- รัน `npm run db:migrate` กับ Neon ก่อน deploy และ `npm run db:seed -- --refresh-schedule` เพื่อใส่กติกาให้โปรเดิม
- โค้ดที่ admin สร้างใหม่ยังไม่มีกติกา — ใช้คำนวณส่วนลดไม่ได้ (422 "โค้ดนี้ยังไม่เปิดให้คำนวณส่วนลด")

## [2.0.0] — 15 ตุลาคม 2026

รอบ backend จริง: deploy เป็นโปรเจกต์ Vercel เดียว (static HTML + Vercel Function `/api` + Neon Postgres + Vercel Blob) — หน้า HTML ใช้ `MAISON_API.*` เหมือนเดิม สลับที่ชั้น API จุดเดียว — สรุปผล: T1 44/44, unit 6/6, T5 HTTP 20/20, client parity 3/3, smoke เบราว์เซอร์ 20/20 (ดู `tests/test-log.md` รอบที่ 4)

### เพิ่ม (Added)
- Backend ใน `api/index.js` (function เดียว + rewrite `/api/:path*` ใน `vercel.json`) และ `server/` — routes `auth`, `catalog`, `bookings`, `promotions`, `admin` คืน shape เดิมของ mock ทุก endpoint และข้อความ error ภาษาไทยเดิม
- ฐานข้อมูล Neon Postgres (`db/schema.sql`): `users`, `sessions`, `login_attempts`, `movies`, `bookings`, `booking_seats` (`UNIQUE(showtime_id, seat_id)` กันจองซ้อน), `promotions` — ทุก query ใช้ parameter `$1…` ไม่ต่อสตริง SQL
- Session จริง: cookie `maison_sid` แบบ `HttpOnly; Secure; SameSite=Lax; Path=/` — เก็บเฉพาะ sha256 ของ token ใน DB, remember me = 30 วัน (`Max-Age`), ไม่ remember = 12 ชม. (session cookie), logout ลบแถว session, เปลี่ยนรหัสผ่านแล้วตัด session อื่นของผู้ใช้; รหัสผ่าน bcrypt; จำกัด login ผิด 10 ครั้ง/15 นาทีต่อชื่อบัญชี (429)
- `GET /api/config` — วันที่วันนี้ตามเขตเวลาไทย (คำนวณที่ server ด้วย `Asia/Bangkok`) + ผู้ใช้ปัจจุบัน + ค่าคงที่โรง/ช่วงเวลา; `api.js` โหลดด้วย `XMLHttpRequest` + `JSON.parse(responseText)`
- ภาพโปสเตอร์/คูปองที่แนบในหน้า admin ตรวจชนิดจาก magic bytes + ขนาด ≤180 KB ที่ server แล้วอัปโหลดขึ้น Vercel Blob เก็บเฉพาะ URL; ลบภาพเก่าเมื่อแทนที่/ลบ; ปฏิเสธ URL ภายนอก
- `scripts/migrate.js`, `scripts/seed.js` (`--reset`, `--refresh-schedule`) — seed หนัง 11 เรื่อง, คูปอง 3 ใบ, บัญชี admin/demo + ลูกค้าตัวอย่าง 48 บัญชี (`guest01`…`guest48`), ที่นั่งถูกจองจริง 28–70% ทุกรอบในช่วง 6 วัน (รอบเย็น The Hollow Choir วันนี้เต็ม) และประวัติการจอง 30 วันย้อนหลัง
- `scripts/dev-server.js` (`npm run dev`) เซิร์ฟ static + `/api` ด้วย handler ตัวเดียวกับ Vercel; รองรับ PGlite (`DATABASE_URL=pglite:./.pglite`) สำหรับเครื่องที่ไม่มี Neon
- `scripts/build.js` (`npm run build`) คัดลอกหน้า HTML + `assets/` ไป `public/` (ไม่รวม `api-mock.js`) — โค้ด server/สคริปต์/schema ไม่ถูกเสิร์ฟเป็นไฟล์ static
- ชุดทดสอบใหม่: `tests/time.test.js` (เขตเวลา), `tests/api-http.test.js` (T5 ยิง HTTP จริง), `tests/api-client.test.js` (เทียบ interface `api.js` กับ mock), `tests/smoke-browser.js` (Edge/Chrome headless ผ่าน CDP)

### เปลี่ยนแปลง (Changed)
- `assets/js/api.js` เดิม (mock + localStorage) ย้ายเป็น `assets/js/api-mock.js` ไม่แก้เนื้อหา — `tests/run-tests.js` / `tests/run-tests.html` ชี้ไฟล์ใหม่
- `assets/js/api.js` ใหม่เป็น HTTP client interface เดิมทุกเมธอด (`mode: 'http'`) ใช้ `fetch(..., { credentials: 'same-origin' })`, คำขอที่แก้ข้อมูลส่ง `Content-Type: application/json` (server ตอบ 415 ถ้าไม่ใช่ — กัน CSRF ร่วมกับ SameSite=Lax), ไม่เขียน localStorage/sessionStorage
- `createBooking` คำนวณราคาที่ server และ insert การจอง+ที่นั่งในคำสั่ง SQL เดียว; ที่นั่งชนตอบ `409` พร้อม `conflicts`
- หน้า admin: สถิติทุกตัวนับจาก DB (เลิกบวก `demoBaselineUsers`), ข้อความกำกับเป็น "ข้อมูลจากฐานข้อมูล (ชุดตัวอย่างจาก seed)"
- เลขเวอร์ชันเป็น "เวอร์ชัน 2.0 (v2.0)" ที่ eyebrow หน้าแรกและ footer ทุกหน้า (`VERSION` 2.0.0 ใน app.js); footer ระบุว่าข้อมูลเป็นชุดตัวอย่างในฐานข้อมูล

### ความปลอดภัย (Security)
- สิทธิ์ user/admin ตรวจที่ server ทุก endpoint (401/403) — การซ่อนเมนูฝั่ง client ไม่ใช่ตัวป้องกันอีกต่อไป; ห้ามลดสิทธิ์/ลบตัวเองและห้ามลบ admin คนสุดท้าย
- ค้นหาบัญชี escape `%` `_` ใน `LIKE`; body JSON จำกัด 1 MB; header `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`; `/api/*` เป็น `Cache-Control: no-store`

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
