/* =============================================================
   MAISON Cinema — Vercel Function เดียวสำหรับทุก /api/*
   vercel.json rewrite /api/(.*) → /api (ไม่ชนเพดาน 12 functions ของ Hobby plan)
   ใช้ซ้ำใน scripts/dev-server.js บนเครื่อง dev
   ============================================================= */
'use strict';

const crypto = require('crypto');
const { ApiError, sendJson, sendError, readBody } = require('../server/http');
const authR = require('../server/routes/auth');
const catalog = require('../server/routes/catalog');
const bookings = require('../server/routes/bookings');
const promos = require('../server/routes/promotions');
const admin = require('../server/routes/admin');
const { refreshSchedule } = require('../server/schedule-refresh');

/* GET /api/cron/refresh-schedule — Vercel Cron เรียกรายวัน (vercel.json: 0 17 * * *)
   ต้องส่ง Authorization: Bearer $CRON_SECRET (cron ขอ Vercel แนบให้อัตโนมัติ)
   401 เมื่อไม่ได้ตั้ง CRON_SECRET หรือค่าไม่ตรง — idempotent รันซ้ำได้
   เทียบ secret แบบ timing-safe: sha256 ทั้งสองฝั่งก่อน timingSafeEqual
   (hash ทำให้ความยาวเท่ากันเสมอ จึงไม่ throw จาก length mismatch — A4 LOW-4) */
function secureEqualStr(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
async function cronRefreshSchedule(ctx) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secureEqualStr(ctx.req.headers.authorization || '', 'Bearer ' + secret)) {
    throw new ApiError(401, 'ไม่ได้รับอนุญาต');
  }
  const r = await refreshSchedule();
  return { ok: true, moved: r.moved.length, skipped: r.skipped.length, detail: r };
}

/* [method, pattern, handler] — :name จับ 1 segment */
const ROUTES = [
  ['GET', '/api/config', authR.config],
  ['POST', '/api/auth/register', authR.register],
  ['POST', '/api/auth/login', authR.login],
  ['POST', '/api/auth/logout', authR.logout],
  ['GET', '/api/auth/me', authR.me],
  ['POST', '/api/auth/change-password', authR.changePassword],

  ['GET', '/api/movies', catalog.list],
  ['GET', '/api/movies/coming-soon', catalog.comingSoon],
  ['GET', '/api/movies/:id', catalog.detail],
  ['GET', '/api/movies/:id/showtimes', catalog.showtimes],
  ['GET', '/api/showtimes/:id/seats', catalog.seats],

  ['POST', '/api/bookings', bookings.create],
  ['GET', '/api/me/bookings', bookings.mine],

  ['GET', '/api/promotions', promos.list],
  ['POST', '/api/promotions/redeem', promos.redeem],
  ['GET', '/api/promotions/:id', promos.detail],

  ['GET', '/api/admin/promotions', promos.adminList],
  ['POST', '/api/admin/promotions', promos.adminCreate],
  ['PATCH', '/api/admin/promotions/:id', promos.adminUpdate],
  ['DELETE', '/api/admin/promotions/:id', promos.adminDelete],

  ['GET', '/api/admin/movies', admin.movies],
  ['POST', '/api/admin/movies', admin.createMovie],
  ['PATCH', '/api/admin/movies/:id', admin.updateMovie],
  ['DELETE', '/api/admin/movies/:id', admin.deleteMovie],

  ['GET', '/api/admin/users', admin.users],
  ['PATCH', '/api/admin/users/:id/role', admin.setRole],
  ['DELETE', '/api/admin/users/:id', admin.deleteUser],

  ['GET', '/api/admin/stats', admin.stats],

  ['GET', '/api/cron/refresh-schedule', cronRefreshSchedule]
].map(([method, pattern, handler]) => {
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
  return { method, re, names, handler };
});

const MUTATING = { POST: 1, PATCH: 1, PUT: 1, DELETE: 1 };

function match(method, path) {
  let allowed = [];
  for (const r of ROUTES) {
    const m = r.re.exec(path);
    if (!m) { continue; }
    if (r.method !== method) { allowed.push(r.method); continue; }
    const params = {};
    let bad = false;
    r.names.forEach((n, i) => {
      try { params[n] = decodeURIComponent(m[i + 1]); } catch (e) { bad = true; }
    });
    if (bad) { return { notFound: true }; }
    return { route: r, params };
  }
  return allowed.length ? { allowed: allowed.filter((v, i, a) => a.indexOf(v) === i) } : { notFound: true };
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
}

module.exports = async function handler(req, res) {
  try {
    // vercel.json rewrite ส่ง path เดิมมาใน ?__path= (และ runtime ส่วนใหญ่คง req.url เดิมไว้ด้วย)
    const url = new URL(req.url || '/', 'http://localhost');
    const rewritten = url.searchParams.get('__path');
    url.searchParams.delete('__path');
    let path = url.pathname.replace(/\/+$/, '') || '/';
    if ((path === '/api' || path === '/api/index') && rewritten) { path = '/api/' + rewritten.replace(/^\/+/, ''); }
    if (!path.startsWith('/api')) { path = '/api' + path; }
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      // ใช้แบบ same-origin เท่านั้น — ไม่เปิด CORS
      res.statusCode = 204;
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      res.end();
      return;
    }
    const found = match(method === 'HEAD' ? 'GET' : method, path);
    if (found.notFound) { throw new ApiError(404, 'ไม่พบ endpoint นี้'); }
    if (found.allowed) {
      res.setHeader('Allow', found.allowed.join(', '));
      throw new ApiError(405, 'ไม่รองรับเมธอดนี้');
    }

    let body = {};
    if (MUTATING[method]) {
      // กัน CSRF ร่วมกับ SameSite=Lax: ฟอร์ม HTML ข้ามเว็บส่ง application/json ไม่ได้โดยไม่ผ่าน preflight
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (type !== 'application/json') { throw new ApiError(415, 'คำขอต้องส่งเป็น application/json'); }
      body = await readBody(req);
    }

    const ctx = { req, res, body, query: url.searchParams, params: found.params, ip: clientIp(req), status: 200 };
    const out = await found.route.handler(ctx);
    sendJson(res, ctx.status, out === undefined ? { ok: true } : out);
  } catch (err) {
    if (err instanceof ApiError) {
      sendError(res, err);
      return;
    }
    console.error('[api] unhandled', err);
    sendError(res, new ApiError(500, 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'));
  }
};
