/* =============================================================
   /api/admin/{movies,users,stats} — ทุก handler ตรวจสิทธิ์ admin ที่ server
   ============================================================= */
'use strict';

const db = require('../db');
const auth = require('../auth');
const V = require('../validate');
const S = require('../schedule');
const M = require('../movies');
const images = require('../images');
const { ApiError } = require('../http');
const { todayISO, toBangkokISO, now } = require('../time');

/* ---------- ภาพยนตร์ ---------- */

/* ห้ามหนัง 2 เรื่องใช้โรงเดียวกัน + ช่วงเวลาเดียวกัน ในช่วงวันที่ที่ซ้อนกัน */
async function assertNoClash(sched, movieId) {
  if (!sched.hallId) { return; }
  const clash = await db.one(
    'SELECT 1 FROM movies WHERE id <> $1 AND now_showing AND hall_id = $2 AND date_start IS NOT NULL AND date_end IS NOT NULL ' +
    'AND date_start <= $4::date AND date_end >= $3::date AND periods && $5::text[] LIMIT 1',
    [movieId, sched.hallId, sched.dateStart, sched.dateEnd, sched.periods]);
  if (clash) {
    throw new ApiError(409, 'ตารางชนกับภาพยนตร์เรื่องอื่นใน' + S.hallById(sched.hallId).name
      + ' (โรงเดียวกัน+ช่วงเวลาทับวันฉาย) กรุณาเลือกโรง/ช่วงเวลา/ช่วงวันที่ใหม่');
  }
}

async function assertTitleFree(title, movieId) {
  if (await db.one('SELECT 1 FROM movies WHERE lower(title) = lower($1) AND id <> $2', [title, movieId || ''])) {
    throw new ApiError(409, 'มีภาพยนตร์ชื่อนี้อยู่แล้ว');
  }
}

/* P-16/P-18: รอบอนาคตที่มีการจองของหนังนี้ — DISTINCT showtime_id จึงนับเป็น "รอบ"
   ไม่ใช่จำนวนการจอง (L-2) และรอบอดีตไม่กัน (booking เก่าดูจาก snapshot ได้) */
async function futureBookedRounds(movieId) {
  return db.query(
    'SELECT DISTINCT b.showtime_id FROM bookings b WHERE b.movie_id = $1 AND b.starts_at > $2',
    [movieId, now().toISOString()]);
}

/* ชื่อรอบสำหรับข้อความ error: "YYYY-MM-DD รอบเช้า" */
function roundLabel(showtimeId) {
  const p = S.parseShowtimeId(showtimeId);
  return p ? p.date + ' รอบ' + (S.periodByKey(p.period) || { label: p.period }).label : showtimeId;
}
function roundListText(showtimeIds) {
  return showtimeIds.slice(0, 5).map(roundLabel).join(', ') +
    (showtimeIds.length > 5 ? ' และอีก ' + (showtimeIds.length - 5) + ' รอบ' : '');
}

/* P-16: กันแก้โรง/ตารางฉายที่ทำให้รอบอนาคตที่มีคนจองหายไปหรือย้ายโรง
   ดูการจองของหนังนี้ที่ starts_at ยังไม่ถึง (รอบอดีตไม่กัน) แล้วตรวจว่า
   รอบเหล่านั้นยังอยู่ในตารางใหม่ (วันอยู่ในช่วง + ช่วงเวลายังมี + โรงไม่เปลี่ยน)
   เปลี่ยนเป็นไม่ฉายแล้ว (nowShowing=false) ถือเป็นการกระทบเช่นกัน */
async function assertNoAffectedBookings(current, sched) {
  const rows = await futureBookedRounds(current.id);
  if (!rows.length) { return; }
  const hallChanged = !!sched.hallId && sched.hallId !== current.hallId;
  const dropped = [];
  rows.forEach((r) => {
    const p = S.parseShowtimeId(r.showtime_id);
    if (!p) { return; }
    const removed = !sched.hallId || hallChanged || p.date < sched.dateStart || p.date > sched.dateEnd ||
      sched.periods.indexOf(p.period) === -1;
    if (removed) { dropped.push(roundLabel(r.showtime_id)); }
  });
  if (dropped.length) {
    // rows นับ DISTINCT showtime_id — จำนวน "รอบ" ที่มีการจอง ไม่ใช่จำนวนการจอง (L-2)
    throw new ApiError(409, 'แก้ตารางไม่ได้: มีการจองอยู่ใน ' + rows.length + ' รอบที่ยังไม่ถึงเวลาฉาย (' +
      roundListText(dropped) +
      ') กรุณายกเลิกการจองหรือเลือกช่วงวัน/ช่วงเวลา/โรงที่ครอบรอบเดิม');
  }
}

/* GET /api/admin/movies?search=&page=&limit= — เรียงตาม id (เสถียร) */
async function movies(ctx) {
  await auth.requireAdmin(ctx.req);
  const q = (ctx.query.get('search') || '').trim().toLowerCase();
  let list = await M.listMovies();
  if (q) { list = list.filter((m) => m.title.toLowerCase().indexOf(q) !== -1); }
  const today = await M.showtimesByMovie(list, todayISO(0));
  const items = list.map((m) => {
    const hall = S.hallById(m.hallId);
    const sts = today[m.id] || [];
    return { id: m.id, title: m.title, genres: m.genres.slice(), price: m.price,
      durationMin: m.durationMin, ageRating: m.ageRating, director: m.director,
      synopsis: m.synopsis, poster: m.poster, nowShowing: m.nowShowing,
      releaseDate: m.releaseDate,
      hallId: m.hallId, hall: hall ? hall.name : null,
      dateStart: m.dateStart, dateEnd: m.dateEnd, periods: m.periods.slice(),
      periodLabels: S.periodLabels(m.periods),
      todayStatus: m.nowShowing ? (sts.length ? (sts.some((s) => s.status === 'available') ? 'available' : 'full') : 'noshow') : 'upcoming' };
  });
  const pg = paging(ctx);
  if (!pg) { return items; }
  // หน้าเกินขอบเขต → คืนหน้าสุดท้ายแทนลิสต์เปล่า (metadata ตรงหน้าที่คืนจริง)
  const totalPages = Math.max(1, Math.ceil(items.length / pg.limit));
  const page = Math.min(pg.page, totalPages);
  return { items: items.slice((page - 1) * pg.limit, page * pg.limit), page, limit: pg.limit,
    total: items.length, totalPages };
}

const UPSERT_COLS = 'title, genres, price, duration_min, age_rating, director, synopsis, release_date, now_showing, poster, hall_id, date_start, date_end, periods';
function upsertParams(f, sched, showing, poster) {
  return [f.title, f.genres, f.price, f.durationMin, f.ageRating, f.director, f.synopsis, f.releaseDate,
    showing, poster, sched.hallId, sched.dateStart, sched.dateEnd, sched.periods];
}

/* POST /api/admin/movies */
async function createMovie(ctx) {
  await auth.requireAdmin(ctx.req);
  const data = ctx.body;
  const f = V.movieFields(data);
  if (!f.releaseDate) { f.releaseDate = todayISO(0); }
  const showing = data.nowShowing !== false;
  const sched = S.normalizeSchedule(Object.assign({}, data, { nowShowing: showing }));
  await assertTitleFree(f.title);
  await assertNoClash(sched, '');
  const poster = await images.resolveImage(data.poster, '', 'posters');
  for (let attempt = 0; attempt < 5; attempt++) {
    const max = await db.one("SELECT coalesce(max(substring(id from 2)::int), 0) AS n FROM movies WHERE id ~ '^m[0-9]+$'");
    const id = 'm' + String(Number(max.n) + 1).padStart(2, '0');
    try {
      const r = await db.one(
        'INSERT INTO movies (id, ' + UPSERT_COLS + ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ' +
        'RETURNING ' + M.MOVIE_COLS, [id].concat(upsertParams(f, sched, showing, poster)));
      ctx.status = 201;
      return M.rowToMovie(r);
    } catch (e) {
      if (db.isUniqueViolation(e, 'movies_title_lower_key')) { await images.discardImage(poster); throw new ApiError(409, 'มีภาพยนตร์ชื่อนี้อยู่แล้ว'); }
      if (db.isUniqueViolation(e)) { continue; } // id ชนกับคำขอที่สร้างพร้อมกัน
      await images.discardImage(poster);
      throw e;
    }
  }
  await images.discardImage(poster);
  throw new ApiError(503, 'ระบบไม่ว่าง กรุณาลองบันทึกอีกครั้ง');
}

/* PATCH /api/admin/movies/:id — ฟิลด์ที่ไม่ส่งมาใช้ค่าเดิม
   แก้ราคาไม่กระทบรายการจองเดิม (bookings เก็บ snapshot ราคา) */
async function updateMovie(ctx) {
  await auth.requireAdmin(ctx.req);
  const current = await M.getMovie(ctx.params.id);
  if (!current) { throw new ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
  const data = ctx.body;
  const merged = Object.assign({}, current);
  Object.keys(data).forEach((k) => { if (data[k] !== undefined && k !== 'id') { merged[k] = data[k]; } });
  const f = V.movieFields(merged);
  const showing = !!merged.nowShowing;
  const sched = S.normalizeSchedule(Object.assign({}, merged, { nowShowing: showing }));
  if (f.title.toLowerCase() !== current.title.toLowerCase()) { await assertTitleFree(f.title, current.id); }
  await assertNoAffectedBookings(current, sched); // P-16: ก่อนตรวจชนรอบ
  await assertNoClash(sched, current.id);
  const poster = data.poster !== undefined ? await images.resolveImage(data.poster, current.poster, 'posters') : current.poster;
  let r;
  try {
    r = await db.one(
      'UPDATE movies SET (' + UPSERT_COLS + ') = ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ' +
      'WHERE id = $1 RETURNING ' + M.MOVIE_COLS, [current.id].concat(upsertParams(f, sched, showing, poster)));
  } catch (e) {
    if (poster !== current.poster) { await images.discardImage(poster); }
    if (db.isUniqueViolation(e)) { throw new ApiError(409, 'มีภาพยนตร์ชื่อนี้อยู่แล้ว'); }
    throw e;
  }
  if (!r) { throw new ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
  if (poster !== current.poster) { await images.discardImage(current.poster); }
  return M.rowToMovie(r);
}

/* DELETE /api/admin/movies/:id — P-18: ห้ามลบหนังที่มีรอบอนาคตยังมีการจอง
   (รอบที่เริ่มฉายไปแล้วไม่กัน — การจองเดิมเก็บ movie_title snapshot จึงยังแสดงในประวัติได้) */
async function deleteMovie(ctx) {
  await auth.requireAdmin(ctx.req);
  const current = await M.getMovie(ctx.params.id);
  if (!current) { throw new ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
  const booked = await futureBookedRounds(current.id);
  if (booked.length) {
    throw new ApiError(409, 'ลบไม่ได้: มีการจองอยู่ใน ' + booked.length + ' รอบที่ยังไม่ถึงเวลาฉาย (' +
      roundListText(booked.map((x) => x.showtime_id)) +
      ') กรุณารอจนรอบที่มีการจองฉายไปแล้วจึงจะลบได้ (ระบบยังไม่รองรับการยกเลิกการจอง)');
  }
  const r = await db.one('DELETE FROM movies WHERE id = $1 RETURNING title, poster', [current.id]);
  if (!r) { throw new ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
  await images.discardImage(r.poster);
  return { ok: true, removedTitle: r.title };
}

/* ---------- บัญชีผู้ใช้ ---------- */

/* พารามิเตอร์แบ่งหน้า (opt-in): ไม่ส่ง page เลย = รูปแบบเดิมทั้งหมด (array)
   ส่ง page มา = { items, page, limit, total, totalPages } — limit จำกัด 1–100 (default 20)
   page จำกัดบนที่ 1e6 กันเลขหลักยาวเกิน bigint ของ Postgres (A4 LOW-1) */
const PAGE_MAX = 1000000;
function paging(ctx) {
  const raw = ctx.query.get('page');
  if (raw == null || raw === '') { return null; }
  const page = Math.min(PAGE_MAX, Math.max(1, parseInt(raw, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(ctx.query.get('limit'), 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

/* GET /api/admin/users?search=&page=&limit= */
async function users(ctx) {
  await auth.requireAdmin(ctx.req);
  const q = (ctx.query.get('search') || '').trim().toLowerCase().slice(0, 100);
  const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
  const WHERE = '$1 = \'\' OR lower(u.username) LIKE $2 OR lower(u.email) LIKE $2';
  const SELECT = 'SELECT u.id, u.username, u.email, u.role, u.created_at, ' +
    '(SELECT count(*)::int FROM bookings b WHERE b.user_id = u.id) AS booking_count FROM users u ';
  const map = (rows) => rows.map((r) => ({ id: r.id, username: r.username, email: r.email, role: r.role,
    createdAt: toBangkokISO(r.created_at), bookingCount: Number(r.booking_count) }));
  const pg = paging(ctx);
  if (!pg) {
    const rows = await db.query(SELECT + 'WHERE ' + WHERE + ' ORDER BY u.created_at, u.id', [q, like]);
    return map(rows);
  }
  // นับก่อน เพื่อหน้าเกินขอบเขตจะได้ดึงหน้าสุดท้ายแทนคืนลิสต์เปล่า (metadata ตรงหน้าที่คืนจริง)
  const total = Number((await db.one('SELECT count(*)::int AS n FROM users u WHERE ' + WHERE, [q, like])).n);
  const totalPages = Math.max(1, Math.ceil(total / pg.limit));
  const page = Math.min(pg.page, totalPages);
  const rows = await db.query(
    SELECT + 'WHERE ' + WHERE + ' ORDER BY u.created_at, u.id LIMIT $3 OFFSET $4',
    [q, like, pg.limit, (page - 1) * pg.limit]);
  return { items: map(rows), page, limit: pg.limit, total, totalPages };
}

/* PATCH /api/admin/users/:id/role { role } */
async function setRole(ctx) {
  const me = await auth.requireAdmin(ctx.req);
  const role = ctx.body.role;
  if (role !== 'user' && role !== 'admin') { throw new ApiError(422, 'สิทธิ์ไม่ถูกต้อง'); }
  const u = await db.one('SELECT id FROM users WHERE id = $1', [ctx.params.id]);
  if (!u) { throw new ApiError(404, 'ไม่พบบัญชีนี้'); }
  if (u.id === me.id && role !== 'admin') { throw new ApiError(422, 'ไม่สามารถลดสิทธิ์ของตัวเองได้'); }
  // ป้องกันซ้ำในระดับ SQL: ไม่ลด admin คนสุดท้าย แม้มีคำขอพร้อมกัน
  const r = await db.one(
    "UPDATE users SET role = $2 WHERE id = $1 AND ($2 = 'admin' OR (SELECT count(*) FROM users WHERE role = 'admin' AND id <> $1) > 0) " +
    'RETURNING id, role', [u.id, role]);
  if (!r) { throw new ApiError(422, 'ไม่สามารถลดสิทธิ์ผู้ดูแลระบบคนสุดท้ายได้'); }
  return { id: r.id, role: r.role };
}

/* DELETE /api/admin/users/:id — ห้ามลบตัวเองและ admin คนสุดท้าย; ประวัติการจองคงอยู่ (user_id → NULL) */
async function deleteUser(ctx) {
  const me = await auth.requireAdmin(ctx.req);
  const u = await db.one('SELECT id, role FROM users WHERE id = $1', [ctx.params.id]);
  if (!u) { throw new ApiError(404, 'ไม่พบบัญชีนี้'); }
  if (u.id === me.id) { throw new ApiError(422, 'ไม่สามารถลบบัญชีของตัวเองได้'); }
  const r = await db.one(
    "DELETE FROM users WHERE id = $1 AND (role <> 'admin' OR (SELECT count(*) FROM users WHERE role = 'admin' AND id <> $1) > 0) RETURNING id",
    [u.id]);
  if (!r) { throw new ApiError(422, 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้'); }
  return { ok: true };
}

/* ---------- สถิติ (ทุกตัวเลขจาก DB) ---------- */

/* GET /api/admin/stats?days= (0 = ทั้งหมด) — วันที่นับตามเขตเวลาไทย */
async function stats(ctx) {
  await auth.requireAdmin(ctx.req);
  const days = Math.max(0, Math.min(3650, parseInt(ctx.query.get('days'), 10) || 0));
  const minDate = days ? todayISO(-days) : '0001-01-01';
  const LOCAL_DAY = "(b.created_at AT TIME ZONE 'Asia/Bangkok')::date";
  const SEATS = '(SELECT count(*) FROM booking_seats s WHERE s.booking_id = b.id)';
  const [users, totals, byMovie, daily] = await Promise.all([
    db.one('SELECT count(*)::int AS n FROM users'),
    db.one(
      'SELECT count(*)::int AS bookings, coalesce(sum(' + SEATS + '), 0)::int AS tickets, ' +
      'coalesce(sum(b.total), 0)::int AS value, coalesce(sum(b.service_fee * ' + SEATS + '), 0)::int AS fees ' +
      "FROM bookings b WHERE b.status = 'confirmed' AND " + LOCAL_DAY + ' >= $1::date', [minDate]),
    db.query(
      'SELECT b.movie_title AS title, coalesce(sum(' + SEATS + '), 0)::int AS tickets, coalesce(sum(b.total), 0)::int AS value ' +
      "FROM bookings b WHERE b.status = 'confirmed' AND " + LOCAL_DAY + ' >= $1::date ' +
      'GROUP BY b.movie_title ORDER BY tickets DESC, title', [minDate]),
    db.query(
      'SELECT to_char(' + LOCAL_DAY + ", 'YYYY-MM-DD') AS d, count(*)::int AS bookings, coalesce(sum(b.total), 0)::int AS value " +
      "FROM bookings b WHERE b.status = 'confirmed' AND " + LOCAL_DAY + ' >= $1::date GROUP BY 1', [todayISO(-13)])
  ]);
  const dayMap = {};
  daily.forEach((r) => { dayMap[r.d] = r; });
  const series = [];
  for (let d = 13; d >= 0; d--) {
    const iso = todayISO(-d);
    const r = dayMap[iso];
    series.push({ date: iso, bookings: r ? Number(r.bookings) : 0, value: r ? Number(r.value) : 0 });
  }
  return {
    isDemoData: false,
    totalUsers: Number(users.n),
    demoBaselineUsers: 0,
    bookings: Number(totals.bookings), tickets: Number(totals.tickets), confirmedValue: Number(totals.value),
    serviceFeeEstimate: Number(totals.fees),
    byMovie: byMovie.map((r) => ({ title: r.title, tickets: Number(r.tickets), value: Number(r.value) })),
    daily: series
  };
}

module.exports = { movies, createMovie, updateMovie, deleteMovie, users, setRole, deleteUser, stats };
