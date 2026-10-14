/* =============================================================
   /api/bookings, /api/me/bookings
   การจองเป็น atomic: insert bookings + booking_seats ใน SQL คำสั่งเดียว (CTE)
   ถ้าที่นั่งใดชน UNIQUE (showtime_id, seat_id) ทั้งคำสั่ง rollback → 409
   ============================================================= */
'use strict';

const crypto = require('crypto');
const db = require('../db');
const auth = require('../auth');
const S = require('../schedule');
const M = require('../movies');
const V = require('../validate');
const pricing = require('../pricing');
const promotions = require('./promotions');
const { ApiError } = require('../http');
const { toBangkokISO } = require('../time');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ตัด 0/O/1/I ที่อ่านสับสน

function newCode() {
  const bytes = crypto.randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i++) { s += CODE_CHARS[bytes[i] % CODE_CHARS.length]; }
  return 'MAI-' + s;
}

function sortSeats(seats) {
  return seats.sort((a, b) => (a.row === b.row ? a.number - b.number : (a.row < b.row ? -1 : 1)));
}

function rowToBooking(r, seats) {
  return { id: r.id, code: r.code, userId: r.user_id, movieId: r.movie_id, movieTitle: r.movie_title,
    showtimeId: r.showtime_id, startsAt: toBangkokISO(r.starts_at), hall: r.hall,
    seats: sortSeats(seats || []), unitPrice: Number(r.unit_price), serviceFee: Number(r.service_fee),
    discount: Number(r.discount || 0), promoCode: r.promo_code || null,
    total: Number(r.total), status: r.status, createdAt: toBangkokISO(r.created_at) };
}

async function takenAmong(showtimeId, seatIds) {
  const rows = await db.query(
    'SELECT seat_id FROM booking_seats WHERE showtime_id = $1 AND seat_id = ANY($2::text[])', [showtimeId, seatIds]);
  const taken = new Set(rows.map((r) => r.seat_id));
  return seatIds.filter((id) => taken.has(id));
}

/* POST /api/bookings { showtimeId, seatIds[], promoCode? } — ราคาคำนวณที่ server เท่านั้น (ไม่รับ total จาก client) */
async function create(ctx) {
  const u = await auth.requireUser(ctx.req);
  const found = await M.getShowtime(String(ctx.body.showtimeId || ''));
  if (!found) { throw new ApiError(404, 'ไม่พบรอบฉายนี้'); }
  const { movie, showtime: st } = found;
  if (st.status === 'full') { throw new ApiError(409, 'รอบฉายนี้เต็มแล้ว กรุณาเลือกรอบอื่น'); }

  const raw = Array.isArray(ctx.body.seatIds) ? ctx.body.seatIds : [];
  const wanted = Array.from(new Set(raw.map(String)));
  if (!wanted.length) { throw new ApiError(422, 'กรุณาเลือกที่นั่งอย่างน้อย 1 ที่นั่ง'); }
  const hall = S.hallById(st.hallId);
  const valid = new Map(S.allSeats(hall).map((s) => [s.id, s]));
  const invalid = wanted.filter((id) => !valid.has(id));
  if (invalid.length) { throw new ApiError(422, 'รหัสที่นั่งไม่ถูกต้อง: ' + invalid.slice(0, 10).join(', ')); }

  const pre = await takenAmong(st.id, wanted);
  if (pre.length) { throw new ApiError(409, 'ที่นั่งที่เลือกถูกจองไปแล้ว: ' + pre.join(', '), { conflicts: pre }); }

  const seats = sortSeats(wanted.map((id) => Object.assign({}, valid.get(id))));
  const unit = movie.price;
  const fee = S.SERVICE_FEE;
  let promo = null;
  const rawCode = V.str(ctx.body.promoCode).trim();
  if (rawCode) {
    promo = await promotions.findByCode(rawCode);
    if (!promo) { throw new ApiError(404, 'ไม่พบรหัสโปรโมชันนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง'); }
  }
  const q = pricing.quote({ unit, fee, seatCount: seats.length, date: st.date, time: st.time,
    promoCode: promo ? promo.code : null, rule: promo ? promo.rule : null });
  const total = q.total;

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = 'b-' + crypto.randomBytes(8).toString('hex');
    const code = newCode();
    try {
      const rows = await db.query(
        'WITH b AS (' +
        '  INSERT INTO bookings (id, code, user_id, movie_id, movie_title, showtime_id, starts_at, hall, unit_price, service_fee, total, promo_code, discount, status)' +
        "  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'confirmed')" +
        '  RETURNING id, code, user_id, movie_id, movie_title, showtime_id, starts_at, hall, unit_price, service_fee, total, promo_code, discount, status, created_at' +
        '), s AS (' +
        '  INSERT INTO booking_seats (booking_id, showtime_id, seat_id, seat_row, seat_number)' +
        '  SELECT b.id, b.showtime_id, x.seat_id, x.seat_row, x.seat_number' +
        '  FROM b, unnest($14::text[], $15::text[], $16::int[]) AS x(seat_id, seat_row, seat_number)' +
        '  RETURNING seat_id' +
        ') SELECT b.*, (SELECT count(*) FROM s)::int AS seat_count FROM b',
        [id, code, u.id, movie.id, movie.title, st.id, st.startsAt, st.hall, unit, fee, total,
          q.promoCode, q.discount,
          seats.map((s) => s.id), seats.map((s) => s.row), seats.map((s) => s.number)]);
      ctx.status = 201;
      return { booking: rowToBooking(rows[0], seats) };
    } catch (e) {
      if (db.isUniqueViolation(e, 'booking_seats_showtime_seat_key')) {
        // แพ้การแข่งกับคำขออื่นที่ยืนยันก่อนเสี้ยววินาที
        const conflicts = await takenAmong(st.id, wanted);
        throw new ApiError(409, 'ที่นั่งที่เลือกถูกจองไปแล้ว: ' + (conflicts.join(', ') || wanted.join(', ')),
          { conflicts: conflicts.length ? conflicts : wanted });
      }
      if (db.isUniqueViolation(e)) { continue; } // รหัสการจองซ้ำ — สุ่มใหม่
      throw e;
    }
  }
  throw new ApiError(503, 'ระบบไม่ว่าง กรุณาลองยืนยันการจองอีกครั้ง');
}

/* ประวัติการจอง + ที่นั่ง ของรายการที่ระบุ */
async function withSeats(rows) {
  if (!rows.length) { return []; }
  const seatRows = await db.query(
    'SELECT booking_id, seat_id, seat_row, seat_number FROM booking_seats WHERE booking_id = ANY($1::text[])',
    [rows.map((r) => r.id)]);
  const byBooking = {};
  seatRows.forEach((s) => {
    (byBooking[s.booking_id] = byBooking[s.booking_id] || []).push({ id: s.seat_id, row: s.seat_row, number: Number(s.seat_number) });
  });
  return rows.map((r) => rowToBooking(r, byBooking[r.id]));
}

/* GET /api/me/bookings — ตัวตนจาก session เท่านั้น */
async function mine(ctx) {
  const u = await auth.requireUser(ctx.req);
  const rows = await db.query(
    'SELECT id, code, user_id, movie_id, movie_title, showtime_id, starts_at, hall, unit_price, service_fee, total, promo_code, discount, status, created_at ' +
    'FROM bookings WHERE user_id = $1 ORDER BY created_at DESC', [u.id]);
  return withSeats(rows);
}

module.exports = { create, mine };
