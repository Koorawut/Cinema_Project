# MAISON Cinema

เว็บจองตั๋วหนัง (vanilla HTML/CSS/JS) พร้อม backend บน Vercel Functions + Neon Postgres + Vercel Blob — เวอร์ชัน 2.1

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js ≥ 20 (ไม่ต้องมีบัญชี Vercel — ใช้ PGlite แทน Neon)

```bash
npm install
DATABASE_URL=pglite:./.pglite npm run db:seed -- --reset
DATABASE_URL=pglite:./.pglite COOKIE_INSECURE=1 npm run dev
# เปิด http://localhost:3000 — บัญชีสาธิต admin/admin123, demo/demo123
```

PowerShell: `$env:DATABASE_URL='pglite:./.pglite'; $env:COOKIE_INSECURE='1'; npm run dev`

บัญชีสาธิต `admin/admin123`, `demo/demo123` ใช้ได้เฉพาะ dev ในเครื่อง (PGlite) เท่านั้น —
บน production seed จะอ่านรหัสผ่านจาก env `ADMIN_PASSWORD`/`DEMO_PASSWORD` แทน
ถ้าไม่ได้ตั้ง env ระบบจะสุ่มรหัส 16 ตัวอักษรแล้วพิมพ์ออกทาง console **ครั้งเดียว**ตอน seed
พร้อมคำเตือน ให้เก็บทันที (P-14)

## ทดสอบ

- `npm test` — mock เดิม (T1) + unit เขตเวลา + HTTP API (T5) + client parity
- `npm run test:smoke` — เบราว์เซอร์ Edge/Chrome headless เดินครบ 15 หน้า (ตั้ง `DATABASE_URL` + `COOKIE_INSECURE=1` และ seed ก่อน)

## ก่อนขึ้น production (ต้องลบ)

ของที่มีไว้ตรวจและยืนยันงานระหว่างพัฒนา ไม่ใช่ส่วนของระบบจริง ให้ลบออกจาก repo ที่ใช้ deploy:

- `assets/js/api-mock.js` — mock API สำหรับ T1 (`npm run build` ไม่คัดลอกไปที่ `public/` อยู่แล้ว แต่ยังอยู่ใน repo)
- `tests/` ทั้งโฟลเดอร์ (T1, unit, T5, client parity, smoke) และ script `test*` ใน `package.json`
- `@electric-sql/pglite` ใน `devDependencies` (ใช้กับทดสอบและ dev ในเครื่องเท่านั้น)
- เอกสารภายใน: `cinema-frontend-plan.md`, `cinema-issues.md`, `cinema-v1-summary.md`, `cinema-testing-formation.md`, `CHANGELOG.md` (เก็บ `README.md` ไว้)
- ถ้าลบ `api-mock.js` ต้องเลิกอ้างถึงใน `scripts/build.js` (บรรทัดที่ลบไฟล์นี้ออกจาก `public/`)

ลบหลังส่งงานและตรวจรอบสุดท้ายผ่านแล้วเท่านั้น เพราะ `tests/` เป็นหลักฐานผลทดสอบของงานวิชา

## เอกสาร

- `cinema-v1-summary.md` — สรุปสถาปัตยกรรม, ข้อมูล seed, วิธีรัน และขั้นตอน deploy บน Vercel
- `cinema-frontend-plan.md` — แผน, สัญญา API, Rubrics
- `cinema-issues.md` — ปัญหาค้าง/ปิดแล้ว · `CHANGELOG.md` · `tests/test-log.md` — ผลทดสอบแต่ละรอบ

## Cron เลื่อนตารางฉาย (production)

`vercel.json` ตั้ง cron `0 17 * * *` เรียก `GET /api/cron/refresh-schedule` — เลื่อนวันฉายหนัง seed
ที่หมดวันให้เริ่มวันปัจจุบัน (idempotent รันซ้ำไม่เปลี่ยนอะไร ข้ามเรื่องที่ชนโรง/ช่วงเวลา
ไม่แตะการจองและหนังที่ admin เพิ่มเอง) — ต้องตั้ง env `CRON_SECRET` บน Vercel
แล้ว cron ของ Vercel จะแนบ `Authorization: Bearer $CRON_SECRET` ให้อัตโนมัติ (P-cron)
