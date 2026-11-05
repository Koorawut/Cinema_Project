# สรุปโครงการ — เว็บจองตั๋วหนัง MAISON (frontend v1 + backend v2)

อัปเดต: 5 พฤศจิกายน 2026 (v2.4 — ปิดช่องว่าง Rubric 2/3/5/6 Big Bonus: JS validation, ซ่อน/แสดงตาม viewport, เอกสาร specificity weight, เพิ่ม element เมื่อ load ผ่าน `window.onload`; ดูหัวข้อ 7) · ก่อนหน้า: 21 ตุลาคม 2026 (v2.3 — ปิด P-18, P-19 + ฟอร์มกติกาคูปองฝั่ง admin + แบ่งหน้า; 20 ต.ค. ปิด P-20 — Blob บน production ใช้ได้จริง; 21 ต.ค. เพิ่มเช็คลิสต์ก่อนส่งงานใน §6) · แสดงเลขเวอร์ชัน "เวอร์ชัน 2.4 (v2.4)" ที่ eyebrow หน้าแรกและ footer ทุกหน้า
เอกสารหลัก: `cinema-frontend-plan.md` (สัญญา API หัวข้อ 5, Rubrics หัวข้อ 3.1) · `CHANGELOG.md` · `cinema-issues.md` · `tests/test-log.md`

## 1. สิ่งที่ส่งมอบ

- หน้า HTML 15 หน้า (vanilla JS ไม่ใช้ framework): index, login, register, account, movies, movie, seats, checkout, ticket, bookings, offers, admin, admin-accounts, admin-movies, admin-promotions
- `assets/js/api.js` — HTTP client (`MAISON_API`, `mode: 'http'`) interface เดียวกับ mock เดิมทุกเมธอด; ทุกหน้าเรียกข้อมูลผ่านชั้นนี้เท่านั้น
- `assets/js/api-mock.js` — mock เดิม (localStorage) เก็บไว้ให้ชุดทดสอบ T1 (`tests/run-tests.*`) — **ไม่ถูก deploy**
- `assets/js/app.js` — utilities/UI shell (toast, dialog, confirm, จัดรูปแบบวันที่-เงินภาษาไทย) · `assets/css/styles.css` · `assets/data/seed.json` · `assets/img/*.svg`
- Backend:

| ไฟล์ | หน้าที่ |
| --- | --- |
| `api/index.js` | Vercel Function เดียว — router ของ `/api/*` ทั้งหมด (rewrite ใน `vercel.json`) |
| `server/http.js` | `ApiError`, ตอบ JSON, อ่าน body (≤1 MB), cookie, บังคับ `Content-Type: application/json` สำหรับคำขอที่แก้ข้อมูล (415) |
| `server/auth.js` | bcrypt, session (token สุ่ม 32 ไบต์ เก็บ sha256 ใน DB), `requireUser` / `requireAdmin`, จำกัด login ผิด |
| `server/db.js` | Neon (`@neondatabase/serverless`) หรือ PGlite เมื่อ `DATABASE_URL=pglite:…` |
| `server/time.js` · `server/schedule.js` · `server/schedule-refresh.js` | วันที่เขตเวลาไทย (v2.2: injectable clock + `isPast()`) · โรง/ช่วงเวลา/ค่าบริการ/id รอบฉาย และตรวจตารางฉายชนกัน · เลื่อนตารางหนัง seed ที่หมดวัน (ใช้กับ cron) |
| `server/validate.js` · `server/images.js` · `server/movies.js` | ตรวจฟอร์ม (ข้อความ error เดิม) · ภาพขึ้น Vercel Blob · สถานะรอบ/ที่นั่งจาก DB |
| `server/routes/*.js` | `auth`, `catalog`, `bookings`, `promotions`, `admin` |
| `db/schema.sql` | DDL (idempotent) |
| `scripts/` | `migrate.js`, `seed.js`, `dev-server.js`, `build.js`, `env.js` (โหลด `.env.local`) |

## 2. สถาปัตยกรรม

```
Browser (หน้า HTML) ── MAISON_API (assets/js/api.js)
        │  XHR: GET /api/config · fetch: ที่เหลือ · cookie maison_sid (HttpOnly)
        ▼
Vercel: /api/:path*  → rewrite → api/index.js → server/routes/*.js
        ├── Neon Postgres (DATABASE_URL)
        └── Vercel Blob (BLOB_READ_WRITE_TOKEN) — ภาพที่ admin แนบ
Static: npm run build คัดลอก *.html + assets/ → public/ (outputDirectory)
```

- รอบฉายไม่มีตาราง — คำนวณจาก "ตารางฉายต่อเรื่อง" ในตาราง `movies` (`hall_id`, `date_start`, `date_end`, `periods`) ด้วย id `st-{movieId}-{YYYY-MM-DD}-{morning|afternoon|evening}`; ที่นั่ง `{hallId}-{แถว}{เลข}`; ผังโรงเป็นค่าคงที่ใน `server/schedule.js`
- กันจองซ้อน: `booking_seats UNIQUE(showtime_id, seat_id)` + insert การจองและที่นั่งในคำสั่ง SQL เดียว (CTE) → ชนแล้วตอบ `409` + `conflicts` (P-03)
- เวลาทั้งหมดส่งเป็น ISO 8601 `+07:00` (Asia/Bangkok); "วันนี้" คำนวณที่ server ไม่อิงนาฬิกาเครื่องผู้ใช้ (P-11)
- นโยบายลบ: ลบบัญชี → การจองยังอยู่ (`user_id` เป็น NULL); ลบหนัง → การจองยังอยู่ (`movie_id` เป็น NULL) และแสดงชื่อ/ราคา/รอบจาก snapshot ในตาราง `bookings`

## 3. ข้อมูลสาธิต (seed เป็นแถวจริงใน DB)

- บัญชี: `admin/admin123` (role admin), `demo/demo123` (role user) — ใช้ได้เฉพาะเครื่อง dev/pglite (v2.2: seed เส้นทาง non-pglite ใช้ `ADMIN_PASSWORD`/`DEMO_PASSWORD` จาก env หรือสุ่ม — P-14); หน้า login มีปุ่มกรอกทั้งสองบัญชีอัตโนมัติ; ลูกค้าตัวอย่าง `guest01`…`guest48` (รหัสผ่านสุ่ม ไม่ได้ใช้ login) รวม 50 บัญชี
- หนัง now showing 8 เรื่อง + coming soon 3 เรื่อง (m09–m11) · คูปอง 3 ใบ (MAISON20, EVENINGPAIR, FRIDAY180)
- ราคาบัตร ฿200–฿300 · ค่าบริการ ฿30/ตั๋ว · 2 โรง (`hall-01`/`hall-02` แถว A–H × 12) · 3 ช่วงเวลา (10:30 / 14:20 / 19:00) · วันฉาย 6 วันนับจากวันนี้
- ที่นั่งถูกจองจริงโดยบัญชี guest 28–70% ของทุกรอบ (PRNG deterministic เดิม) · รอบเย็น The Hollow Choir (m02) วันนี้เต็ม · ประวัติการจองย้อนหลัง 30 วัน ให้กราฟ/ตารางหน้า admin มีข้อมูล
- การจองของ demo: MAI-7Q3F (Orbit 9, hall-01, E7+E8) และ MAI-2K8D (Bangkok Bank Run, hall-02, C4)
- ตัวเลขหน้า admin ทุกตัวนับจาก DB จริง (ไม่มีตัวเลขบวกเพิ่ม) แต่เป็นชุดตัวอย่างจาก seed — หน้าเว็บติดป้ายกำกับไว้แล้ว
- **ข้อจำกัด:** วันฉายเก็บเป็นวันที่ตายตัวตอน seed — v2.2 เป็นต้นไป cron รายวัน (`/api/cron/refresh-schedule`) เลื่อนช่วงวันฉายของหนัง seed ที่หมดวันให้อัตโนมัติ (ต้องตั้ง `CRON_SECRET`); รัน `npm run db:seed -- --refresh-schedule` ด้วยมือได้เมื่อต้องการเลื่อนทันที หรือแก้ช่วงวันในหน้า admin-movies (แก้/ลบตารางที่กระทบ booking รอบอนาคตโดน 409 ตั้งแต่ v2.2 — P-16)

## 4. ที่เก็บข้อมูล

| ที่เก็บ | เนื้อหา |
| --- | --- |
| Neon Postgres | `users`, `sessions`, `login_attempts`, `movies`, `bookings`, `booking_seats`, `promotions` (`db/schema.sql`) |
| Vercel Blob | ภาพโปสเตอร์/คูปองที่ admin แนบ (`posters/`, `promotions/`) — DB เก็บ URL; ภาพ seed อยู่ที่ `assets/img/` |
| cookie `maison_sid` | session token (HttpOnly; Secure; SameSite=Lax; Path=/) — remember me = `Max-Age` 30 วัน, ไม่ remember = session cookie + หมดอายุใน DB 12 ชม. |
| localStorage / sessionStorage | **ไม่ใช้แล้ว** — คีย์ `maison_v1_*` เป็นของ `api-mock.js` เท่านั้น |

## 5. ผลตรวจ

- v1 (frontend): ผลตรวจฟังก์ชัน/ความปลอดภัยและการทดสอบรอบที่ 1–3 ดู `tests/test-log.md` · สีที่นั่งยึดข้อกำหนดผู้ใช้ (P-09, `design-tokens.md`)
- **v2.0 (รอบที่ 4):** T1 mock 44/44 · unit เขตเวลา 6/6 · T5 HTTP 20/20 (401/403/415, cookie flags, logout/replay, จองพร้อมกันได้ 201 หนึ่ง 409 หนึ่ง, CRUD หนัง/คูปอง/บัญชี, ภาพ magic bytes ผิด 422, สถิติตรงผลรวม DB) · client parity 3/3 · smoke เบราว์เซอร์ Edge headless 20/20 ครบ 15 หน้า (login → รอบ → ที่นั่ง → checkout → ตั๋ว → ประวัติ, admin ทั้ง 4 หน้า, cookie HttpOnly, localStorage ว่าง)
- ชุดทดสอบอัตโนมัติทั้งหมดรันกับ PGlite ในเครื่อง; **19 ต.ค. 2026** migrate + seed บน Neon จริงสำเร็จและตรวจ `/api/config`, `/api/movies` บน deployment จริงแล้ว (ดู `tests/test-log.md` รอบที่ 6) และรัน smoke ผ่านบน production แล้วในรอบที่ 8 (หัวข้อถัดไป); ยังไม่ได้ทดสอบ: remember me ข้ามการปิดเบราว์เซอร์, layout มือถือด้วย screenshot (แนบภาพบน production ตรวจผ่าน API จริงแล้วรอบที่ 11 — ดูหัวข้อถัดไป)
- **v2.2 (รอบที่ 7):** แก้ P-12, P-15, P-16, P-17 + P-14 ฝั่งโค้ด + cron เลื่อนตารางฉาย — T1 49/49 · unit 19/19 · T5 30/30 · client parity 3/3 · รวม 101/101 · smoke 22/22; เปิดใหม่ P-18 (ลบหนังที่มี booking อนาคต), P-19 (redeem ไม่เช็ค isPast); P-14 รอเปลี่ยนรหัส admin บน production
- **v2.2 บน production (รอบที่ 8, 19 ต.ค. 2026):** Cluster Head ยิง curl ตรงกับ production `maison-cinema-7l15vd2oq-ai-test-project1.vercel.app` — **smoke ผ่าน 14/14**: `/api/config` + `/api/movies` 200 จาก Neon, เวอร์ชัน "2.2 (v2.2)", cron ไม่มี/ผิด Bearer → 401 (fail-closed), สมัคร/login/`me` (บัญชี `qa_prod_1`), จองรอบที่เริ่มไปแล้วถูกปฏิเสธ (P-15), จองรอบอนาคตสำเร็จ (`MAI-G92Z`), จองซ้ำ → 409 + `conflicts`, แก้โรง → 409 / แก้ราคา → 200 (P-16), 403/401 บน admin endpoint, cookie `HttpOnly; Secure; SameSite=Lax`, สถิติตรง DB (ผู้ใช้ 52, การจอง 3,302) — ของทดสอบ `qa_prod_1`/`MAI-G92Z` ฝากไว้ใน DB เป็นหลักฐาน
- **v2.3 (รอบที่ 9):** ปิด P-18 (ลบหนังที่มี booking รอบอนาคต → 409), P-19 (redeem รอบที่เริ่มฉายไปแล้ว → 422) + ฟอร์มกำหนดกติกาคูปองฝั่ง admin + pagination — T1 52/52 · unit 19/19 · T5 34/34 · client parity 3/3 · รวม 108/108 · smoke 22/22
- **v2.3 บน production (รอบที่ 10, 19 ต.ค. 2026):** A3 ยิง curl ตรงกับ production `maison-cinema-gu8a58vn5-ai-test-project1.vercel.app` — **smoke ผ่าน 8/8 กลุ่มเคส**: `/api/config` + `/api/movies` 200 จาก Neon, เวอร์ชัน "2.3 (v2.3)", cron ไม่มี/ผิด Bearer → 401 (fail-closed), สมัคร/login/`me` (บัญชี `qa_prod_2`), P-18 (ลบหนังที่มี booking รอบอนาคต → 409 ข้อความเต็ม, ไม่มีการจอง → ลบได้), P-19 (redeem รอบที่เริ่มไปแล้ว → 422 / รอบอนาคต → 200 quote ตรงสูตร), กติกาคูปอง (PATCH เปลี่ยน/ล้าง/คงกติกา), pagination (รูปร่าง 2 แบบ, snap หน้า, `page` เลขหลักยาว → 200, `limit` clamp), จองอนาคต `MAI-MWC8` + จองซ้ำ → 409 + `conflicts` — ของทดสอบ `qa_prod_2`/`m12`/`MAI-MWC8` ฝากไว้ใน DB เป็นหลักฐาน (ลบ `m12` ไม่ได้โดยออกแบบจนพ้นรอบ 2026-10-26 10:30)
- **Blob บน production (รอบที่ 11, 20 ต.ค. 2026):** หลังแก้ปัญหา Blob 503 (store เดิมเป็น Private + token ชี้ store ที่ถูกลบ → สร้าง store ใหม่ `maison-images` แบบ Public + token ใหม่ แล้ว deploy ใหม่ `l2dn7wn7t`) — ตรวจด้วย curl ตรง **ผ่าน 5/5**: login 200, สร้างคูปอง `QABLOB2` พร้อมภาพ PNG → 201 และ image เป็น Blob URL จริง, GET ภาพจาก URL สาธารณะ (ไม่ login) → 200 `image/png`, ลบคูปองทดสอบ → 200, DB เหลือคูปอง seed 3 ใบตามเดิม — **ปิดปัญหา Blob บน production แล้ว: แนบภาพใช้ได้จริง** (P-20 ปิด; ดู `tests/test-log.md` รอบที่ 11)
- **v2.4 (รอบที่ 12, 5 พ.ย. 2026):** ปิดช่องว่าง Rubric Big Bonus ข้อ 2/3/5 + `window.onload` ข้อ 6 — T1 52/52 · unit 19/19 · T5 34/34 · client parity 3/3 · รวม **108/108** · smoke **22/22** รวมเคสใหม่ password-mismatch (บล็อกก่อนถึง API 0 คำขอ + ส่งถูกยิงจริง 1 ครั้ง); ตรวจ window.onload เพิ่มเติม 10/10 (single-fire, readyState guard ทำงาน) — ดู `tests/test-log.md` รอบที่ 12 และหลักฐานเต็มหัวข้อ 7 ด้านล่าง

## 6. เงื่อนไขที่ยังค้าง (ส่งต่อรอบถัดไป)

- Pagination (Rubric 8 bonus) — **ทำแล้วใน v2.3**: `admin/users`, `admin/movies`, `me/bookings` รับ `?page=&limit=` (ไม่ส่ง = array เดิม, ส่ง = `{items,page,limit,total,totalPages}`, limit clamp 1–100 default 20, หน้าเกิน snap หน้าสุดท้าย) พร้อม UI `MAISON.pager`
- ฟอร์มกติกาคูปอง — **ทำแล้วใน v2.3**: admin กำหนดกติกาส่วนลด (3 ชนิดตาม seed: percent_off / bundle_price / unit_price + วันในสัปดาห์/ช่วงเวลา) ตอนสร้าง/แก้คูปองได้จากหน้า `admin-promotions.html` — โค้ดที่ admin สร้างเองคำนวณส่วนลดได้แล้ว (ปิดข้อจำกัดท้าย P-08)
- **P-14 (ยอมรับความเสี่ยง):** โค้ด seed แก้ครบใน v2.2 (บัญชีสาธิตใช้ได้เฉพาะ dev) แต่ผู้ใช้ตัดสินใจไม่เปลี่ยนรหัส `admin` บน production และไม่ reset รหัสผ่าน Neon DB เพราะเป็นโปรเจกต์เรียน ไม่มีผู้ใช้จริง — หากวันหน้าเปิดใช้จริง ให้เปลี่ยนรหัสผ่านก่อน
- P-04 นิยามการนับ visitor (ตอนนี้ไม่มีตารางนับผู้เข้าชม) · P-07 ข้อมูล/ภาพจริง · P-01 ตรวจภาพจริงรายหน้า · ปิดแล้วในรอบก่อน: P-03, P-06, P-08, P-10, P-12, P-15, P-16, P-17, P-18, P-19, P-20
- Rubric 1 (wireframe/architecture) — ยังต้องถามผู้สอนว่าส่งไฟล์แยกหรืออ้างหัวข้อ 2 ของไฟล์นี้ + แผนได้ (รวมเป็นข้อถามแล้วในหมวด "คำถามที่ต้องถามผู้สอน" ของ `cinema-issues.md`)
- Rubric 9 — cookie เป็น HttpOnly จึงแสดง session ID ฝั่ง JS ไม่ได้ (ตั้งใจ); หลักฐานวงจร session ใช้ DevTools → Application → Cookies + ตาราง `sessions` แทน — ควรยืนยันกับผู้สอน (รวมเป็นข้อถามแล้วในหมวด "คำถามที่ต้องถามผู้สอน" ของ `cinema-issues.md`)

### เช็คลิสต์งานที่เหลือก่อนส่งงาน (อัปเดต 21 ต.ค. 2026)

| งาน | กำหนด/เงื่อนไข | สถานะ/หมายเหตุ |
| --- | --- | --- |
| ตรวจ cron เลื่อนตารางฉายครั้งแรก | **22 ต.ค. 2026** (หลังรอบ cron 00:00 เขตไทย) | m03 (Bangkok Bank Run) หมดวันฉาย 21 ต.ค. — ถ้า cron ทำงาน ตารางต้องถูกเลื่อนอัตโนมัติ; วันที่ 20 ต.ค. ยังตรวจไม่ได้เพราะไม่มีหนังเลยวัน (ทุกเรื่องฉายถึง 21 ต.ค. ขึ้นไป) |
| เก็บกวาดของทดสอบใน Neon | **หลัง 26 ต.ค. 2026 10:30** (พ้นรอบฉายของ `m12`) | ลบหนัง `m12` "QA Prod P18 Reel" + ตั๋ว `MAI-MWC8` (ตอนนี้ลบไม่ได้โดยออกแบบ — guard P-18); บัญชี `qa_prod_1`/`qa_prod_2` ลบได้จากหน้า admin ตลอด ไม่ต้องรอ |
| P-01 ภาพหลักฐานรายหน้า (มือถือ + เดสก์ท็อป) | แนะนำทำใกล้วันส่ง | เพื่อให้ภาพหลักฐานตรงกับเวอร์ชันสุดท้ายของหน้าเว็บ |
| Rubric Big Bonus ที่เหลือ (ข้อ 2/3/5) | **ปิดแล้วใน v2.4 (5 พ.ย. 2026)** | JS validation ก่อนส่งฟอร์ม (ข้อ 3) + ซ่อน/แสดงตาม viewport (ข้อ 5) + เอกสาร specificity weight (ข้อ 2) + เพิ่ม element เมื่อ load ผ่าน `window.onload` ตรงถ้อยคำเกณฑ์ (ข้อ 6) — หลักฐานเต็มและวิธีสาธิตอยู่หัวข้อ 7 ของไฟล์นี้; ข้อ 4/6/7/8/9/10/11 Big Bonus มีหลักฐานก่อนหน้าแล้ว (ข้อ 6 — แสดง/ซ่อนตามฟอร์มผ่าน `getElementById()`: `account.html` แท็บบัญชี, `admin-promotions.html` ฟอร์มกติกา ดู §7.4) |
| P-04 (นิยาม visitor) + P-07 (ข้อมูล/ภาพจริง) | รอคำตอบผู้สอน | รวบรวมเป็นข้อถามแล้วในหมวด "คำถามที่ต้องถามผู้สอน" ของ `cinema-issues.md` (รวม Rubric 1 และ Rubric 9 ด้วย) |
| Accepted-risk ที่จดแล้ว | — | P-14 (รหัส `admin123` บน production) · Blob token (เคยแสดงใน terminal) — เหตุผลเดียวกัน: โปรเจกต์เรียน ไม่มีผู้ใช้จริง; หากวันหน้าเปิดใช้จริง ให้เปลี่ยนรหัสผ่าน/สร้าง store-token ใหม่ |

## 7. หลักฐาน Rubric Big Bonus — รอบปิดช่องว่าง v2.4 (5 พฤศจิกายน 2026)

รอบนี้ปิดช่องว่าง Big Bonus ที่เหลือของ Rubrics ข้อ 2, 3, 5 และเพิ่ม load-event wrapper ตรงถ้อยคำ `window.onload` ของข้อ 6 (ข้อ 4, 6, 7, 8, 9, 10, 11 มีหลักฐานก่อนหน้าแล้ว — ข้อ 6: การแสดง/ซ่อน element ตามฟอร์มผ่าน `getElementById()` มีมาก่อน, รอบนี้เพิ่มส่วน "เพิ่ม element เมื่อ load" ให้ตรงตัวและรวมหลักฐานใน §7.4) — แต่ละหัวข้อด้านล่างเขียนให้ครบ "เกณฑ์ของ Rubric → สิ่งที่ทำ → ตำแหน่งในไฟล์ → วิธีสาธิตสด" เพื่อยกไปใช้ในรายงานส่งงานได้โดยตรง

### 7.1 หลักฐาน Specificity Weight (Rubric 2 Big Bonus)

**เกณฑ์:** อธิบายลำดับการ override ของ CSS selector ด้วยหลัก specificity weight

**หลักการ:** CSS ตัดสินกันด้วย "คะแนนจำเพาะ" (specificity) ก่อนลำดับการเขียนเสมอ — selector ที่จำเพาะกว่าชนะแม้เขียนไว้ก่อน (แพ้เฉพาะ `!important` และ inline style) เขียนแทนเป็นสามช่อง `(id, class, type)`:

1. **inline style** (`style="..."`) สูงสุด — บน element โดยตรง
2. **id selector** (`#toast-root`) — ช่องที่ 1 ของสามช่อง
3. **class / attribute / pseudo-class** (`.btn-ghost`, `[aria-current="page"]`, `:hover`, `:not(...)`) — ช่องที่ 2; `:not()` เองไม่มีคะแนน แต่ **argument ข้างในถูกนับ**
4. **type selector / pseudo-element** (`button`, `h3`, `::before`) — ช่องที่ 3 (ต่ำสุด)

ตัวอย่างการอ่านค่า: `.btn-ghost:hover:not(:disabled)` = class 1 (`btn-ghost`) + pseudo-class 2 (`:hover`, `:disabled` ที่เป็น argument ของ `:not()`) = **(0,3,0)**; `h1` = **(0,0,1)**; `#mf-sched.sched-off` = **(1,1,0)**

**ตัวอย่าง override จริงจาก `assets/css/styles.css`:**

1. **`.btn-ghost:hover:not(:disabled)` (บรรทัด 168) แพ้ `.theme-dark .btn-ghost:hover:not(:disabled)` (บรรทัด 171)**
   - ต้นกำเพาะ: (0,3,0) — `.btn-ghost` + `:hover` + `:disabled` (argument ของ `:not`)
   - ที่ชนะ: (0,4,0) — เพิ่ม `.theme-dark` อีก 1 class
   - ทั้งคู่ตั้ง `color` และ `border-color`; เมื่ออยู่ใน `<body class="theme-dark">` กฎบรรทัด 171 ชนะเพราะมี class-level weight มากกว่า (4 > 3) **แม้เขียนไว้ทีหลังหรือก่อนก็ไม่เกี่ยว** — นี่คือแก้ปัญหา P-13 ที่ปุ่ม ghost กลืนกับพื้นหลังเข้ม: เพิ่ม specificity ด้วยการนำหน้าด้วย class ธีม แทนการใช้ `!important`
2. **`.main-nav a:hover` (บรรทัด 117) แพ้ `.main-nav a[aria-current="page"]` (บรรทัด 118)**
   - `.main-nav a:hover` = (0,1,1) — class 1 + type 1
   - `.main-nav a[aria-current="page"]` = (0,2,1) — class 1 + attribute 1 + type 1
   - ลิงก์หน้าปัจจุบันในเมนู (`aria-current="page"` ตั้งโดย `app.js`) ติดขอบล่างสีทองเสมอแม้เอาเมาส์ชี้ เพราะ attribute selector ให้น้ำหนักระดับเดียวกับ class ทำให้ (0,2,1) > (0,1,1)
3. **`.input, .select, textarea.input` (บรรทัด 196) แพ้ `.theme-dark .input, ...` (บรรทัด 202)**
   - `textarea.input` = (0,1,1); `.theme-dark .input` = (0,2,0)
   - ช่องกรอกบนธีมเข้ม (movies.html — ช่องค้นหา, หน้า theme-dark เดียวที่มี element `.input`) เปลี่ยนพื้นหลังเป็นสีเข้มเพราะกฎ `.theme-dark .input` จำเพาะกว่า — เป็นรูปแบบเดียวกับตัวอย่างที่ 1 (theme prefix)

**เหตุผลที่กฎที่แพ้:** CSS เปรียบเทียบ (id, class, type) จากซ้ายไปขวาทีละช่อง — ช่องซ้ายสูงกว่าชนะทันที; ชนะเท่ากันทุกช่องจึงดูลำดับการเขียน (ทีหลังชนะ) กฎ "ทีหลัง" จึงมีผลเฉพาะเมื่อ specificity เท่ากันเท่านั้น

**วิธีสาธิตสด:** เปิดหน้าแรก (ธีมเข้ม) → DevTools เลือกปุ่ม hero รอง `#hero-second-btn` ("สมัครสมาชิก", `index.html` บรรทัด 22 — อยู่ใน `main` ไม่ได้อยู่ใน `.site-header`) → ตั้ง state `:hover` ในแท็บ Styles → จะเห็น `.btn-ghost:hover:not(:disabled)` ถูกขีดฆ่าโดย `.theme-dark .btn-ghost:hover:not(:disabled)` (กฎบรรทัด 171 คือตัวชนะ) พร้อมค่าจากกฎที่ชนะ — หมายเหตุ: อย่าใช้ปุ่ม "เข้าสู่ระบบ" ใน header เพราะชนะด้วยกฎ `.site-header .btn-ghost:hover:not(:disabled)` (บรรทัด 178) ซึ่ง specificity เท่ากัน (0,4,0) แต่เขียนทีหลัง ไม่ใช่กฎบรรทัด 171; หรือชี้เมาส์เมนูหน้าปัจจุบันแล้วดูว่าสีขอบทองคงอยู่ (ตัวอย่างที่ 2)

### 7.2 หลักฐานตรวจสอบฟอร์มด้วย JS (Rubric 3 Big Bonus)

**เกณฑ์:** นอกเหนือจาก built-in validation (`required`/`pattern` — เป็นหลักฐาน Bonus อยู่แล้ว) ต้อง "ใช้ JS ตรวจสอบ"

**สิ่งที่ทำ (v2.4):** เพิ่มการตรวจใน submit handler ก่อนเรียก API ทั้ง 2 ฟอร์ม — attribute `required`/`minlength`/`pattern` เดิมคงไว้ทั้งหมด:

- `register.html` (script ท้ายไฟล์, ใน `form.addEventListener('submit', ...)`)
  - **(ก) รหัสผ่านไม่ตรงกัน:** เทียบ `#password` กับ `#confirmPassword` — ไม่ตรง → `errBox.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณากรอกใหม่'`, `errBox.hidden = false` แล้ว `return` (ไม่ส่งคำขอ; ปุ่มไม่ติดสถานะ "กำลังสร้างบัญชี...") — built-in ตรวจกรณีนี้ไม่ได้เพราะเป็นการเทียบสองช่อง
  - **(ข) รูปแบบไม่ผ่าน:** `form.checkValidity()` ไม่ผ่าน → หาช่อง `:invalid` ตัวแรกแล้วแสดง `title` ของช่องนั้น (ข้อความไทยที่เขียนไว้ เช่น "ใช้ตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ ความยาว 3–20 ตัวอักษร") แทนการพึ่ง bubble ของ browser
- `account.html` (ฟอร์มเปลี่ยนรหัสผ่าน `#password-form`) — รูปแบบเดียวกัน: `#newPassword` ≠ `#confirmNewPassword` → "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน กรุณากรอกใหม่" ใน `#pw-error`, ไม่ส่งคำขอ; และ `checkValidity()` เหมือนกัน
- ทั้งสองใช้ `textContent` (ไม่ใช่ innerHTML) จึงไม่ต้อง escape — ปฏิบัติตามแนวทางเดิมของโค้ด
- backend ยังตรวจซ้ำทุกกรณีเหมือนเดิม (`server/validate.js`) — JS เป็นชั้นแรกเพื่อ UX ไม่ใช่ตัวกันหลัก

**วิธีสาธิตสด (ยกไปใส่รายงานได้เลย):**
1. เปิด `register.html` → กรอกข้อมูลครบ แต่กรอกรหัสผ่านกับยืนยันไม่ตรงกัน → กด "สมัครสมาชิก" → **เกิดแถบแดง "รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณากรอกใหม่" ทันทีโดยไม่มีคำขอออกไปที่ server** (ดูแท็บ Network = ไม่มี request)
2. DevTools → Console พิมพ์ `document.getElementById('register-form').noValidate = true` (ปิด built-in ชั่วคราว) → กรอก username เป็นภาษาไทย → กดส่ง → ได้ข้อความไทยจาก JS ("รูปแบบข้อมูลยังไม่ถูกต้อง — ใช้ตัวอักษรภาษาอังกฤษ...") แสดงว่า JS ตรวจเองจริง ไม่ได้พึ่ง browser UI — แล้วรีเฟรชหน้าคืนค่าเดิม
3. `account.html?tab=password` → กรอก "ยืนยันรหัสผ่านใหม่" ไม่ตรง → กด "เปลี่ยนรหัสผ่าน" → แถบแดงใน `#pw-error` ไม่มีคำขอออก

### 7.3 หลักฐานซ่อน/ปรากฏ Element ตามขนาดการแสดงผล (Rubric 5 Big Bonus)

**เกณฑ์:** มี element ที่ซ่อนบนขนาดจอหนึ่งและกลับมาแสดงบนอีกขนาด (ไม่ใช่แค่จัด layout ใหม่)

**สิ่งที่ทำ (v2.4):** ใน `@media (max-width: 720px)` ของ `assets/css/styles.css` (ท้ายบล็อก, หลังกฎ `.seat` บรรทัด ~704) เพิ่ม 2 กฎ พร้อมคอมเมนต์ไทยระบุว่าเป็นหลักฐาน Rubric 5 Big Bonus:

- `.hero-meta { display: none; }` — แถวสถิติย่อบน hero หน้าแรก ("N เรื่องกำลังฉาย / N เรื่องจะมา / N โปรโมชัน", element `#hero-meta` ใน `index.html` บรรทัด 24) — เป็นข้อมูลประกอบไม่ใช่ทางเข้าใช้งานหลัก บนมือถือพื้นที่แนวตั้งจำกัด ซ่อนเพื่อให้ title และปุ่ม CTA ("ดูภาพยนตร์ทั้งหมด") ขึ้นมาเห็นเร็วขึ้น; บนเดสก์ท็อปกลับมาแสดงตามกฎปกติ `.hero-meta { display: flex }` (บรรทัด 302 — ตรวจแล้วว่ากฎ desktop ไม่ได้ตั้ง `display: none` อยู่แล้ว)
- `.coming-card .small.muted { display: none; }` — บรรทัดเรื่องย่อ (synopsis) ในการ์ดหัวข้อ "กำลังจะมาถึง" (สร้างโดย script หน้า index: `E('p', 'small muted', m.synopsis)`) — ข้อความยาว 2–3 บรรทัดทำให้การ์ดสูงและต้องเลื่อนเยอะบนจอแคบ; ผู้ใช้ยังเห็นชื่อเรื่อง/แนว/วันเข้าฉาย และเรื่องย่อเต็มดูได้ในหน้ารายละเอียดของหนังเมื่อเข้าฉาย; บนเดสก์ท็อปแสดงตามปกติ

**วิธีสาธิตสด:** เปิดหน้าแรกบนเดสก์ท็อป → เห็นแถวสถิติใต้ปุ่ม hero และเรื่องย่อในการ์ด "กำลังจะมาถึง" → DevTools กด Toggle device toolbar เลือกจอกว้าง ≤ 720px (เช่น 390px) → ทั้งสองหายไป → ปิด toolbar กลับมาแสดง — หรือลากหน้าต่างเบราว์เซอร์แคบลง/กว้างขึ้นก็เห็นเช่นกัน

### 7.4 หลักฐานเพิ่ม Elements เมื่อ load ผ่าน window.onload (Rubric 6 Bonus — ตรงถ้อยคำเกณฑ์)

**เกณฑ์:** "เพิ่ม Elements เมื่อ load" — โบนัสของข้อ 6 (Big Bonus ของข้อ 6 คือ "Basic + Bonus + เพิ่มหรือซ่อน Elements โดย `getElementById()` เมื่อรับข้อมูลจาก Form")

**สิ่งที่ทำ (v2.4):** `index.html` จัดโครงสร้าง inline script (บรรทัด 52–143) ใหม่ให้ตรงถ้อยคำเกณฑ์ — แยกงานออกเป็นสองส่วน:

- **ส่วนที่รันทันที (ไม่รอ load):** `MAISON.init({ nav: 'home' })` (บรรทัด 132) — auth/redirect ของ shell ต้องไม่รอ load event; ใน `.then()` เมื่อผู้ใช้ login อยู่ เปลี่ยนปุ่ม hero รอง `#hero-second-btn` เป็น "จองตั๋วของคุณ" (ชี้ไป movies.html)
- **ส่วนที่รันเมื่อ load:** ฟังก์ชัน `renderLists()` (บรรทัด 59–130) สร้าง element เพิ่มเข้า DOM ทั้งสี่กลุ่มของหน้าแรก — สถิติย่อ `#hero-meta`, การ์ด Top 5 ใน `#top5-row`, การ์ดโปรโมชันใน `#promo-row`, การ์ด "กำลังจะมาถึง" ใน `#coming-list` (ผ่าน `document.getElementById(...)` + `appendChild` เหมือนเดิม) — แล้วผูกเข้ากับ load event ตรงตามถ้อยคำเกณฑ์ (บรรทัด 140–142):
  - `window.onload = renderLists;` — inline script ท้าย body ปกติจะเจอ load event หลังสคริปต์เสมอ
  - กันกรณีพิเศษ: `if (document.readyState === 'complete') { renderLists(); }` — ถ้า load มาถึงก่อนสคริปต์ (เช่น cache) เรียกทันทีแทน ไม่รอตลอดไป
- **ความถูกต้องแม้ load มาก่อน config/init:** `renderLists()` เริ่มด้วย `MAISON_API.ready.then(...)` เสมอ — คำขอ `movies`/`comingSoon`/`promotions` (และ `showDates()` ที่ใช้ `today` จาก `/api/config`) ยิงเฉพาะหลัง config พร้อมเท่านั้น จึงไม่พึ่งสมมติฐานเรื่องลำดับเวลา; และถูกเรียกครั้งเดียวจากทางเดียว (เงื่อนไข if/else) จึงไม่มี double-execution; ไม่มีตัวแปรของ init หลุดขอบเขต (ctx ใช้เฉพาะใน `.then()` ของ init ที่ยังอยู่ที่เดิม)

**วิธีสาธิตสด:** เปิด `index.html` → DevTools Network ตั้ง throttle "Slow 3G" แล้วรีเฟรช → จะเห็นว่าการ์ด Top 5 / โปรโมชัน / กำลังจะมาถึง / แถวสถิติ hero ปรากฏหลัง resource ทั้งหมดโหลดเสร็จ (load event) ไม่ใช่ทันทีที่เจอสคริปต์; หรือ Console พิมพ์ `window.onload.toString()` เพื่อแสดงว่า handler ผูกอยู่จริง — รายการทั้งสี่มาจาก JSON ของ `/api/*` (fetch หลายจุดในหน้าเดียว ตามข้อ 10 bonus)

### 7.5 สรุปสถานะ Rubrics ทั้ง 11 ข้อหลัง v2.4

| ข้อ | Basic | Bonus | Big Bonus | หลักฐานหลัก |
| --- | --- | --- | --- | --- |
| 1 wireframe/architecture | ต้องถามผู้สอนรูปแบบการส่ง | — | — | §2 ของไฟล์นี้ + `cinema-frontend-plan.md` (คำถามใน `cinema-issues.md`) |
| 2 CSS selectors + specificity | ✓ | ✓ | ✓ (v2.4 — §7.1) | `styles.css` + §7.1 |
| 3 form validation + JS | ✓ | ✓ | ✓ (v2.4 — §7.2) | `register.html`/`account.html`/`login.html` + §7.2 |
| 4 semantic + Flexbox/Grid | ✓ | ✓ | ✓ | 15 หน้า HTML + `styles.css` |
| 5 responsive + hide/show | ✓ | ✓ | ✓ (v2.4 — §7.3) | `styles.css` media queries + §7.3 |
| 6 JS เปลี่ยน style (getElementById) | ✓ | ✓ | ✓ (v2.4 — §7.4) | `seats.html`, `admin.html`, `account.html`, `admin-promotions.html`, `index.html` (load handler) |
| 7 JSON แสดงผล/คำนวณ/เก็บ DB | ✓ | ✓ | ✓ | `/api/*` + Neon (ตาราง §3.1 แผน) |
| 8 DB CRUD + pagination | ✓ | ✓ | ✓ (pagination v2.3) | `server/routes/admin.js`, `MAISON.pager` |
| 9 Cookies/session วงจรเต็ม | ✓ | ✓ | ✓ | `maison_sid` + ตาราง `sessions` |
| 10 XHR/Fetch | ✓ | ✓ | ✓ | `api.js` (XHR `/api/config` + fetch หลายจุด/หน้า) |
| 11 รายงานสถิติ + กราฟ + filter | ✓ | ✓ | ✓ | `admin.html` |

## 8. วิธีรันบนเครื่อง (ไม่ต้องมีบัญชี Vercel)

ต้องมี Node.js ≥ 20

```bash
npm install
# ฐานข้อมูล PGlite ในโฟลเดอร์ .pglite (ไม่ต้องติดตั้ง Postgres)
DATABASE_URL=pglite:./.pglite npm run db:seed -- --reset
DATABASE_URL=pglite:./.pglite COOKIE_INSECURE=1 npm run dev
# เปิด http://localhost:3000
```

- PowerShell: `$env:DATABASE_URL='pglite:./.pglite'; $env:COOKIE_INSECURE='1'; npm run dev`
- `COOKIE_INSECURE=1` ใช้เฉพาะ http://localhost (ตัด `Secure` ออกจาก cookie) — **ห้ามตั้งบน Vercel**
- ใช้ Neon จริงในเครื่อง: `vercel env pull .env.local` แล้ว `npm run dev` (สคริปต์อ่าน `.env.local` เอง) หรือ `vercel dev`
- ไม่ตั้ง `BLOB_READ_WRITE_TOKEN` ในเครื่อง → ภาพที่แนบเก็บเป็น data URL ใน DB (บน Vercel จะตอบ 503 แทน)

| npm script | ทำอะไร |
| --- | --- |
| `npm run dev` | dev server (static + `/api`) พอร์ต `PORT` หรือ 3000 |
| `npm run build` | คัดลอกหน้า HTML + `assets/` ไป `public/` (Vercel เรียกเอง) |
| `npm run db:migrate` | สร้างตาราง (`db/schema.sql`) — รันซ้ำได้ |
| `npm run db:seed` | seed ลง DB ว่าง · `-- --reset` ล้างแล้ว seed ใหม่ · `-- --refresh-schedule` เลื่อนวันฉาย |
| `npm test` | T1 mock + unit + T5 HTTP + client parity (สร้าง PGlite ทดสอบเองใน `.pglite-test*`) |
| `npm run test:mock` / `test:unit` / `test:api` | รันแยกชุด |
| `npm run test:smoke` | smoke ผ่าน Edge/Chrome headless (ต้องตั้ง `DATABASE_URL` + `COOKIE_INSECURE=1` และ seed ก่อน) |

## 9. Deploy บน Vercel

1. push repo ขึ้น GitHub แล้ว Import เป็นโปรเจกต์ Vercel (Framework Preset: Other — `vercel.json` กำหนด `buildCommand` / `outputDirectory: public` ให้แล้ว)
2. Vercel → Storage → Create **Neon** (Postgres) → Connect กับโปรเจกต์ (ได้ `DATABASE_URL`) — แนะนำเปิดให้สร้าง database branch สำหรับ Preview
3. Vercel → Storage → Create **Blob** → Connect (ได้ `BLOB_READ_WRITE_TOKEN`)
4. ในเครื่อง: `vercel link` → `vercel env pull .env.local` → `npm install`
5. `npm run db:migrate` → `npm run db:seed -- --reset` (รันกับ Neon ตาม `DATABASE_URL` ใน `.env.local`)
6. `vercel` (Preview) → ทดสอบ smoke บน URL preview (login, จอง, admin) → `vercel --prod`
7. v2.2 เป็นต้นไป: **cron รายวันเลื่อนตารางฉายอัตโนมัติ** (`vercel.json` `crons` เรียก `GET /api/cron/refresh-schedule` เวลา 00:00 เขตเวลาไทย) — ต้องตั้ง `CRON_SECRET` ใน Vercel env ก่อน ไม่อย่างนั้น endpoint ตอบ 401 ทุกครั้ง (fail-closed) และไม่ต้องรัน `npm run db:seed -- --refresh-schedule` ด้วยมือทุก ~6 วันอีกต่อไป (รันมือได้เมื่อต้องการเลื่อนทันที)

| Environment variable | ที่มา | หมายเหตุ |
| --- | --- | --- |
| `DATABASE_URL` | Neon integration | ใช้ `POSTGRES_URL` แทนได้ถ้าไม่มี; `pglite:<dir>` สำหรับเครื่อง dev |
| `BLOB_READ_WRITE_TOKEN` | Blob integration | ไม่มีบน Vercel → อัปโหลดภาพตอบ 503 |
| `CRON_SECRET` | ตั้งเอง (v2.2) | Bearer token ของ `GET /api/cron/refresh-schedule` — สุ่มสตริงยาว; ไม่ตั้ง = cron ตอบ 401 |
| `ADMIN_PASSWORD` / `DEMO_PASSWORD` | ตั้งเอง (v2.2) | seed เส้นทาง non-pglite ใช้แทน admin123/demo123; ไม่ตั้ง = สุ่ม 16 ตัวอักษรแล้วพิมพ์ console ครั้งเดียว |
| `COOKIE_INSECURE` | ตั้งเองเฉพาะเครื่อง dev | `1` = cookie ไม่มี `Secure` (http://localhost) |
| `PORT` | ไม่บังคับ | พอร์ตของ `npm run dev` |

### สถานะ deploy จริง (20 ตุลาคม 2026)

- โปรเจกต์ Vercel `maison-cinema` เชื่อม GitHub `Koorawut/Cinema_Project` (branch `main`); push แล้ว Vercel build เอง — ปัจจุบัน production คือ **`https://maison-cinema-l2dn7wn7t-ai-test-project1.vercel.app`** (deployment `l2dn7wn7t`, Ready; ผู้ใช้ deploy เองด้วย `vercel deploy --prod` หลังแก้ config Blob) — rollback target หากจำเป็น: deployment `gu8a58vn5` (v2.3 เดิม), `7l15vd2oq` (v2.2), `g6rpa9ndm` (v2.1)
- Neon เชื่อมผ่าน Vercel integration (`DATABASE_URL` ใน Preview + Production); migrate + seed ทำจากเครื่องด้วย `.env.local` (ถูก gitignore ด้วยกฎ `.env.*`) — **ห้าม commit ไฟล์นี้ และควร reset รหัสผ่านฐานข้อมูลที่ Neon console หากเคยวางลงแชตหรือที่สาธารณะ** (ผู้ใช้ตัดสินใจไม่ reset ในรอบนี้ — โปรเจกต์เรียน ไม่มีผู้ใช้จริง)
- Vercel Blob: store **`maison-images` (Public)** (`BLOB_READ_WRITE_TOKEN` ตั้งทั้ง Production + Preview) — ตรวจแล้ว 20 ต.ค. 2026 รอบที่ 11: แนบภาพบน production ใช้ได้จริง (สร้างคูปองพร้อมภาพ → 201, ภาพเป็น Blob URL สาธารณะ, GET ภาพไม่ login ได้ 200) — **คำเตือน: ตอนสร้าง Blob store ต้องเลือกประเภท Public ไม่ใช่ Private** (store แรก `store_X5Atio0gYC07AfFQ` สร้างเป็น Private ทำให้อัปโหลดไม่ได้ — `server/images.js` อัปโหลดด้วย `access: 'public'`; token เก่าก็ชี้ store ที่ถูกลบจึงตายด้วย รายละเอียดใน `tests/test-log.md` รอบที่ 11)
- **ยอมรับความเสี่ยง (Blob token):** ค่า `BLOB_READ_WRITE_TOKEN` เคยถูกวางแสดงในแชต/terminal output ระหว่างแก้ปัญหา (token ของ store เก่าถูกลบไปแล้วจึงใช้ไม่ได้ แต่ token ปัจจุบันของ store ใหม่ก็เคยแสดงใน terminal) — ผู้ใช้ตัดสินใจยอมรับความเสี่ยงเพราะเป็นโปรเจกต์เรียน ไม่มีผู้ใช้จริง (เหตุผลเดียวกับ P-14); หากวันหน้าเปิดใช้จริง ให้สร้าง store/token ใหม่ — ห้ามเขียนค่า token ลงเอกสาร
- Deployment Protection / Vercel Authentication ปิดแล้ว — เปิดเว็บได้จากทุกที่ และ curl ทดสอบตรงได้ (ไม่ต้องใช้ `vercel curl` เหมือนรอบแรก)
- `CRON_SECRET` ตั้งแล้วใน Vercel env ทั้ง Production + Preview — cron เลื่อนตารางฉายรายวัน (00:00 เขตไทย) ทำงาน; ตรวจ fail-closed แล้ว (ไม่มี/ผิด Bearer → 401 บน production, รอบที่ 8)
- รหัส `admin` บน production: **ผู้ใช้ตัดสินใจยอมรับความเสี่ยง** (P-14 — โปรเจกต์เรียน ไม่มีผู้ใช้จริง จึงไม่เปลี่ยนรหัสในรอบนี้); หากวันหน้าเปิดใช้จริง ให้เปลี่ยนผ่านหน้า account หรือ re-seed ด้วย `ADMIN_PASSWORD` ก่อน
- ตรวจ production แล้ว (19–20 ต.ค. 2026): v2.2 รอบที่ 8 ผ่าน 14/14 — สมัคร/login, จอง, จองซ้ำได้ 409 + `conflicts`, แก้ตารางมี booking → 409, cron 401, cookie flags, สถิติตรง DB (ดู `tests/test-log.md` รอบที่ 8); ของทดสอบที่ค้าง: บัญชี `qa_prod_1` + ตั๋ว `MAI-G92Z` · v2.3 รอบที่ 10 ผ่าน 8/8 กลุ่มเคส — P-18, P-19, กติกาคูปอง, pagination, cron 401, จอง + จองซ้ำ 409 (ดู `tests/test-log.md` รอบที่ 10); ของทดสอบที่ค้าง: บัญชี `qa_prod_2` + หนัง `m12` + ตั๋ว `MAI-MWC8` · Blob รอบที่ 11 ผ่าน 5/5 — แนบภาพ/GET ภาพสาธารณะ/ล้างข้อมูลทดสอบครบ ไม่มีของทดสอบค้าง (ดู `tests/test-log.md` รอบที่ 11)
