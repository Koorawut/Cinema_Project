# สรุปโครงการ — เว็บจองตั๋วหนัง MAISON (frontend v1 + backend v2)

อัปเดต: 19 ตุลาคม 2026 (v2.2 — ความปลอดภัย + ตรรกะจอง + cron ตารางฉายรายวัน) · แสดงเลขเวอร์ชัน "เวอร์ชัน 2.2 (v2.2)" ที่ eyebrow หน้าแรกและ footer ทุกหน้า
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
- ชุดทดสอบอัตโนมัติทั้งหมดรันกับ PGlite ในเครื่อง; **19 ต.ค. 2026** migrate + seed บน Neon จริงสำเร็จและตรวจ `/api/config`, `/api/movies` บน deployment จริงแล้ว (ดู `tests/test-log.md` รอบที่ 6) และรัน smoke ผ่านบน production แล้วในรอบที่ 8 (หัวข้อถัดไป); ยังไม่ได้ทดสอบ: แนบภาพในเบราว์เซอร์จริง, remember me ข้ามการปิดเบราว์เซอร์, layout มือถือด้วย screenshot
- **v2.2 (รอบที่ 7):** แก้ P-12, P-15, P-16, P-17 + P-14 ฝั่งโค้ด + cron เลื่อนตารางฉาย — T1 49/49 · unit 19/19 · T5 30/30 · client parity 3/3 · รวม 101/101 · smoke 22/22; เปิดใหม่ P-18 (ลบหนังที่มี booking อนาคต), P-19 (redeem ไม่เช็ค isPast); P-14 รอเปลี่ยนรหัส admin บน production
- **v2.2 บน production (รอบที่ 8, 19 ต.ค. 2026):** Cluster Head ยิง curl ตรงกับ production `maison-cinema-7l15vd2oq-ai-test-project1.vercel.app` — **smoke ผ่าน 14/14**: `/api/config` + `/api/movies` 200 จาก Neon, เวอร์ชัน "2.2 (v2.2)", cron ไม่มี/ผิด Bearer → 401 (fail-closed), สมัคร/login/`me` (บัญชี `qa_prod_1`), จองรอบที่เริ่มไปแล้วถูกปฏิเสธ (P-15), จองรอบอนาคตสำเร็จ (`MAI-G92Z`), จองซ้ำ → 409 + `conflicts`, แก้โรง → 409 / แก้ราคา → 200 (P-16), 403/401 บน admin endpoint, cookie `HttpOnly; Secure; SameSite=Lax`, สถิติตรง DB (ผู้ใช้ 52, การจอง 3,302) — ของทดสอบ `qa_prod_1`/`MAI-G92Z` ฝากไว้ใน DB เป็นหลักฐาน

## 6. เงื่อนไขที่ยังค้าง (ส่งต่อรอบถัดไป)

- Pagination (Rubric 8 bonus) — API ยังคืนทั้งหมดเหมือน mock; เพิ่ม `?page=&limit=` ที่ `admin/users`, `admin/movies`, `me/bookings` ได้
- **P-14 (ยอมรับความเสี่ยง):** โค้ด seed แก้ครบใน v2.2 (บัญชีสาธิตใช้ได้เฉพาะ dev) แต่ผู้ใช้ตัดสินใจไม่เปลี่ยนรหัส `admin` บน production และไม่ reset รหัสผ่าน Neon DB เพราะเป็นโปรเจกต์เรียน ไม่มีผู้ใช้จริง — หากวันหน้าเปิดใช้จริง ให้เปลี่ยนรหัสผ่านก่อน · **P-18:** กันลบหนังที่มี booking รอบอนาคต · **P-19:** เพิ่ม `isPast` ที่ redeem
- P-04 นิยามการนับ visitor (ตอนนี้ไม่มีตารางนับผู้เข้าชม) · P-07 ข้อมูล/ภาพจริง · P-01 ตรวจภาพจริงรายหน้า · ปิดแล้วในรอบก่อน: P-03, P-06, P-08, P-10, P-12, P-15, P-16, P-17
- Rubric 1 (wireframe/architecture) — ยังต้องถามผู้สอนว่าส่งไฟล์แยกหรืออ้างหัวข้อ 2 ของไฟล์นี้ + แผนได้
- Rubric 9 — cookie เป็น HttpOnly จึงแสดง session ID ฝั่ง JS ไม่ได้ (ตั้งใจ); หลักฐานวงจร session ใช้ DevTools → Application → Cookies + ตาราง `sessions` แทน — ควรยืนยันกับผู้สอน

## 7. วิธีรันบนเครื่อง (ไม่ต้องมีบัญชี Vercel)

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

## 8. Deploy บน Vercel

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

### สถานะ deploy จริง (19 ตุลาคม 2026)

- โปรเจกต์ Vercel `maison-cinema` เชื่อม GitHub `Koorawut/Cinema_Project` (branch `main`); push แล้ว Vercel build เอง — ปัจจุบัน production คือ **`https://maison-cinema-7l15vd2oq-ai-test-project1.vercel.app`** (deployment `7l15vd2oq`, Ready; v2.2 จาก merge commit `6be5552`)
- Neon เชื่อมผ่าน Vercel integration (`DATABASE_URL` ใน Preview + Production); migrate + seed ทำจากเครื่องด้วย `.env.local` (ถูก gitignore ด้วยกฎ `.env.*`) — **ห้าม commit ไฟล์นี้ และควร reset รหัสผ่านฐานข้อมูลที่ Neon console หากเคยวางลงแชตหรือที่สาธารณะ** (ผู้ใช้ตัดสินใจไม่ reset ในรอบนี้ — โปรเจกต์เรียน ไม่มีผู้ใช้จริง)
- Vercel Blob เชื่อมแล้ว (`BLOB_READ_WRITE_TOKEN` จาก Blob integration) — แนบภาพบน production ใช้ได้
- Deployment Protection / Vercel Authentication ปิดแล้ว — เปิดเว็บได้จากทุกที่ และ curl ทดสอบตรงได้ (ไม่ต้องใช้ `vercel curl` เหมือนรอบแรก)
- `CRON_SECRET` ตั้งแล้วใน Vercel env ทั้ง Production + Preview — cron เลื่อนตารางฉายรายวัน (00:00 เขตไทย) ทำงาน; ตรวจ fail-closed แล้ว (ไม่มี/ผิด Bearer → 401 บน production, รอบที่ 8)
- รหัส `admin` บน production: **ผู้ใช้ตัดสินใจยอมรับความเสี่ยง** (P-14 — โปรเจกต์เรียน ไม่มีผู้ใช้จริง จึงไม่เปลี่ยนรหัสในรอบนี้); หากวันหน้าเปิดใช้จริง ให้เปลี่ยนผ่านหน้า account หรือ re-seed ด้วย `ADMIN_PASSWORD` ก่อน
- ตรวจ production แล้ว (19 ต.ค. 2026): smoke ผ่าน 14/14 — สมัคร/login, จอง, จองซ้ำได้ 409 + `conflicts`, แก้ตารางมี booking → 409, cron 401, cookie flags, สถิติตรง DB (ดู `tests/test-log.md` รอบที่ 8); ของทดสอบที่ค้าง: บัญชี `qa_prod_1` + ตั๋ว `MAI-G92Z`
