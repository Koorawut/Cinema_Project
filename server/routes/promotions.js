/* =============================================================
   /api/promotions* (สาธารณะ) + /api/admin/promotions* (ผู้ดูแล)
   redeem คืนราคาที่คำนวณแล้วเมื่อส่งรอบฉาย+ที่นั่งมาด้วย (P-08) — ดู server/pricing.js
   ============================================================= */
'use strict';

const crypto = require('crypto');
const db = require('../db');
const auth = require('../auth');
const V = require('../validate');
const images = require('../images');
const S = require('../schedule');
const M = require('../movies');
const pricing = require('../pricing');
const { ApiError } = require('../http');

const COLS = 'id, code, title, summary, details, terms, image, rule_type, rule_value, weekday, time_from, time_to, seat_count';

function rowToRule(r) {
  if (!r.rule_type) { return null; }
  return { type: r.rule_type, value: Number(r.rule_value), weekday: r.weekday == null ? null : Number(r.weekday),
    timeFrom: r.time_from || null, timeTo: r.time_to || null, seatCount: r.seat_count == null ? null : Number(r.seat_count) };
}
function rowToPromotion(r) {
  return { id: r.id, code: r.code, title: r.title, summary: r.summary, details: r.details,
    terms: (r.terms || []).slice(), image: r.image || '', rule: rowToRule(r) };
}

/* โปรจากรหัส (ตัดช่องว่าง ไม่สนตัวพิมพ์) — null เมื่อไม่มี */
async function findByCode(raw) {
  const code = V.str(raw).trim().toUpperCase().slice(0, 40);
  const r = code ? await db.one('SELECT ' + COLS + ' FROM promotions WHERE code = $1', [code]) : null;
  return r ? rowToPromotion(r) : null;
}
async function all() {
  const rows = await db.query('SELECT ' + COLS + ' FROM promotions ORDER BY created_at, id');
  return rows.map(rowToPromotion);
}
async function byId(id) {
  const r = await db.one('SELECT ' + COLS + ' FROM promotions WHERE id = $1', [id]);
  return r ? rowToPromotion(r) : null;
}

/* GET /api/promotions */
function list() { return all(); }

/* GET /api/promotions/:id */
async function detail(ctx) {
  const p = await byId(ctx.params.id);
  if (!p) { throw new ApiError(404, 'ไม่พบโปรโมชันนี้'); }
  return p;
}

/* POST /api/promotions/redeem { code, showtimeId?, seatIds? }
   ส่งรอบ+ที่นั่งมาด้วย → คืน quote (ตรวจเงื่อนไขและคำนวณราคา) ไม่ส่ง → ตรวจแค่ว่ารหัสมีจริง */
async function redeem(ctx) {
  const promotion = await findByCode(ctx.body.code);
  if (!promotion) { throw new ApiError(404, 'ไม่พบรหัสโปรโมชันนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง'); }
  if (!ctx.body.showtimeId) {
    return { valid: true, promotion, note: 'ตรวจรหัสสำเร็จ ส่วนลดจะคำนวณในหน้ายืนยันการจอง' };
  }
  const found = await M.getShowtime(String(ctx.body.showtimeId));
  if (!found) { throw new ApiError(404, 'ไม่พบรอบฉายนี้'); }
  const seatIds = Array.isArray(ctx.body.seatIds) ? Array.from(new Set(ctx.body.seatIds.map(String))) : [];
  if (!seatIds.length) { throw new ApiError(422, 'กรุณาเลือกที่นั่งอย่างน้อย 1 ที่นั่ง'); }
  const { movie, showtime: st } = found;
  const quote = pricing.quote({ unit: movie.price, fee: S.SERVICE_FEE, seatCount: seatIds.length,
    date: st.date, time: st.time, promoCode: promotion.code, rule: promotion.rule });
  return { valid: true, promotion, quote };
}

/* GET /api/admin/promotions */
async function adminList(ctx) {
  await auth.requireAdmin(ctx.req);
  return all();
}

/* POST /api/admin/promotions */
async function adminCreate(ctx) {
  await auth.requireAdmin(ctx.req);
  const f = V.promotionFields(ctx.body);
  if (await db.one('SELECT 1 FROM promotions WHERE code = $1', [f.code])) { throw new ApiError(409, 'รหัสคูปองนี้มีอยู่แล้ว'); }
  const image = await images.resolveImage(ctx.body.image, '', 'promotions');
  const id = 'p-' + crypto.randomBytes(6).toString('hex');
  try {
    const r = await db.one(
      'INSERT INTO promotions (id, code, title, summary, details, terms, image) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ' + COLS,
      [id, f.code, f.title, f.summary, f.details, f.terms, image]);
    ctx.status = 201;
    return rowToPromotion(r);
  } catch (e) {
    await images.discardImage(image);
    if (db.isUniqueViolation(e)) { throw new ApiError(409, 'รหัสคูปองนี้มีอยู่แล้ว'); }
    throw e;
  }
}

/* PATCH /api/admin/promotions/:id — ฟิลด์ที่ไม่ส่งมาใช้ค่าเดิม */
async function adminUpdate(ctx) {
  await auth.requireAdmin(ctx.req);
  const current = await byId(ctx.params.id);
  if (!current) { throw new ApiError(404, 'ไม่พบคูปองนี้'); }
  const merged = Object.assign({}, current, ctx.body);
  const f = V.promotionFields(merged);
  if (await db.one('SELECT 1 FROM promotions WHERE code = $1 AND id <> $2', [f.code, current.id])) {
    throw new ApiError(409, 'รหัสคูปองนี้มีอยู่แล้ว');
  }
  const image = await images.resolveImage(merged.image, current.image, 'promotions');
  let r;
  try {
    r = await db.one(
      'UPDATE promotions SET code = $2, title = $3, summary = $4, details = $5, terms = $6, image = $7 WHERE id = $1 RETURNING ' + COLS,
      [current.id, f.code, f.title, f.summary, f.details, f.terms, image]);
  } catch (e) {
    if (image !== current.image) { await images.discardImage(image); }
    if (db.isUniqueViolation(e)) { throw new ApiError(409, 'รหัสคูปองนี้มีอยู่แล้ว'); }
    throw e;
  }
  if (!r) { throw new ApiError(404, 'ไม่พบคูปองนี้'); }
  if (image !== current.image) { await images.discardImage(current.image); }
  return rowToPromotion(r);
}

/* DELETE /api/admin/promotions/:id */
async function adminDelete(ctx) {
  await auth.requireAdmin(ctx.req);
  const r = await db.one('DELETE FROM promotions WHERE id = $1 RETURNING image', [ctx.params.id]);
  if (!r) { throw new ApiError(404, 'ไม่พบคูปองนี้'); }
  await images.discardImage(r.image);
  return { ok: true };
}

module.exports = { findByCode, list, detail, redeem, adminList, adminCreate, adminUpdate, adminDelete };
