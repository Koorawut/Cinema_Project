/* =============================================================
   MAISON Cinema — รหัสผ่าน + session (Rubric 9)
   - รหัสผ่าน: bcrypt (cost 10) เก็บเฉพาะ hash
   - session: token สุ่ม 32 ไบต์อยู่ใน cookie HttpOnly `maison_sid`
     DB เก็บแค่ sha256(token) — ถ้าตาราง sessions รั่วก็ใช้ปลอมตัวไม่ได้
   - remember me = cookie Max-Age 30 วัน; ไม่ remember = session cookie
     (ปิดเบราว์เซอร์แล้วหาย) และหมดอายุฝั่ง DB ใน 12 ชม.
   ============================================================= */
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { ApiError, parseCookies, serializeCookie, appendCookie } = require('./http');
const { toBangkokISO } = require('./time');

const COOKIE = 'maison_sid';
const REMEMBER_MS = 30 * 24 * 3600 * 1000;
const SESSION_MS = 12 * 3600 * 1000;
const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAILS = 10;

function hashPassword(pw) { return bcrypt.hash(pw, 10); }
function checkPassword(pw, hash) { return bcrypt.compare(String(pw || ''), hash || ''); }
/* hash จำลองไว้เทียบเมื่อไม่พบผู้ใช้ — ให้เวลาตอบใกล้เคียงกัน (กันเดาว่าบัญชีมีอยู่) */
const DUMMY_HASH = bcrypt.hashSync('maison-dummy-password', 10);

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email, role: row.role, createdAt: toBangkokISO(row.created_at) };
}

async function createSession(res, userId, remember) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + (remember ? REMEMBER_MS : SESSION_MS));
  await db.query(
    'INSERT INTO sessions (id_hash, user_id, remember, expires_at) VALUES ($1, $2, $3, $4)',
    [tokenHash(token), userId, !!remember, expires.toISOString()]
  );
  appendCookie(res, serializeCookie(COOKIE, token, remember ? { maxAge: REMEMBER_MS / 1000 } : {}));
  // เก็บกวาด session ที่หมดอายุแล้ว (ไม่มี cron บน Hobby plan จึงทำตอน login)
  await db.query('DELETE FROM sessions WHERE expires_at < now()');
}

function sessionToken(req) {
  const t = parseCookies(req.headers.cookie)[COOKIE];
  return t && /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
}

/* ผู้ใช้จาก cookie (cache ต่อ request) — null เมื่อไม่มี/หมดอายุ */
async function currentUser(req) {
  if (req._user !== undefined) { return req._user; }
  const token = sessionToken(req);
  let user = null;
  if (token) {
    const row = await db.one(
      'SELECT u.id, u.username, u.email, u.role, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id ' +
      'WHERE s.id_hash = $1 AND s.expires_at > now()', [tokenHash(token)]);
    user = row ? publicUser(row) : null;
  }
  req._user = user;
  return user;
}

async function requireUser(req) {
  const u = await currentUser(req);
  if (!u) { throw new ApiError(401, 'ต้องเข้าสู่ระบบก่อนใช้งานส่วนนี้'); }
  return u;
}
async function requireAdmin(req) {
  const u = await requireUser(req);
  if (u.role !== 'admin') { throw new ApiError(403, 'ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น'); }
  return u;
}

/* terminate: ลบแถว session ใน DB และสั่งให้เบราว์เซอร์ลบ cookie */
async function destroySession(req, res) {
  const token = sessionToken(req);
  if (token) { await db.query('DELETE FROM sessions WHERE id_hash = $1', [tokenHash(token)]); }
  appendCookie(res, serializeCookie(COOKIE, '', { maxAge: 0 }));
}

/* เปลี่ยนรหัสผ่านแล้วตัด session อื่นทั้งหมดของผู้ใช้ (คง session ปัจจุบัน) */
async function dropOtherSessions(req, userId) {
  const token = sessionToken(req);
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND id_hash <> $2', [userId, token ? tokenHash(token) : '']);
}

/* จำกัดการเดารหัสผ่าน: ล้มเหลวเกิน 10 ครั้งใน 15 นาทีต่อ identifier → 429 */
async function assertLoginAllowed(identifier) {
  const row = await db.one(
    "SELECT count(*)::int AS n FROM login_attempts WHERE identifier = $1 AND at > now() - make_interval(mins => $2)",
    [identifier, LOGIN_WINDOW_MIN]);
  if (row && row.n >= LOGIN_MAX_FAILS) {
    throw new ApiError(429, 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ ' + LOGIN_WINDOW_MIN + ' นาทีแล้วลองใหม่');
  }
}
async function recordLoginFailure(identifier) {
  await db.query('INSERT INTO login_attempts (identifier) VALUES ($1)', [identifier]);
  await db.query("DELETE FROM login_attempts WHERE at < now() - interval '1 day'");
}
async function clearLoginFailures(identifier) {
  await db.query('DELETE FROM login_attempts WHERE identifier = $1', [identifier]);
}

module.exports = {
  COOKIE, hashPassword, checkPassword, DUMMY_HASH, publicUser,
  createSession, currentUser, requireUser, requireAdmin, destroySession, dropOtherSessions,
  assertLoginAllowed, recordLoginFailure, clearLoginFailures
};
