/* =============================================================
   npm run build — เตรียมไฟล์ static สำหรับ Vercel
   คัดลอกเฉพาะหน้า HTML + assets/ ไปไว้ที่ public/ (outputDirectory ใน vercel.json)
   เพื่อไม่ให้ซอร์ส server/, scripts/, db/, tests/ ถูกเสิร์ฟเป็นไฟล์ static
   (Vercel ยัง bundle server/ เข้า function api/index.js ตามปกติ)
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).forEach((f) => {
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
  files++;
});
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
// mock ใช้เฉพาะชุดทดสอบ T1 — ไม่ deploy
fs.rmSync(path.join(OUT, 'assets', 'js', 'api-mock.js'), { force: true });

console.log('build: คัดลอก ' + files + ' หน้า + assets/ ไปที่ public/');
