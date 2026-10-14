/* โหลด .env.local / .env (รูปแบบเดียวกับ `vercel env pull`) เข้า process.env
   ไม่ทับค่าที่ตั้งไว้แล้ว — ไม่ใช้ dotenv เพื่อลด dependency */
'use strict';

const fs = require('fs');
const path = require('path');

['.env.local', '.env'].forEach((name) => {
  const file = path.join(__dirname, '..', name);
  if (!fs.existsSync(file)) { return; }
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) { return; }
    let v = m[2];
    if (/^"(.*)"$/.test(v)) { v = v.slice(1, -1).replace(/\n/g, '\n'); }
    else if (/^'(.*)'$/.test(v)) { v = v.slice(1, -1); }
    process.env[m[1]] = v;
  });
});
