/* =============================================================
   T5-C — ตรวจว่า assets/js/api.js (HTTP client) มี interface เดียวกับ mock
   โหลด api.js และ api-mock.js ใน vm แยกกัน แล้วเรียกเมธอดเดียวกัน
   เทียบชื่อฟิลด์ของผลลัพธ์ — หน้า HTML ใช้ฟิลด์ของ mock ทั้งหมด
   ดังนั้นทุกฟิลด์ที่ mock คืน server ต้องคืนด้วย
   รัน: node --test tests/api-client.test.js  (สร้าง DB PGlite ของตัวเองที่ .pglite-test-client/)
   ============================================================= */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let server = null;
let BASE = '';

function memStorage() {
  const m = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    clear: () => { Object.keys(m).forEach((k) => delete m[k]); },
    keys: () => Object.keys(m)
  };
}

/* เบราว์เซอร์จำลอง: fetch/XHR ที่ส่ง cookie เหมือนเบราว์เซอร์ (same-origin) */
function httpContext() {
  const jar = {};
  const storage = memStorage();
  function absorb(headers) {
    (headers.getSetCookie ? headers.getSetCookie() : []).forEach((c) => {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0/i.test(c)) { delete jar[k]; } else { jar[k] = v; }
    });
  }
  function withCookie(h) {
    const c = Object.keys(jar).map((k) => k + '=' + jar[k]).join('; ');
    if (c) { h.Cookie = c; }
    return h;
  }
  function browserFetch(url, opts) {
    opts = opts || {};
    const headers = withCookie(Object.assign({}, opts.headers));
    return fetch(BASE + '/' + url, { method: opts.method, headers, body: opts.body }).then((res) => {
      absorb(res.headers);
      return res;
    });
  }
  function FakeXHR() { this.headers = {}; }
  FakeXHR.prototype.open = function (method, url) { this.method = method; this.url = url; };
  FakeXHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
  FakeXHR.prototype.send = function () {
    const self = this;
    browserFetch(this.url, { method: this.method, headers: this.headers })
      .then((res) => res.text().then((t) => { self.status = res.status; self.responseText = t; self.onload(); }))
      .catch(() => self.onerror());
  };
  const ctx = { console, Promise, Intl, Date, JSON, Object, Array, Math, encodeURIComponent, Error,
    fetch: browserFetch, XMLHttpRequest: FakeXHR, localStorage: storage, sessionStorage: memStorage(),
    document: { cookie: '' } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'api.js'), 'utf8'), ctx);
  return { api: ctx.MAISON_API, jar, storage };
}

function mockContext() {
  const ctx = { console, Promise, Intl, Date, JSON, Object, Array, Math, Buffer, encodeURIComponent, Error, Number, String,
    localStorage: memStorage(), sessionStorage: memStorage(), document: { cookie: '' },
    atob: (v) => Buffer.from(v, 'base64').toString('binary'),
    setTimeout: (fn) => { if (typeof fn === 'function') { fn(); } return 0; } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'api-mock.js'), 'utf8'), ctx);
  return ctx.MAISON_API;
}

/* ชื่อฟิลด์ระดับบน (array → ฟิลด์ของสมาชิกตัวแรก) */
function shape(v) {
  if (Array.isArray(v)) { return v.length ? shape(v[0]) : []; }
  return v && typeof v === 'object' ? Object.keys(v).sort() : [];
}
function missing(mockOut, httpOut) {
  const have = new Set(shape(httpOut));
  return shape(mockOut).filter((k) => !have.has(k));
}

test.before(async () => {
  const dir = path.join(ROOT, '.pglite-test-client');
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
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const d = await require('../server/db').driver();
  if (d.close) { await d.close(); }
});

test('api.js มีเมธอด/property ครบตาม mock', () => {
  const http = httpContext().api;
  const mock = mockContext();
  const lack = Object.keys(mock).filter((k) => !(k in http));
  assert.deepEqual(lack, []);
  assert.equal(http.mode, 'http');
  Object.keys(mock).forEach((k) => assert.equal(typeof http[k], typeof mock[k], k));
});

test('ผลลัพธ์ของทุกเมธอดมีฟิลด์ที่ mock มี (หน้าเว็บใช้ฟิลด์เหล่านี้)', async () => {
  const h = httpContext();
  const http = h.api;
  const mock = mockContext();
  await Promise.all([http.ready, mock.ready]);

  // คนละ realm (vm) — เทียบผ่าน JSON
  assert.equal(JSON.stringify(http.showDates()), JSON.stringify(mock.showDates()));
  assert.equal(http.currentUser(), null);

  const login = { identifier: 'admin', password: 'admin123' };
  const pairs = [];
  async function both(name, fn) {
    const [a, b] = await Promise.all([fn(mock), fn(http)]);
    pairs.push([name, a, b]);
    return [a, b];
  }
  await both('login', (x) => x.login(login));
  assert.equal(http.currentUser().username, 'admin');
  assert.ok(h.jar.maison_sid, 'cookie session ถูกตั้ง');

  await both('me', (x) => x.me());
  const [mm] = await both('movies', (x) => x.movies({ sort: 'title' }));
  await both('movies.items', (x) => x.movies({}).then((r) => r.items));
  await both('comingSoon', (x) => x.comingSoon());
  await both('movie', (x) => x.movie('m02'));
  const [mst, hst] = await both('showtimes', (x) => x.showtimes('m04', x.showDates()[1]));
  await both('showtimes.items', (x) => x.showtimes('m04', x.showDates()[1]).then((r) => r.items));
  await both('seats', (x) => x.showtimes('m04', x.showDates()[1]).then((r) => x.seats(r.items[0].id)));
  await both('seats.seats', (x) => x.showtimes('m04', x.showDates()[1]).then((r) => x.seats(r.items[0].id)).then((r) => r.seats));
  await both('myBookings', (x) => x.myBookings());
  await both('myBookings.seats', (x) => x.myBookings().then((r) => (r[0] ? r[0].seats : [])));
  await both('promotions', (x) => x.promotions());
  await both('promotion', (x) => x.promotions().then((r) => x.promotion(r[0].id)));
  await both('redeem', (x) => x.promotions().then((r) => x.redeem(r[0].code)));
  await both('adminPromotions', (x) => x.adminPromotions());
  await both('adminStats', (x) => x.adminStats({ days: 7 }));
  await both('adminStats.byMovie', (x) => x.adminStats({ days: 0 }).then((r) => r.byMovie));
  await both('adminStats.daily', (x) => x.adminStats({ days: 0 }).then((r) => r.daily));
  await both('adminUsers', (x) => x.adminUsers({ search: '' }));
  await both('adminMovies', (x) => x.adminMovies({}));

  const pick = (sts) => sts.items.find((s) => s.status === 'available');
  const seatIdOf = (x, st) => x.seats(st.id).then((r) => r.seats.filter((s) => s.status === 'available').slice(-1).map((s) => s.id));
  const mSeat = await seatIdOf(mock, pick(mst));
  const hSeat = await seatIdOf(http, pick(hst));
  const mb = await mock.createBooking({ showtimeId: pick(mst).id, seatIds: mSeat });
  const hb = await http.createBooking({ showtimeId: pick(hst).id, seatIds: hSeat });
  pairs.push(['createBooking', mb, hb], ['createBooking.booking', mb.booking, hb.booking]);

  const problems = pairs.map(([n, a, b]) => [n, missing(a, b)]).filter(([, m]) => m.length);
  assert.deepEqual(problems, [], 'ฟิลด์ที่ server ขาด');
  assert.ok(mm.items.length > 0);
  assert.equal(h.storage.keys().length, 0, 'api.js ต้องไม่เขียน localStorage');
});

test('error จาก server กลายเป็น ApiError แบบเดียวกับ mock (status + message + conflicts)', async () => {
  const h = httpContext();
  const http = h.api;
  await http.ready;
  await assert.rejects(http.me(), (e) => e.name === 'ApiError' && e.status === 401 && e.message === 'ยังไม่ได้เข้าสู่ระบบ');
  await assert.rejects(http.login({ identifier: 'demo', password: 'x' }), (e) => e.status === 401);
  await http.login({ identifier: 'demo', password: 'demo123' });
  const st = (await http.showtimes('m02', http.showDates()[0])).items.find((s) => s.period === 'evening');
  // รอบเย็น m02 วันนี้เต็มเสมอ (fixture seed): ก่อน 19:00 ต้อง 409 เต็ม
  // หลัง 19:00 P-15 ปฏิเสธก่อนด้วย 422 เริ่มฉายไปแล้ว (fixture ย้ายวันไม่ได้)
  if (Date.now() < Date.parse(st.startsAt)) {
    await assert.rejects(http.createBooking({ showtimeId: st.id, seatIds: ['hall-01-A1'] }), (e) => e.status === 409);
  } else {
    await assert.rejects(http.createBooking({ showtimeId: st.id, seatIds: ['hall-01-A1'] }),
      (e) => e.status === 422 && /เริ่มฉายไปแล้ว/.test(e.message));
  }
  const st2 = (await http.showtimes('m04', http.showDates()[2])).items[0];
  const seat = (await http.seats(st2.id)).seats.find((s) => s.status === 'booked').id;
  await assert.rejects(http.createBooking({ showtimeId: st2.id, seatIds: [seat] }),
    (e) => e.status === 409 && Array.isArray(e.conflicts) && e.conflicts[0] === seat);
  await assert.rejects(http.adminStats({}), (e) => e.status === 403);
  await http.logout();
  assert.equal(http.currentUser(), null);
  assert.equal(h.jar.maison_sid, undefined);
});
