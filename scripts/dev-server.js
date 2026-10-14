/* =============================================================
   npm run dev — เซิร์ฟเวอร์สำหรับเครื่อง dev (แทน `vercel dev`)
   เสิร์ฟไฟล์ static ที่ root + ส่ง /api/* เข้า api/index.js ตัวเดียวกับบน Vercel
   ตัวอย่าง: DATABASE_URL=pglite:./.pglite COOKIE_INSECURE=1 npm run dev
   ============================================================= */
'use strict';

require('./env');
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('../api/index');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8'
};
/* ไม่เสิร์ฟโค้ด server / ไฟล์ลับ (บน Vercel ไฟล์เหล่านี้ก็ไม่ถูกเสิร์ฟเป็น static เช่นกัน) */
const HIDDEN = /^\/(server|scripts|db|api|node_modules|\.[^/]*)(\/|$)/;

function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { p = '/'; }
  if (p.endsWith('/')) { p += 'index.html'; }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || HIDDEN.test(p) || /package(-lock)?\.json$|\.env/.test(p)) {
    res.statusCode = 404; res.end('Not found'); return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; res.end('Not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (/^\/api(\/|$|\?)/.test(req.url)) { handler(req, res); return; }
  serveStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('MAISON dev server: http://localhost:' + PORT + '  (DB: ' + (process.env.DATABASE_URL ? require('../server/db').driverKind() : 'ยังไม่ตั้ง DATABASE_URL') + ')');
  });
}

module.exports = server;
