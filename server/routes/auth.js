/* =============================================================
   /api/config + /api/auth/*
   ============================================================= */
'use strict';

const crypto = require('crypto');
const db = require('../db');
const auth = require('../auth');
const V = require('../validate');
const S = require('../schedule');
const { ApiError } = require('../http');
const { todayISO } = require('../time');

/* GET /api/config — bootstrap ของหน้าเว็บ (เรียกด้วย XMLHttpRequest ใน api.js) */
async function config(ctx) {
  return {
    today: todayISO(0),
    showDays: S.SHOW_DAYS,
    halls: S.publicHalls(),
    periods: S.publicPeriods(),
    genres: S.GENRES.slice(),
    serviceFee: S.SERVICE_FEE,
    user: await auth.currentUser(ctx.req)
  };
}

/* POST /api/auth/register — สมัครแล้วยังไม่ login (หน้า register พาไปหน้า login เอง) */
async function register(ctx) {
  const f = V.registration(ctx.body);
  const dup = await db.one('SELECT 1 FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)', [f.username, f.email]);
  if (dup) { throw new ApiError(409, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้ไปแล้ว'); }
  const id = 'u-' + crypto.randomBytes(6).toString('hex');
  let row;
  try {
    row = await db.one(
      'INSERT INTO users (id, username, email, pass_hash, role) VALUES ($1, $2, $3, $4, $5) ' +
      'RETURNING id, username, email, role, created_at',
      [id, f.username, f.email, await auth.hashPassword(f.password), 'user']);
  } catch (e) {
    // สมัครพร้อมกัน 2 คำขอ — unique index ฝั่ง DB เป็นตัวตัดสินสุดท้าย
    if (db.isUniqueViolation(e)) { throw new ApiError(409, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้ไปแล้ว'); }
    throw e;
  }
  ctx.status = 201;
  return { user: auth.publicUser(row) };
}

/* POST /api/auth/login — identifier รับทั้ง username และ email */
async function login(ctx) {
  const idf = V.str(ctx.body.identifier).trim().toLowerCase().slice(0, 254);
  const password = V.str(ctx.body.password);
  // นับความล้มเหลวต่อ identifier+IP — กันเดารหัส โดยไม่ให้คนอื่นล็อกบัญชีของเราได้จากที่อื่น
  const throttleKey = idf + '|' + ctx.ip;
  await auth.assertLoginAllowed(throttleKey);
  const row = idf ? await db.one(
    'SELECT id, username, email, role, created_at, pass_hash FROM users WHERE lower(username) = $1 OR lower(email) = $1 LIMIT 1',
    [idf]) : null;
  const ok = await auth.checkPassword(password, row ? row.pass_hash : auth.DUMMY_HASH);
  if (!row || !ok) {
    await auth.recordLoginFailure(throttleKey);
    throw new ApiError(401, 'ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง');
  }
  await auth.clearLoginFailures(throttleKey);
  // login ใหม่ทับ session เดิมของเบราว์เซอร์นี้ (กัน session fixation)
  await auth.destroySession(ctx.req, ctx.res);
  ctx.res.removeHeader('Set-Cookie');
  await auth.createSession(ctx.res, row.id, !!ctx.body.remember);
  return { user: auth.publicUser(row) };
}

/* POST /api/auth/logout */
async function logout(ctx) {
  await auth.destroySession(ctx.req, ctx.res);
  return { ok: true };
}

/* GET /api/auth/me */
async function me(ctx) {
  const u = await auth.currentUser(ctx.req);
  if (!u) { throw new ApiError(401, 'ยังไม่ได้เข้าสู่ระบบ'); }
  return { user: u };
}

/* POST /api/auth/change-password */
async function changePassword(ctx) {
  const u = await auth.requireUser(ctx.req);
  const row = await db.one('SELECT pass_hash FROM users WHERE id = $1', [u.id]);
  if (!(await auth.checkPassword(ctx.body.currentPassword, row.pass_hash))) {
    throw new ApiError(401, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  }
  const pw = V.newPassword(ctx.body);
  if (await auth.checkPassword(pw, row.pass_hash)) {
    throw new ApiError(422, 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน');
  }
  await db.query('UPDATE users SET pass_hash = $1 WHERE id = $2', [await auth.hashPassword(pw), u.id]);
  await auth.dropOtherSessions(ctx.req, u.id);
  return { ok: true };
}

module.exports = { config, register, login, logout, me, changePassword };
