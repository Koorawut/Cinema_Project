/* =============================================================
   T5 — ทดสอบ HTTP API จริง (server + DB) ด้วย node:test
   รัน: npm run test:api
   - ไม่ตั้ง BASE_URL: สร้าง DB PGlite ใหม่ที่ .pglite-test/ (seed --reset)
     แล้วเปิด scripts/dev-server.js ในพอร์ตสุ่ม — ไม่ต้องมี Neon
   - ตั้ง BASE_URL=http://localhost:3000 (หรือ URL preview): ยิงไปที่ server นั้น
     ต้องเป็น DB ที่เพิ่ง seed --reset (ชุดทดสอบสร้าง/ลบข้อมูลจริง)
   ============================================================= */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let BASE = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : '';
let server = null;

/* ---------- client เล็ก ๆ + cookie jar ---------- */
function client() {
  const jar = {};
  async function call(method, p, body, opts) {
    opts = opts || {};
    const headers = { Accept: 'application/json' };
    const cookie = Object.keys(jar).map((k) => k + '=' + jar[k]).join('; ');
    if (cookie) { headers.Cookie = cookie; }
    let payload;
    if (method !== 'GET') {
      headers['Content-Type'] = opts.contentType || 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body || {});
    }
    const res = await fetch(BASE + p, { method, headers, body: payload, redirect: 'manual' });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    setCookies.forEach((c) => {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0/i.test(c)) { delete jar[k]; } else { jar[k] = v; }
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    return { status: res.status, data, headers: res.headers, setCookies };
  }
  return {
    jar,
    get: (p) => call('GET', p),
    post: (p, b, o) => call('POST', p, b, o),
    patch: (p, b) => call('PATCH', p, b),
    del: (p) => call('DELETE', p, {}),
    login: (identifier, password, remember) => call('POST', '/api/auth/login', { identifier, password, remember: !!remember })
  };
}

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const uniq = 't' + Date.now().toString(36).slice(-6);

test.before(async () => {
  if (BASE) { return; }
  const dir = path.join(ROOT, '.pglite-test');
  fs.rmSync(dir, { recursive: true, force: true });
  process.env.DATABASE_URL = 'pglite:' + dir;
  process.env.COOKIE_INSECURE = '1';
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seed.js'), '--reset'],
    { env: process.env, stdio: 'ignore', timeout: 120000 });
  server = require('../scripts/dev-server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  BASE = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  if (!server) { return; }
  // fetch ของ node เปิด keep-alive ค้างไว้ — ปิดทิ้งก่อน ไม่งั้น close() รอไม่จบ
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const d = await require('../server/db').driver();
  if (d.close) { await d.close(); }
});

/* ---------- S1: config / สาธารณะ ---------- */

test('GET /api/config คืนวันนี้ (เวลาไทย) + ค่าคงที่ + user=null', async () => {
  const c = client();
  const r = await c.get('/api/config');
  assert.equal(r.status, 200);
  assert.match(r.data.today, /^\d{4}-\d{2}-\d{2}$/);
  const bkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  assert.equal(r.data.today, bkk);
  assert.equal(r.data.showDays, 6);
  assert.equal(r.data.serviceFee, 30);
  assert.equal(r.data.halls.length, 2);
  assert.equal(r.data.user, null);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('endpoint ที่ไม่มี = 404, เมธอดผิด = 405, body ไม่ใช่ JSON = 415', async () => {
  const c = client();
  assert.equal((await c.get('/api/nope')).status, 404);
  const m = await c.del('/api/config');
  assert.equal(m.status, 405);
  assert.match(m.headers.get('allow'), /GET/);
  const f = await c.post('/api/auth/login', 'identifier=admin&password=admin123',
    { contentType: 'application/x-www-form-urlencoded' });
  assert.equal(f.status, 415);
  assert.equal(f.data.error.message, 'คำขอต้องส่งเป็น application/json');
});

test('ไม่เสิร์ฟซอร์ส server / ไฟล์ลับเป็น static', async () => {
  const c = client();
  for (const p of ['/server/db.js', '/scripts/seed.js', '/db/schema.sql', '/package.json', '/.env.local']) {
    assert.equal((await c.get(p)).status, 404, p);
  }
  assert.equal((await c.get('/index.html')).status, 200);
});

test('catalog: รายการหนังฉายอยู่, ค้นหา, coming soon, รายละเอียด, 404', async () => {
  const c = client();
  const list = await c.get('/api/movies');
  assert.equal(list.status, 200);
  assert.equal(list.data.items.length, 8);
  assert.ok(list.data.items.every((m) => typeof m.ticketsSold === 'number'));
  const s = await c.get('/api/movies?search=' + encodeURIComponent('hollow'));
  assert.equal(s.data.items.length, 1);
  assert.equal(s.data.items[0].id, 'm02');
  const cs = await c.get('/api/movies/coming-soon');
  assert.equal(cs.status, 200);
  assert.ok(cs.data.length >= 1);
  assert.equal((await c.get('/api/movies/m02')).data.title, 'The Hollow Choir');
  const nf = await c.get('/api/movies/m99');
  assert.equal(nf.status, 404);
  assert.equal(nf.data.error.message, 'ไม่พบภาพยนตร์เรื่องนี้');
});

test('รอบเย็น m02 วันนี้เต็ม (fixture จาก seed) และจองไม่ได้', async () => {
  const c = client();
  const st = await c.get('/api/movies/m02/showtimes');
  const evening = st.data.items.find((x) => x.period === 'evening');
  assert.equal(evening.status, 'full');
  assert.equal(evening.availableCount, 0);
  const seats = await c.get('/api/showtimes/' + evening.id + '/seats');
  assert.ok(seats.data.seats.every((x) => x.status === 'booked'));
  await c.login('demo', 'demo123');
  const b = await c.post('/api/bookings', { showtimeId: evening.id, seatIds: ['hall-01-A1'] });
  assert.equal(b.status, 409);
});

/* ---------- S2: สิทธิ์ ---------- */

test('ทุก endpoint ที่ต้อง login คืน 401 เมื่อไม่มี session', async () => {
  const c = client();
  const cases = [
    ['GET', '/api/auth/me'], ['GET', '/api/me/bookings'], ['POST', '/api/bookings'],
    ['POST', '/api/auth/change-password'], ['GET', '/api/admin/stats'], ['GET', '/api/admin/users'],
    ['GET', '/api/admin/movies'], ['POST', '/api/admin/movies'], ['GET', '/api/admin/promotions'],
    ['DELETE', '/api/admin/users/u-demo'], ['PATCH', '/api/admin/users/u-demo/role']
  ];
  for (const [m, p] of cases) {
    const r = m === 'GET' ? await c.get(p) : m === 'DELETE' ? await c.del(p) : m === 'PATCH' ? await c.patch(p, {}) : await c.post(p, {});
    assert.equal(r.status, 401, m + ' ' + p);
    assert.ok(r.data.error.message, m + ' ' + p);
  }
});

test('ผู้ใช้ทั่วไปเรียก /api/admin/* ได้ 403', async () => {
  const c = client();
  assert.equal((await c.login('demo', 'demo123')).status, 200);
  for (const p of ['/api/admin/stats', '/api/admin/users', '/api/admin/movies', '/api/admin/promotions']) {
    const r = await c.get(p);
    assert.equal(r.status, 403, p);
    assert.equal(r.data.error.message, 'ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น');
  }
  assert.equal((await c.patch('/api/admin/users/u-demo/role', { role: 'admin' })).status, 403);
});

/* ---------- S3: สมัคร / login / session ---------- */

test('register: 422 เมื่อข้อมูลผิด, 201 เมื่อถูก, 409 เมื่อซ้ำ (ไม่สนตัวพิมพ์)', async () => {
  const c = client();
  const base = { username: uniq, email: uniq + '@example.com', password: 'abc12345', confirmPassword: 'abc12345' };
  assert.equal((await c.post('/api/auth/register', Object.assign({}, base, { username: 'a!' }))).status, 422);
  assert.equal((await c.post('/api/auth/register', Object.assign({}, base, { email: 'bad' }))).status, 422);
  assert.equal((await c.post('/api/auth/register', Object.assign({}, base, { password: 'short', confirmPassword: 'short' }))).status, 422);
  assert.equal((await c.post('/api/auth/register', Object.assign({}, base, { confirmPassword: 'abc12346' }))).status, 422);
  const ok = await c.post('/api/auth/register', base);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.role, 'user');
  assert.equal(ok.data.user.pass_hash, undefined);
  assert.equal(ok.setCookies.length, 0, 'สมัครแล้วยังไม่ login');
  const dup = await c.post('/api/auth/register', Object.assign({}, base, { username: uniq.toUpperCase(), email: 'x' + base.email }));
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error.message, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้ไปแล้ว');
});

test('login ด้วย username และ email ได้ cookie HttpOnly; รหัสผิด 401', async () => {
  const a = client();
  const r = await a.login('admin', 'admin123');
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'admin');
  const sc = r.setCookies.find((x) => x.startsWith('maison_sid='));
  assert.ok(sc, 'ต้องตั้ง cookie maison_sid');
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Lax/i);
  assert.match(sc, /Path=\//i);
  assert.doesNotMatch(sc, /Max-Age/i, 'ไม่ติ๊กจำฉันไว้ = session cookie');

  const seedEmail = (await a.get('/api/admin/users?search=demo')).data.find((u) => u.username === 'demo').email;
  const byEmail = await client().login(seedEmail.toUpperCase(), 'demo123', true);
  assert.equal(byEmail.status, 200);
  assert.equal(byEmail.data.user.username, 'demo');
  assert.match(byEmail.setCookies.find((x) => x.startsWith('maison_sid=')), /Max-Age=2592000/i);

  const bad = await client().login('demo', 'wrong-pass1');
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error.message, 'ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง');
});

test('me / config รู้จัก session; logout แล้ว me = 401 และ cookie เดิมใช้ไม่ได้อีก', async () => {
  const c = client();
  await c.login('demo', 'demo123');
  const sid = c.jar.maison_sid;
  assert.equal((await c.get('/api/auth/me')).data.user.username, 'demo');
  assert.equal((await c.get('/api/config')).data.user.username, 'demo');
  const out = await c.post('/api/auth/logout', {});
  assert.equal(out.status, 200);
  assert.equal(c.jar.maison_sid, undefined, 'logout ต้องล้าง cookie');
  assert.equal((await c.get('/api/auth/me')).status, 401);
  // ใช้ token เดิมซ้ำ — session ถูกลบใน DB แล้ว
  const replay = client();
  replay.jar.maison_sid = sid;
  assert.equal((await replay.get('/api/auth/me')).status, 401);
});

test('token ปลอม/สุ่มไม่ผ่าน', async () => {
  const c = client();
  c.jar.maison_sid = 'x'.repeat(43);
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('เปลี่ยนรหัสผ่าน: ตรวจรหัสเดิม, session อื่นถูกตัด, รหัสใหม่ใช้ได้', async () => {
  const name = uniq + 'p';
  const reg = await client().post('/api/auth/register',
    { username: name, email: name + '@example.com', password: 'first1234', confirmPassword: 'first1234' });
  assert.equal(reg.status, 201);
  const a = client();
  const b = client();
  await a.login(name, 'first1234');
  await b.login(name, 'first1234');
  assert.equal((await a.post('/api/auth/change-password',
    { currentPassword: 'nope12345', newPassword: 'second1234', confirmPassword: 'second1234' })).status, 401);
  assert.equal((await a.post('/api/auth/change-password',
    { currentPassword: 'first1234', newPassword: 'first1234', confirmPassword: 'first1234' })).status, 422);
  const ok = await a.post('/api/auth/change-password',
    { currentPassword: 'first1234', newPassword: 'second1234', confirmPassword: 'second1234' });
  assert.equal(ok.status, 200);
  assert.equal((await a.get('/api/auth/me')).status, 200, 'session ปัจจุบันยังอยู่');
  assert.equal((await b.get('/api/auth/me')).status, 401, 'session อื่นถูกตัด');
  assert.equal((await client().login(name, 'first1234')).status, 401);
  assert.equal((await client().login(name, 'second1234')).status, 200);
});

/* ---------- S4: การจอง ---------- */

async function openShowtime(c) {
  // m04 ฉาย hall-02 รอบเช้าทุกวัน (SEED_SCHEDULE) — ใช้วันพรุ่งนี้
  const today = (await c.get('/api/config')).data.today;
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  const list = await c.get('/api/movies/m04/showtimes?date=' + d.toISOString().slice(0, 10));
  return list.data.items.find((x) => x.status === 'available');
}

test('จอง: server คิดราคาเอง, ประวัติแสดงใน /api/me/bookings, ที่นั่งเปลี่ยนเป็น booked', async () => {
  const c = client();
  await c.login('demo', 'demo123');
  const st = await openShowtime(c);
  const map = await c.get('/api/showtimes/' + st.id + '/seats');
  const free = map.data.seats.filter((s) => s.status === 'available').slice(0, 2).map((s) => s.id);
  const r = await c.post('/api/bookings', { showtimeId: st.id, seatIds: free, total: 1, unitPrice: 0 });
  assert.equal(r.status, 201);
  const price = (await c.get('/api/movies/m04')).data.price;
  assert.equal(r.data.booking.unitPrice, price);
  assert.equal(r.data.booking.serviceFee, 30);
  assert.equal(r.data.booking.total, (price + 30) * 2);
  assert.match(r.data.booking.code, /^MAI-[A-Z0-9]{4}$/);
  assert.match(r.data.booking.startsAt, /\+07:00$/);
  const mine = await c.get('/api/me/bookings');
  assert.ok(mine.data.some((b) => b.code === r.data.booking.code));
  assert.ok(mine.data.some((b) => b.code === 'MAI-7Q3F'));
  const after = await c.get('/api/showtimes/' + st.id + '/seats');
  free.forEach((id) => assert.equal(after.data.seats.find((s) => s.id === id).status, 'booked'));
  // จองซ้ำที่เดิม → 409 พร้อม conflicts
  const again = await c.post('/api/bookings', { showtimeId: st.id, seatIds: free });
  assert.equal(again.status, 409);
  assert.deepEqual(again.data.error.conflicts.sort(), free.slice().sort());
});

test('จอง: 422 ที่นั่งว่าง/ผิดโรง, 404 รอบไม่มีจริง', async () => {
  const c = client();
  await c.login('demo', 'demo123');
  const st = await openShowtime(c);
  assert.equal((await c.post('/api/bookings', { showtimeId: st.id, seatIds: [] })).status, 422);
  const wrongHall = st.hallId === 'hall-01' ? 'hall-02-A1' : 'hall-01-A1';
  assert.equal((await c.post('/api/bookings', { showtimeId: st.id, seatIds: [wrongHall] })).status, 422);
  assert.equal((await c.post('/api/bookings', { showtimeId: 'st-m04-1999-01-01-morning', seatIds: ['hall-02-A1'] })).status, 404);
  assert.equal((await c.post('/api/bookings', { showtimeId: 'garbage', seatIds: ['hall-02-A1'] })).status, 404);
});

test('จองที่นั่งเดียวกันพร้อมกัน 2 คำขอ: 201 หนึ่ง 409 หนึ่ง (P-03)', async () => {
  const a = client();
  const b = client();
  await a.login('demo', 'demo123');
  await b.login('admin', 'admin123');
  const st = await openShowtime(a);
  const map = await a.get('/api/showtimes/' + st.id + '/seats');
  const seat = map.data.seats.filter((s) => s.status === 'available').map((s) => s.id).slice(-1);
  const [r1, r2] = await Promise.all([
    a.post('/api/bookings', { showtimeId: st.id, seatIds: seat }),
    b.post('/api/bookings', { showtimeId: st.id, seatIds: seat })
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  const lost = r1.status === 409 ? r1 : r2;
  assert.deepEqual(lost.data.error.conflicts, seat);
});

/* ---------- S4b: จองด้วยโค้ดส่วนลด (P-08) ---------- */

/* วันที่ (เวลาไทย) ภายใน 6 วันที่ฉายที่ตรงกับวันในสัปดาห์ที่ระบุ (0=อาทิตย์) — null ถ้าไม่มีในช่วงนี้ */
async function dateWithWeekday(c, weekday) {
  const today = (await c.get('/api/config')).data.today;
  for (let i = 0; i < 6; i++) {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() === weekday) { return d.toISOString().slice(0, 10); }
  }
  return null;
}
async function showtimeOf(c, movieId, date) {
  const list = await c.get('/api/movies/' + movieId + '/showtimes?date=' + date);
  return list.data.items.find((x) => x.status === 'available') || null;
}
async function freeSeats(c, st, n) {
  const map = await c.get('/api/showtimes/' + st.id + '/seats');
  return map.data.seats.filter((s) => s.status === 'available').slice(0, n).map((s) => s.id);
}

test('จองด้วยโค้ด EVENINGPAIR: server คิดราคา 480 + ค่าบริการ, เก็บ discount/promoCode, ไม่เชื่อ total จาก client', async () => {
  const c = client();
  await c.login('demo', 'demo123');
  const today = (await c.get('/api/config')).data.today;
  const st = await showtimeOf(c, 'm07', today) || await showtimeOf(c, 'm07', await dateWithWeekday(c, 1) || today);
  assert.ok(st, 'ต้องมีรอบเย็นของ m07');
  const unit = (await c.get('/api/movies/m07')).data.price;
  const seats = await freeSeats(c, st, 2);
  const quote = await c.post('/api/promotions/redeem', { code: ' eveningpair ', showtimeId: st.id, seatIds: seats });
  assert.equal(quote.status, 200);
  assert.equal(quote.data.quote.total, 480 + 60);
  assert.equal(quote.data.quote.discount, unit * 2 - 480);
  const r = await c.post('/api/bookings', { showtimeId: st.id, seatIds: seats, promoCode: 'eveningpair', total: 1, discount: 9999 });
  assert.equal(r.status, 201);
  assert.equal(r.data.booking.total, 540);
  assert.equal(r.data.booking.discount, unit * 2 - 480);
  assert.equal(r.data.booking.promoCode, 'EVENINGPAIR');
  assert.equal(r.data.booking.serviceFee, 30);
  const mine = (await c.get('/api/me/bookings')).data.find((b) => b.code === r.data.booking.code);
  assert.equal(mine.total, 540);
  assert.equal(mine.promoCode, 'EVENINGPAIR');
});

test('จองด้วยโค้ดที่ไม่ตรงเงื่อนไข: 422/404 และไม่สร้างการจอง ที่นั่งยังว่าง', async () => {
  const c = client();
  await c.login('demo', 'demo123');
  const today = (await c.get('/api/config')).data.today;
  const st = await showtimeOf(c, 'm04', today); // รอบเช้า ทุกวัน
  assert.ok(st);
  const seats = await freeSeats(c, st, 2);
  const before = (await c.get('/api/me/bookings')).data.length;
  const wed = await dateWithWeekday(c, 3);
  const notWed = wed === today ? await dateWithWeekday(c, 4) : today;
  const stNotWed = await showtimeOf(c, 'm04', notWed || today);
  if (stNotWed && (new Date(stNotWed.date + 'T00:00:00Z').getUTCDay() !== 3)) {
    const bad = await c.post('/api/bookings', { showtimeId: stNotWed.id, seatIds: await freeSeats(c, stNotWed, 1), promoCode: 'MAISON20' });
    assert.equal(bad.status, 422);
    assert.match(bad.data.error.message, /วันพุธ/);
  }
  // รอบเช้าไม่เข้า EVENINGPAIR (เวลา < 18:00)
  const early = await c.post('/api/bookings', { showtimeId: st.id, seatIds: seats, promoCode: 'EVENINGPAIR' });
  assert.equal(early.status, 422);
  assert.match(early.data.error.message, /18:00/);
  assert.equal((await c.post('/api/bookings', { showtimeId: st.id, seatIds: seats, promoCode: 'NOPE-0000' })).status, 404);
  assert.equal((await c.get('/api/me/bookings')).data.length, before);
  assert.deepEqual(await freeSeats(c, st, 2), seats);
});

test('MAISON20 วันพุธ และ FRIDAY180 วันศุกร์ (ทดสอบเมื่อมีวันนั้นในช่วงฉาย 6 วัน)', async () => {
  const c = client();
  await c.login('demo', 'demo123');
  const wed = await dateWithWeekday(c, 3);
  if (wed) {
    const st = await showtimeOf(c, 'm07', wed);
    const unit = (await c.get('/api/movies/m07')).data.price;
    const seats = await freeSeats(c, st, 2);
    const r = await c.post('/api/bookings', { showtimeId: st.id, seatIds: seats, promoCode: 'MAISON20' });
    assert.equal(r.status, 201);
    assert.equal(r.data.booking.total, Math.round(unit * 2 * 0.8) + 60);
    assert.equal(r.data.booking.discount, unit * 2 - Math.round(unit * 2 * 0.8));
  }
  const fri = await dateWithWeekday(c, 5);
  if (fri) {
    const st = await showtimeOf(c, 'm04', fri); // รอบเช้า 10:30
    const seats = await freeSeats(c, st, 3);
    const r = await c.post('/api/bookings', { showtimeId: st.id, seatIds: seats, promoCode: 'FRIDAY180' });
    assert.equal(r.status, 201);
    assert.equal(r.data.booking.total, 180 * 3 + 90);
    const evening = await showtimeOf(c, 'm07', fri);
    const late = await c.post('/api/bookings', { showtimeId: evening.id, seatIds: await freeSeats(c, evening, 1), promoCode: 'FRIDAY180' });
    assert.equal(late.status, 422);
  }
});

test('โค้ดจาก admin ที่ไม่มีกติกา: redeem แบบ quote และจองได้ 422', async () => {
  const admin = client();
  await admin.login('admin', 'admin123');
  const created = await admin.post('/api/admin/promotions', {
    code: 'NORULE' + uniq.toUpperCase().slice(0, 4), title: 'ไม่มีกติกา', summary: 's', details: 'd', terms: [] });
  assert.equal(created.status, 201);
  assert.equal(created.data.rule, null);
  const c = client();
  await c.login('demo', 'demo123');
  const today = (await c.get('/api/config')).data.today;
  const st = await showtimeOf(c, 'm04', today);
  const seats = await freeSeats(c, st, 1);
  const q = await c.post('/api/promotions/redeem', { code: created.data.code, showtimeId: st.id, seatIds: seats });
  assert.equal(q.status, 422);
  assert.match(q.data.error.message, /ยังไม่เปิดให้คำนวณ/);
  assert.equal((await c.post('/api/bookings', { showtimeId: st.id, seatIds: seats, promoCode: created.data.code })).status, 422);
  await admin.del('/api/admin/promotions/' + created.data.id);
});

/* ---------- S5: โปรโมชัน ---------- */

test('promotions: รายการ, รายละเอียด, redeem ถูก/ผิด', async () => {
  const c = client();
  const list = await c.get('/api/promotions');
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 3);
  assert.equal((await c.get('/api/promotions/' + list.data[0].id)).data.code, list.data[0].code);
  assert.equal((await c.get('/api/promotions/nope')).status, 404);
  const ok = await c.post('/api/promotions/redeem', { code: list.data[0].code.toLowerCase() });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.valid, true);
  assert.equal((await c.post('/api/promotions/redeem', { code: 'NOPE-0000' })).status, 404);
});

test('admin คูปอง CRUD + ภาพ magic bytes ผิด = 422', async () => {
  const c = client();
  await c.login('admin', 'admin123');
  const body = { code: 'T5-' + uniq.toUpperCase().slice(-4), title: 'ทดสอบ', summary: 'สรุป', details: 'รายละเอียด', terms: ['ข้อ 1'], image: '' };
  const fake = 'data:image/png;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  const badImg = await c.post('/api/admin/promotions', Object.assign({}, body, { image: fake }));
  assert.equal(badImg.status, 422);
  assert.equal(badImg.data.error.message, 'เนื้อหาไฟล์ภาพไม่ตรงกับชนิดภาพ');
  assert.equal((await c.post('/api/admin/promotions', Object.assign({}, body, { image: 'https://evil.example/x.png' }))).status, 422);
  assert.equal((await c.post('/api/admin/promotions', Object.assign({}, body, { code: 'a' }))).status, 422);
  const created = await c.post('/api/admin/promotions', Object.assign({}, body, { image: PNG_1PX }));
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.ok(created.data.image);
  assert.equal((await c.post('/api/admin/promotions', body)).status, 409);
  const upd = await c.patch('/api/admin/promotions/' + id, Object.assign({}, body, { title: 'แก้แล้ว' }));
  assert.equal(upd.status, 200);
  assert.equal(upd.data.title, 'แก้แล้ว');
  assert.ok((await c.get('/api/promotions')).data.some((p) => p.id === id && p.title === 'แก้แล้ว'));
  assert.equal((await c.del('/api/admin/promotions/' + id)).status, 200);
  assert.equal((await c.del('/api/admin/promotions/' + id)).status, 404);
});

/* ---------- S6: admin หนัง ---------- */

test('admin หนัง CRUD + ตรวจชนรอบ + ชื่อซ้ำ', async () => {
  const c = client();
  await c.login('admin', 'admin123');
  const today = (await c.get('/api/config')).data.today;
  const base = { title: 'T5 Movie ' + uniq, genres: ['Drama'], price: 200, durationMin: 100, ageRating: 'ท.', director: 'X',
    synopsis: 'Y', nowShowing: true, hallId: 'hall-02', dateStart: today, dateEnd: today, periods: ['evening'] };
  // hall-02 รอบเย็น ถูก m07 ใช้อยู่ทุกวัน
  const clash = await c.post('/api/admin/movies', base);
  assert.equal(clash.status, 409);
  assert.equal((await c.post('/api/admin/movies', Object.assign({}, base, { title: 'The Hollow Choir' }))).status, 409);
  assert.equal((await c.post('/api/admin/movies', Object.assign({}, base, { price: 'abc' }))).status, 422);
  assert.equal((await c.post('/api/admin/movies', Object.assign({}, base, { dateEnd: '2000-01-01' }))).status, 422);

  const created = await c.post('/api/admin/movies', Object.assign({}, base, { nowShowing: false }));
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.match(id, /^m\d{2,}$/);
  const upd = await c.patch('/api/admin/movies/' + id, { price: 250, poster: PNG_1PX });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.price, 250);
  assert.equal(upd.data.title, base.title);
  assert.equal((await c.get('/api/movies/' + id)).data.price, 250);
  assert.ok((await c.get('/api/admin/movies?search=' + encodeURIComponent(uniq))).data.some((m) => m.id === id));
  const del = await c.del('/api/admin/movies/' + id);
  assert.equal(del.status, 200);
  assert.equal(del.data.removedTitle, base.title);
  assert.equal((await c.get('/api/movies/' + id)).status, 404);
});

/* ---------- S7: admin บัญชี ---------- */

test('admin บัญชี: ค้นหา, เปลี่ยนสิทธิ์, ห้ามลดสิทธิ์/ลบตัวเอง, ลบแล้วประวัติยังอยู่', async () => {
  const c = client();
  const me = (await c.login('admin', 'admin123')).data.user;
  const guests = await c.get('/api/admin/users?search=guest');
  assert.equal(guests.data.length, 48);
  assert.equal((await c.get('/api/admin/users?search=' + encodeURIComponent('%'))).data.length, 0, 'LIKE wildcard ถูก escape');
  assert.equal((await c.patch('/api/admin/users/' + me.id + '/role', { role: 'user' })).status, 422);
  assert.equal((await c.del('/api/admin/users/' + me.id)).status, 422);
  assert.equal((await c.patch('/api/admin/users/u-guest01/role', { role: 'root' })).status, 422);
  assert.equal((await c.patch('/api/admin/users/u-nobody/role', { role: 'admin' })).status, 404);

  const promoted = await c.patch('/api/admin/users/u-guest02/role', { role: 'admin' });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.data.role, 'admin');
  assert.equal((await c.patch('/api/admin/users/u-guest02/role', { role: 'user' })).data.role, 'user');

  const before = await c.get('/api/admin/stats');
  const victim = guests.data.find((u) => u.bookingCount > 0 && u.id !== 'u-guest02');
  assert.equal((await c.del('/api/admin/users/' + victim.id)).status, 200);
  assert.equal((await c.del('/api/admin/users/' + victim.id)).status, 404);
  const after = await c.get('/api/admin/stats');
  assert.equal(after.data.totalUsers, before.data.totalUsers - 1);
  assert.equal(after.data.bookings, before.data.bookings, 'ลบบัญชีไม่ลบประวัติการจอง');
});

/* ---------- S8: สถิติ ---------- */

test('admin stats: ตัวเลขจาก DB, สอดคล้องกันเอง, กรองช่วงวันได้', async () => {
  const c = client();
  await c.login('admin', 'admin123');
  const all = await c.get('/api/admin/stats');
  assert.equal(all.status, 200);
  const s = all.data;
  assert.equal(s.isDemoData, false);
  assert.equal(s.demoBaselineUsers, 0);
  assert.ok(s.bookings > 1000, 'seed สร้างประวัติ 30 วัน');
  assert.ok(s.tickets >= s.bookings);
  assert.equal(s.serviceFeeEstimate, s.tickets * 30);
  assert.equal(s.byMovie.reduce((a, m) => a + m.tickets, 0), s.tickets);
  assert.equal(s.byMovie.reduce((a, m) => a + m.value, 0), s.confirmedValue);
  assert.equal(s.daily.length, 14);
  const week = (await c.get('/api/admin/stats?days=7')).data;
  assert.ok(week.bookings > 0 && week.bookings < s.bookings);
  assert.equal(week.totalUsers, s.totalUsers);
});
