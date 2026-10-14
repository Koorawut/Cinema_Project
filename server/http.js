/* =============================================================
   MAISON Cinema — HTTP helpers (server)
   ApiError รูปแบบเดียวกับ mock (status + message + ฟิลด์เสริม เช่น conflicts)
   ============================================================= */
'use strict';

const MAX_BODY = 1024 * 1024; // 1 MB (ภาพแนบ ≤180 KB → base64 ≈ 240 KB)

class ApiError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.extra = extra || null;
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function sendError(res, err) {
  const body = { error: { message: err.message } };
  if (err.extra) { Object.assign(body.error, err.extra); }
  sendJson(res, err.status, body);
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) { return; }
    const k = part.slice(0, i).trim();
    if (!k || out[k] !== undefined) { return; }
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* ข้าม cookie ที่ encode ผิด */ }
  });
  return out;
}

/* Secure ปิดได้ด้วย COOKIE_INSECURE=1 เฉพาะตอนทดสอบผ่าน http บนเครื่อง dev
   (Chrome/Firefox ยอมรับ Secure บน http://localhost อยู่แล้ว แต่ client ทดสอบ Node ไม่สนใจ flag นี้) */
function serializeCookie(name, value, opts) {
  opts = opts || {};
  const parts = [name + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.COOKIE_INSECURE !== '1') { parts.push('Secure'); }
  if (opts.maxAge !== undefined) { parts.push('Max-Age=' + Math.floor(opts.maxAge)); }
  return parts.join('; ');
}

function appendCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : [cookie]);
}

/* อ่าน body เป็น JSON (จำกัด 1 MB) — runtime ของ Vercel อาจ parse ไว้แล้วใน req.body */
function readBody(req) {
  let pre;
  try { pre = req.body; } catch (e) { return Promise.reject(new ApiError(400, 'รูปแบบข้อมูล JSON ไม่ถูกต้อง')); }
  if (pre !== undefined) {
    if (pre && typeof pre === 'object' && !Buffer.isBuffer(pre)) { return Promise.resolve(Array.isArray(pre) ? {} : pre); }
    try { return Promise.resolve(parseJson(Buffer.isBuffer(pre) ? pre.toString('utf8') : String(pre || ''))); } catch (e) { return Promise.reject(e); }
  }
  // runtime ของ Vercel อ่าน stream ไปแล้ว — body ว่างจึงได้ undefined
  if (req.readableEnded || process.env.VERCEL) { return Promise.resolve({}); }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (c) => {
      if (failed) { return; }
      size += c.length;
      if (size > MAX_BODY) {
        failed = true;
        reject(new ApiError(413, 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (failed) { return; }
      try { resolve(parseJson(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function parseJson(raw) {
  if (!raw.trim()) { return {}; }
  let data;
  try { data = JSON.parse(raw); } catch (e) { throw new ApiError(400, 'รูปแบบข้อมูล JSON ไม่ถูกต้อง'); }
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

module.exports = { ApiError, sendJson, sendError, parseCookies, serializeCookie, appendCookie, readBody };
