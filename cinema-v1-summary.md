# สรุปโครงการ — เว็บจองตั๋วหนัง MAISON (frontend v1 + backend v2)

อัปเดต: 15 ตุลาคม 2026 (v2.0 — backend จริงบน Vercel + Neon Postgres + Vercel Blob) · แสดงเลขเวอร์ชัน "เวอร์ชัน 2.0 (v2.0)" ที่ eyebrow หน้าแรกและ footer ทุกหน้า
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
| `server/time.js` · `server/schedule.js` | วันที่เขตเวลาไทย · โรง/ช่วงเวลา/ค่าบริการ/id รอบฉาย และตรวจตารางฉายชนกัน |
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

- บัญชี: `admin/admin123` (role admin), `demo/demo123` (role user) — หน้า login มีปุ่มกรอกทั้งสองบัญชีอัตโนมัติ; ลูกค้าตัวอย่าง `guest01`…`guest48` (รหัสผ่านสุ่ม ไม่ได้ใช้ login) รวม 50 บัญชี
- หนัง now showing 8 เรื่อง + coming soon 3 เรื่อง (m09–m11) · คูปอง 3 ใบ (MAISON20, EVENINGPAIR, FRIDAY180)
- ราคาบัตร ฿200–฿300 · ค่าบริการ ฿30/ตั๋ว · 2 โรง (`hall-01`/`hall-02` แถว A–H × 12) · 3 ช่วงเวลา (10:30 / 14:20 / 19:00) · วันฉาย 6 วันนับจากวันนี้
- ที่นั่งถูกจองจริงโดยบัญชี guest 28–70% ของทุกรอบ (PRNG deterministic เดิม) · รอบเย็น The Hollow Choir (m02) วันนี้เต็ม · ประวัติการจองย้อนหลัง 30 วัน ให้กราฟ/ตารางหน้า admin มีข้อมูล
- การจองของ demo: MAI-7Q3F (Orbit 9, hall-01, E7+E8) และ MAI-2K8D (Bangkok Bank Run, hall-02, C4)
- ตัวเลขหน้า admin ทุกตัวนับจาก DB จริง (ไม่มีตัวเลขบวกเพิ่ม) แต่เป็นชุดตัวอย่างจาก seed — หน้าเว็บติดป้ายกำกับไว้แล้ว
- **ข้อจำกัด:** วันฉายเก็บเป็นวันที่ตายตัวตอน seed — หลังผ่านไป ~6 วันรอบของหนัง seed จะหมด ให้รัน `npm run db:seed -- --refresh-schedule` (เลื่อนช่วงวันฉายให้เริ่มวันนี้ ไม่ลบการจอง) หรือแก้ช่วงวันในหน้า admin-movies

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
- ยังไม่ได้ทดสอบบน Neon จริงและ Preview deployment — ทดสอบทั้งหมดรันกับ PGlite ในเครื่อง (ดูหัวข้อ 8 ขั้นที่ 6)

## 6. เงื่อนไขที่ยังค้าง (ส่งต่อรอบถัดไป)

- Pagination (Rubric 8 bonus) — API ยังคืนทั้งหมดเหมือน mock; เพิ่ม `?page=&limit=` ที่ `admin/users`, `admin/movies`, `me/bookings` ได้
- P-04 นิยามการนับ visitor (ตอนนี้ไม่มีตารางนับผู้เข้าชม) · P-08 ปิดแล้วใน v2.1 (checkout คำนวณส่วนลดที่ server; โค้ดจาก admin ยังไม่มีหน้ากำหนดกติกา) · P-07 ข้อมูล/ภาพจริง · P-12 ข้อความ checkout · P-01 ตรวจภาพจริงรายหน้า
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
7. ทุก ~6 วัน หรือก่อนสาธิต: `npm run db:seed -- --refresh-schedule`

| Environment variable | ที่มา | หมายเหตุ |
| --- | --- | --- |
| `DATABASE_URL` | Neon integration | ใช้ `POSTGRES_URL` แทนได้ถ้าไม่มี; `pglite:<dir>` สำหรับเครื่อง dev |
| `BLOB_READ_WRITE_TOKEN` | Blob integration | ไม่มีบน Vercel → อัปโหลดภาพตอบ 503 |
| `COOKIE_INSECURE` | ตั้งเองเฉพาะเครื่อง dev | `1` = cookie ไม่มี `Secure` (http://localhost) |
| `PORT` | ไม่บังคับ | พอร์ตของ `npm run dev` |
