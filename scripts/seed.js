/* =============================================================
   npm run db:seed                       — seed ลงฐานข้อมูลว่าง
   npm run db:seed -- --reset            — ล้างข้อมูลทั้งหมดแล้ว seed ใหม่
   npm run db:seed -- --refresh-schedule — เลื่อนวันฉายหนัง seed ให้เริ่มวันนี้
                                           + เติมที่นั่งจองให้รอบที่ยังว่างเปล่า
   ข้อมูลสาธิตทั้งหมดเป็น "แถวจริง" ใน DB (ทุกตัวเลขในหน้าเว็บนับจาก DB):
   - หนัง 11 เรื่อง + คูปอง 3 ใบ จาก assets/data/seed.json
   - admin/admin123, demo/demo123 (เฉพาะ dev/PGlite; production ใช้ env ADMIN_PASSWORD/DEMO_PASSWORD หรือสุ่ม — P-14)
     + ลูกค้าตัวอย่าง guest01–guest48
   - ที่นั่งถูกจอง 28–70% ทุกรอบ (PRNG mulberry32 เดียวกับ mock)
     รอบเย็น The Hollow Choir (m02) วันนี้เต็ม — fixture ที่ชุดทดสอบใช้
   - ประวัติการจองย้อนหลัง 30 วัน + การจองของ demo: MAI-7Q3F, MAI-2K8D
   ============================================================= */
'use strict';

require('./env');
const crypto = require('crypto');
const db = require('../server/db');
const auth = require('../server/auth');
const S = require('../server/schedule');
const M = require('../server/movies');
const { todayISO, startsAtISO } = require('../server/time');
const { refreshSchedule } = require('../server/schedule-refresh'); // cron ใช้ร่วมกัน (ไม่ duplicate)
const { migrate } = require('./migrate');
const SEED = require('../assets/data/seed.json');

const GUESTS = 48;
const HISTORY_DAYS = 30;
const BATCH = 400;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/* รอบในอดีตที่ใช้สร้างประวัติ (โรง+ช่วงเวลาไม่ชนกัน ตาม SEED_SCHEDULE) */
const PAST_SHOWS = [['m01', 'morning'], ['m05', 'afternoon'], ['m02', 'evening'],
  ['m04', 'morning'], ['m03', 'afternoon'], ['m07', 'evening']];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.now();
const codeRnd = mulberry32(hashStr('booking-codes-' + todayISO(0) + '-' + NOW));
const usedCodes = new Set();
async function loadUsedCodes() {
  (await db.query('SELECT code FROM bookings')).forEach((r) => usedCodes.add(r.code));
}
function nextCode() {
  for (;;) {
    let s = 'MAI-';
    for (let i = 0; i < 4; i++) { s += CODE_CHARS[Math.floor(codeRnd() * CODE_CHARS.length)]; }
    if (!usedCodes.has(s)) { usedCodes.add(s); return s; }
  }
}

/* ---------- รหัสผ่าน seed (P-14) ----------
   pglite (dev ในเครื่อง): คง admin123/demo123 จาก seed.json เพื่อให้ T1/smoke/README ใช้ได้
   อื่น (production/Neon): อ่านจาก env ADMIN_PASSWORD/DEMO_PASSWORD — ไม่ได้ตั้ง = สุ่ม 16 ตัว
   แล้วพิมพ์ออกทาง console ครั้งเดียวพร้อมคำเตือน */
const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomPassword() {
  return Array.from(crypto.randomBytes(16)).map((b) => PW_CHARS[b % PW_CHARS.length]).join('');
}
function seedPasswords() {
  const hints = SEED.demoPasswordHints;
  if ((process.env.DATABASE_URL || '').startsWith('pglite:')) {
    return { admin: hints.admin, demo: hints.demo };
  }
  const out = {};
  [['admin', 'ADMIN_PASSWORD'], ['demo', 'DEMO_PASSWORD']].forEach(([who, envName]) => {
    const fromEnv = process.env[envName];
    if (fromEnv) {
      out[who] = fromEnv;
      console.log('seed: รหัสผ่าน ' + who + ' มาจาก env ' + envName);
      return;
    }
    out[who] = randomPassword();
    console.log('seed: สุ่มรหัสผ่าน ' + who + ' (ไม่ได้ตั้ง ' + envName + ') = ' + out[who]);
    console.log('seed: !! เก็บรหัสนี้ทันที — จะไม่แสดงซ้ำอีก ถ้าหายต้อง seed ใหม่หรือ reset รหัสผ่านผ่านหน้าเว็บ');
  });
  return out;
}

/* ---------- insert แบบกลุ่มด้วย unnest (1 คำสั่งต่อ BATCH แถว) ---------- */
async function insertBookings(list) {
  for (let i = 0; i < list.length; i += BATCH) {
    const part = list.slice(i, i + BATCH);
    const col = (f) => part.map(f);
    await db.query(
      'INSERT INTO bookings (id, code, user_id, movie_id, movie_title, showtime_id, starts_at, hall, unit_price, service_fee, total, status, created_at) ' +
      'SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[], ' +
      '$8::text[], $9::int[], $10::int[], $11::int[], $12::text[], $13::timestamptz[])',
      [col((b) => b.id), col((b) => b.code), col((b) => b.userId), col((b) => b.movieId), col((b) => b.movieTitle),
        col((b) => b.showtimeId), col((b) => b.startsAt), col((b) => b.hall), col((b) => b.unitPrice),
        col((b) => b.serviceFee), col((b) => b.total), col(() => 'confirmed'), col((b) => b.createdAt)]);
    const seats = [];
    part.forEach((b) => b.seats.forEach((s) => seats.push([b.id, b.showtimeId, s.id, s.row, s.number])));
    await db.query(
      'INSERT INTO booking_seats (booking_id, showtime_id, seat_id, seat_row, seat_number) ' +
      'SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[])',
      [0, 1, 2, 3, 4].map((k) => seats.map((s) => s[k])));
  }
}

function makeBooking(o) {
  const unit = o.movie.price;
  const fee = S.SERVICE_FEE;
  return { id: o.id || ('b-' + crypto.randomBytes(8).toString('hex')),
    code: o.code || nextCode(), userId: o.userId, movieId: o.movie.id, movieTitle: o.movie.title,
    showtimeId: S.showtimeId(o.movie.id, o.date, o.period),
    startsAt: startsAtISO(o.date, S.periodByKey(o.period).time), hall: S.hallById(o.hallId).name,
    seats: o.seats, unitPrice: unit, serviceFee: fee, total: (unit + fee) * o.seats.length,
    createdAt: new Date(o.createdAt).toISOString() };
}

/* ที่นั่ง "ลูกค้าคนอื่น" ของรอบหนึ่ง: เป้าหมาย 28–70% (หรือเต็มทั้งรอบ)
   แบ่งเป็นการจองละ 1–4 ที่นั่งเรียงกัน กระจายให้ guest แบบสุ่มคงที่ */
function occupancyBookings(movie, date, period, hallId, guests, taken, full) {
  const hall = S.hallById(hallId);
  const stId = S.showtimeId(movie.id, date, period);
  const rnd = mulberry32(hashStr(stId));
  const target = 0.28 + rnd() * 0.42;
  const pool = S.allSeats(hall);
  const count = full ? pool.length : Math.round(pool.length * target);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const order = (s) => hall.rows.indexOf(s.row) * 100 + s.number;
  const chosen = pool.slice(0, count).filter((s) => !taken.has(s.id)).sort((a, b) => order(a) - order(b));
  const startMs = Date.parse(startsAtISO(date, S.periodByKey(period).time));
  const out = [];
  for (let i = 0; i < chosen.length;) {
    const n = 1 + Math.floor(rnd() * 4);
    const seats = chosen.slice(i, i + n);
    i += n;
    // จองล่วงหน้า 1 ชม.–7 วันก่อนรอบฉาย และไม่เกินเวลาปัจจุบัน
    const created = Math.min(NOW - 60000 - Math.floor(rnd() * 3600000),
      startMs - 3600000 - Math.floor(rnd() * 6 * 86400000));
    out.push(makeBooking({ movie, date, period, hallId, seats, createdAt: created,
      userId: guests[Math.floor(rnd() * guests.length)] }));
  }
  return out;
}

async function takenSeats(stId) {
  const rows = await db.query('SELECT seat_id FROM booking_seats WHERE showtime_id = $1', [stId]);
  return new Set(rows.map((r) => r.seat_id));
}

/* ---------- ขั้นตอน seed ---------- */

async function seedUsers() {
  const pw = seedPasswords(); // P-14: env/สุ่ม บน production, admin123/demo123 เฉพาะ pglite
  for (const u of SEED.users) {
    await db.query('INSERT INTO users (id, username, email, pass_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [u.id, u.username, u.email, await auth.hashPassword(pw[u.username]), u.role, u.createdAt]);
  }
  // ลูกค้าตัวอย่าง: รหัสผ่านสุ่มที่ไม่มีใครรู้ (ล็อกอินไม่ได้ มีไว้เป็นเจ้าของการจองสาธิต)
  const guestHash = await auth.hashPassword(crypto.randomBytes(24).toString('base64url'));
  const base = Date.parse(todayISO(-HISTORY_DAYS - 1) + 'T09:00:00+07:00');
  const rows = { id: [], username: [], email: [], created: [] };
  for (let i = 1; i <= GUESTS; i++) {
    const n = String(i).padStart(2, '0');
    rows.id.push('u-guest' + n);
    rows.username.push('guest' + n);
    rows.email.push('guest' + n + '@maison.demo');
    rows.created.push(new Date(base - (GUESTS - i) * 7 * 3600000).toISOString());
  }
  await db.query(
    "INSERT INTO users (id, username, email, pass_hash, role, created_at) " +
    "SELECT x.id, x.username, x.email, $5, 'user', x.created " +
    'FROM unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[]) AS x(id, username, email, created)',
    [rows.id, rows.username, rows.email, rows.created, guestHash]);
  return rows.id;
}

async function seedCatalog() {
  for (const m of SEED.movies) {
    const sch = m.nowShowing ? S.SEED_SCHEDULE[m.id] : null;
    await db.query(
      'INSERT INTO movies (id, title, genres, price, duration_min, age_rating, director, synopsis, release_date, now_showing, ' +
      'poster, coming_days, hall_id, date_start, date_end, periods) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)',
      [m.id, m.title, m.genres, m.price, m.durationMin || 0, m.ageRating || 'ยังไม่ประกาศ', m.director || '', m.synopsis || '',
        m.releaseDate || null, !!m.nowShowing, m.poster || '', m.comingDays == null ? null : m.comingDays,
        sch ? sch.hallId : '', sch ? todayISO(sch.from) : null, sch ? todayISO(sch.to) : null, sch ? sch.periods : []]);
  }
  for (let i = 0; i < SEED.promotions.length; i++) {
    const p = SEED.promotions[i];
    const r = p.rule || null;
    // created_at เรียงตามลำดับใน seed.json (หน้าเว็บแสดงตามลำดับนี้)
    await db.query(
      'INSERT INTO promotions (id, code, title, summary, details, terms, image, created_at, ' +
      'rule_type, rule_value, weekday, time_from, time_to, seat_count) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, now() - make_interval(secs => $8), $9, $10, $11, $12, $13, $14)',
      [p.id, p.code, p.title, p.summary, p.details, p.terms || [], p.image || '', SEED.promotions.length - i,
        r ? r.type : null, r ? r.value : null, r && r.weekday != null ? r.weekday : null,
        r ? r.timeFrom || null : null, r ? r.timeTo || null : null, r && r.seatCount != null ? r.seatCount : null]);
  }
}

/* การจองของบัญชี demo (หน้า History มีข้อมูลให้ดู) — แบบเดียวกับ mock */
function demoBookings(movies) {
  function mk(code, movieId, date, period, hallId, labels, daysAgo) {
    const seats = labels.map((l) => ({ id: hallId + '-' + l, row: l.charAt(0), number: parseInt(l.slice(1), 10) }));
    usedCodes.add(code);
    return makeBooking({ id: 'b-' + code, code, userId: 'u-demo', movie: movies[movieId], date, period, hallId, seats,
      createdAt: NOW - daysAgo * 86400000 });
  }
  return [mk('MAI-7Q3F', 'm05', todayISO(-6), 'afternoon', 'hall-01', ['E7', 'E8'], 7),
    mk('MAI-2K8D', 'm03', todayISO(-13), 'afternoon', 'hall-02', ['C4'], 14)];
}

/* รอบในอดีต 30 วัน (ประวัติสำหรับสถิติ admin) */
function historyBookings(movies, guests, demo) {
  const demoSeats = {};
  demo.forEach((b) => { demoSeats[b.showtimeId] = new Set(b.seats.map((s) => s.id)); });
  const out = [];
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const date = todayISO(-d);
    PAST_SHOWS.forEach(([id, period]) => {
      const m = movies[id];
      const sch = S.SEED_SCHEDULE[id];
      if (!m || !sch || (m.releaseDate && date < m.releaseDate)) { return; }
      const stId = S.showtimeId(id, date, period);
      out.push(...occupancyBookings(m, date, period, sch.hallId, guests, demoSeats[stId] || new Set(), false));
    });
  }
  return out;
}

/* รอบที่เปิดขายอยู่ (วันนี้ – +5) — เติมเฉพาะรอบที่ยังไม่มีการจองเลย
   ยกเว้นรอบเย็น m02 วันนี้ที่ต้องเต็มเสมอ */
async function windowBookings(guests) {
  const movies = await M.listMovies('now_showing');
  const fullId = S.showtimeId('m02', todayISO(0), 'evening');
  const out = [];
  for (let d = 0; d < S.SHOW_DAYS; d++) {
    const date = todayISO(d);
    for (const m of movies) {
      for (const stId of S.showtimeIdsFor(m, date)) {
        const full = stId === fullId;
        const taken = await takenSeats(stId);
        if (taken.size && !full) { continue; }
        const p = S.parseShowtimeId(stId);
        out.push(...occupancyBookings(m, date, p.period, m.hallId, guests, taken, full));
      }
    }
  }
  return out;
}

async function guestIds() {
  const rows = await db.query("SELECT id FROM users WHERE id LIKE 'u-guest%' ORDER BY id");
  return rows.map((r) => r.id);
}

/* ใส่กติกาส่วนลดให้โปร seed ที่มีอยู่แล้วใน DB โดยไม่ล้างข้อมูล (ใช้หลัง migrate ครั้งแรกที่เพิ่มคอลัมน์กติกา) */
async function syncPromotionRules() {
  for (const p of SEED.promotions) {
    const r = p.rule;
    if (!r) { continue; }
    await db.query(
      'UPDATE promotions SET rule_type = $2, rule_value = $3, weekday = $4, time_from = $5, time_to = $6, seat_count = $7 ' +
      'WHERE code = $1 AND rule_type IS NULL',
      [p.code, r.type, r.value, r.weekday != null ? r.weekday : null, r.timeFrom || null, r.timeTo || null,
        r.seatCount != null ? r.seatCount : null]);
  }
}

async function counts() {
  return db.one('SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM movies)::int AS movies, ' +
    '(SELECT count(*) FROM bookings)::int AS bookings, (SELECT count(*) FROM booking_seats)::int AS seats');
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const refresh = args.includes('--refresh-schedule');
  await migrate();

  if (refresh && !reset) {
    const r = await refreshSchedule(); // P-cron: เลื่อนเฉพาะเรื่อง seed ที่หมดวัน ข้ามเรื่องที่ชน
    await syncPromotionRules();
    await loadUsedCodes();
    const guests = await guestIds();
    if (!guests.length) { throw new Error('ยังไม่มีข้อมูล seed — รัน npm run db:seed ก่อน'); }
    const list = await windowBookings(guests);
    await insertBookings(list);
    console.log('seed: เลื่อนตารางฉาย ' + r.moved.length + ' เรื่อง ข้าม ' + r.skipped.length + ' เรื่อง + เติมการจอง ' + list.length + ' รายการ');
    r.skipped.forEach((s) => { console.log('seed: ข้าม ' + s.id + ' — ' + s.reason); });
    return;
  }

  const existing = await db.one('SELECT count(*)::int AS n FROM users');
  if (existing.n && !reset) {
    throw new Error('ฐานข้อมูลมีข้อมูลอยู่แล้ว — ใช้ --reset เพื่อล้างแล้ว seed ใหม่ หรือ --refresh-schedule เพื่อเลื่อนวันฉาย');
  }
  if (reset) {
    await db.exec('TRUNCATE booking_seats, bookings, sessions, login_attempts, promotions, movies, users');
  }
  const guests = await seedUsers();
  await seedCatalog();
  const movies = {};
  (await M.listMovies()).forEach((m) => { movies[m.id] = m; });
  const demo = demoBookings(movies);
  await insertBookings(demo.concat(historyBookings(movies, guests, demo)));
  await insertBookings(await windowBookings(guests));

  const c = await counts();
  console.log('seed เสร็จ (' + db.driverKind() + '): users ' + c.users + ', movies ' + c.movies +
    ', bookings ' + c.bookings + ', seats ' + c.seats + ' — วันนี้ ' + todayISO(0));
}

main().then(() => process.exit(0)).catch((e) => { console.error('seed ล้มเหลว:', e.message); process.exit(1); });
