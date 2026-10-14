/* =============================================================
   MAISON Cinema — ชุดทดสอบอัตโนมัติ (API logic)
   ตามระเบียบใน cinema-testing-formation.md (ชั้น T1, ชุด S1–S8)
   -------------------------------------------------------------
   วิธีรัน:
   1) Node:       $env:TZ='Asia/Bangkok'; node tests/run-tests.js
   2) เบราว์เซอร์: เปิด tests/run-tests.html
      (หน้า HTML จะสำรอง localStorage/sessionStorage ของผู้ใช้จริง
       ไว้ก่อนโหลด api.js และชุดนี้จะคืนค่าให้เมื่อจบการทดสอบ)

   ขอบเขต: ตรรกะของ assets/js/api.js เท่านั้น (ไม่ทดสอบ DOM)
   ออกแบบให้รันตามลำดับ — บางข้อใช้ state จากข้อก่อนหน้า
   ============================================================= */
(function () {
  'use strict';

  var IS_NODE = typeof module !== 'undefined' && !!module.exports;
  var G = typeof globalThis !== 'undefined' ? globalThis : window;

  /* ---------- Node: จำลองสภาพแวดล้อมเบราว์เซอร์ก่อนโหลด api.js ---------- */
  if (IS_NODE) {
    function memStorage() {
      var m = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
        setItem: function (k, v) { m[k] = String(v); },
        removeItem: function (k) { delete m[k]; },
        clear: function () { m = {}; }
      };
    }
    G.window = G;
    G.localStorage = memStorage();
    G.sessionStorage = memStorage();
    G.document = { cookie: '' };
    G.atob = function (value) { return Buffer.from(value, 'base64').toString('binary'); };
    G.fetch = undefined; // บังคับใช้ embedded seed (ไม่พึ่ง network)
    // ตัด latency จำลองของ API ออกเพื่อให้ชุดทดสอบรันเร็ว
    G.setTimeout = function (fn) { if (typeof fn === 'function') { fn(); } return 0; };
    var fs = require('fs');
    var pathMod = require('path');
    (0, eval)(fs.readFileSync(pathMod.join(__dirname, '..', 'assets', 'js', 'api.js'), 'utf8'));
  }

  var A = G.window && G.window.MAISON_API;

  /* ---------- เครื่องมือทดสอบ ---------- */
  var passCount = 0, failCount = 0;

  function line(msg) {
    if (IS_NODE) { console.log(msg); }
    var pre = G.document && G.document.getElementById && G.document.getElementById('test-out');
    if (pre) { pre.textContent += msg + '\n'; }
  }
  function ok(cond, msg) { if (!cond) { throw new Error(msg || 'เงื่อนไขไม่เป็นจริง'); } }
  function eq(actual, expected, msg) {
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) { throw new Error((msg || 'ค่าไม่ตรงกัน') + ' — ได้ ' + a + ' / ต้องการ ' + b); }
  }
  async function expectError(promise, status, msg) {
    var threw = null;
    try { await promise; } catch (e) { threw = e; }
    if (!threw) { throw new Error((msg || 'คาดว่าจะ error ' + status) + ' แต่ API คืนสำเร็จ'); }
    if (status && threw.status !== status) {
      throw new Error((msg || 'สถานะ error ไม่ตรง') + ' — ได้ ' + threw.status + ' / ต้องการ ' + status + ' (' + threw.message + ')');
    }
    return threw;
  }

  /* วันที่อ้างอิงตามเขตเวลาท้องถิ่น (ไม่ใช้ค่าจาก api.js เพื่อไม่ให้วัดด้วยของที่ถูกวัด) */
  function refTodayISO() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function refISO(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + offsetDays);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /* รหัสรอบฉายรูปแบบ v1.3: st-{movieId}-{วันที่}-{ช่วงเวลา} */
  function stIdOf(movieId, dateISO, periodKey) { return 'st-' + movieId + '-' + dateISO + '-' + periodKey; }
  async function firstAvailable(stId, n) {
    var res = await A.seats(stId);
    return res.seats.filter(function (s) { return s.status === 'available'; }).slice(0, n)
      .map(function (s) { return s.id; });
  }
  async function login(idf, pw, remember) {
    return A.login({ identifier: idf, password: pw, remember: !!remember });
  }
  function peekLS(key) { try { return JSON.parse(G.localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function wipeSessionStores() {
    try { G.sessionStorage.removeItem('maison_v1_session'); } catch (e) {}
    try { G.localStorage.removeItem('maison_v1_session_fb'); } catch (e) {}
  }

  /* เทียม "เวลาปัจจุบัน" รอบเดียว เพื่อทดสอบพฤติกรรมวันที่/เขตเวลา */
  function withMockedNow(fakeMs, fn) {
    var Real = G.Date;
    function Fake(t) { return t === undefined ? new Real(fakeMs) : new Real(t); }
    Fake.prototype = Real.prototype;
    Fake.now = function () { return fakeMs; };
    Fake.parse = Real.parse;
    Fake.UTC = Real.UTC;
    G.Date = Fake;
    try { return fn(); } finally { G.Date = Real; }
  }

  var lastBookedSeats = [];
  var TESTS = [];
  function t(suite, name, fn) { TESTS.push({ suite: suite, name: name, fn: fn }); }

  /* ============================================================ S1 */
  t('S1 ข้อมูลตั้งต้น', 'ค่าคงที่ระบบ: genre 8 แนว / โรง 2 หลัง หลังละ 8×12 / ช่วงเวลา 3 ช่วง / ค่าบริการ 30', function () {
    eq(A.genres.length, 8);
    eq(A.halls.length, 2);
    eq(A.halls.map(function (h) { return h.id; }), ['hall-01', 'hall-02']);
    A.halls.forEach(function (h) {
      eq(h.rows.length, 8, 'แถวของ ' + h.id);
      eq(h.cols, 12, 'จำนวนที่นั่งต่อแถวของ ' + h.id);
    });
    eq(A.periods.map(function (p) { return p.key; }), ['morning', 'afternoon', 'evening']);
    eq(A.periods.map(function (p) { return p.time; }), ['10:30', '14:20', '19:00']);
    eq(A.serviceFee, 30);
    eq(A.mode, 'mock');
  });
  t('S1 ข้อมูลตั้งต้น', 'movies() คืนหนังกำลังฉาย 8 เรื่อง ครบ 8 แนว พร้อมตารางฉาย (โรง/ช่วงวัน/ช่วงเวลา)', async function () {
    var res = await A.movies();
    eq(res.total, 8, 'จำนวนหนังกำลังฉาย');
    eq(res.date, refTodayISO(), 'วันที่ default ต้องเป็นวันนี้ (ตามเขตเวลาท้องถิ่น)');
    var gs = {};
    res.items.forEach(function (m) { m.genres.forEach(function (g) { gs[g] = true; }); });
    eq(Object.keys(gs).sort(), A.genres.slice().sort(), 'แนวหนังต้องครบ 8 แนวพอดี');
    res.items.forEach(function (m) {
      ok(m.poster.indexOf('assets/img/') === 0, 'โปสเตอร์ของ ' + m.title);
      ok(A.halls.some(function (h) { return h.name === m.hall; }), 'โรงฉายของ ' + m.title + ' ต้องเป็นโรงที่มีจริง');
      ok(/^\d{4}-\d{2}-\d{2}$/.test(m.dateStart) && /^\d{4}-\d{2}-\d{2}$/.test(m.dateEnd), 'ช่วงวันฉายของ ' + m.title);
      ok(m.dateStart <= m.dateEnd, 'วันเริ่มฉายต้องไม่หลังวันสิ้นสุดของ ' + m.title);
      ok(m.periods.length >= 1, m.title + ' ต้องมีช่วงเวลาฉายอย่างน้อย 1 ช่วง');
    });
    /* ตาราง seed ต้องไม่มีเรื่องใดชนโรง+ช่วงเวลา+วันที่ซ้อนกัน */
    res.items.forEach(function (a) {
      res.items.forEach(function (b) {
        if (a.id >= b.id || a.hall !== b.hall) { return; }
        var overlapDate = a.dateStart <= b.dateEnd && b.dateStart <= a.dateEnd;
        var overlapPeriod = a.periods.some(function (p) { return b.periods.indexOf(p) !== -1; });
        ok(!(overlapDate && overlapPeriod), 'ตารางของ ' + a.title + ' ชนกับ ' + b.title);
      });
    });
  });
  t('S1 ข้อมูลตั้งต้น', 'ฐานข้อมูลจำลองเขียนลง key maison_v1_db (seedVersion 4) พร้อมประวัติ demo 2 รายการ', function () {
    var db = peekLS('maison_v1_db');
    ok(db, 'ต้องมี db ใน localStorage');
    eq(db.seedVersion, 4);
    ok(db.bookings.length >= 2, 'seed ต้องมีประวัติ demo 2 รายการ');
    db.bookings.forEach(function (b) {
      ok(/-morning$|-afternoon$|-evening$/.test(b.showtimeId), 'showtimeId ของ ' + b.code + ' ต้องเป็นรูปแบบช่วงเวลา');
    });
  });
  t('S1 ข้อมูลตั้งต้น', 'comingSoon() คืน 3 เรื่อง พร้อมวันเข้าฉายโดยประมาณ', async function () {
    var items = await A.comingSoon();
    eq(items.length, 3);
    items.forEach(function (m) { ok(/^\d{4}-\d{2}-\d{2}$/.test(m.releaseDate), 'releaseDate ของ ' + m.title); });
  });
  t('S1 ข้อมูลตั้งต้น', 'promotions() คืน 3 รายการ โค้ดตรงตาม seed', async function () {
    var ps = await A.promotions();
    eq(ps.map(function (p) { return p.code; }).sort(), ['EVENINGPAIR', 'FRIDAY180', 'MAISON20']);
  });
  t('S1 ข้อมูลตั้งต้น', 'showDates() คืน 6 วัน เริ่มวันนี้ เรียงขึ้น ไม่ซ้ำ', function () {
    var ds = A.showDates();
    eq(ds.length, 6);
    eq(ds[0], refTodayISO(), 'วันแรกต้องเป็นวันนี้');
    for (var i = 1; i < ds.length; i++) { ok(ds[i] > ds[i - 1], 'ต้องเรียงขึ้น: ' + ds.join(',')); }
  });

  /* ============================================================ S2 */
  t('S2 สิทธิ์ (guest)', 'me / myBookings / createBooking ตอบ 401 เมื่อยังไม่ login', async function () {
    await expectError(A.me(), 401);
    await expectError(A.myBookings(), 401);
    await expectError(A.createBooking({ showtimeId: stIdOf('m01', refTodayISO(), 'morning'), seatIds: ['hall-01-A1'] }), 401);
  });
  t('S2 สิทธิ์ (guest)', 'งาน admin ทั้งหมดตอบ 401 เมื่อยังไม่ login', async function () {
    await expectError(A.adminStats(), 401);
    await expectError(A.adminUsers(), 401);
    await expectError(A.adminMovies(), 401);
    await expectError(A.adminDeleteUser('u-demo'), 401);
    await expectError(A.adminPromotions(), 401);
    await expectError(A.adminCreatePromotion({}), 401);
    await expectError(A.adminUpdatePromotion('p01', {}), 401);
    await expectError(A.adminDeletePromotion('p01'), 401);
  });

  /* ============================================================ S3 */
  t('S3 สมาชิกและรหัสผ่าน', 'register: username สั้น / อีเมลเพี้ยน / รหัสอ่อน / ยืนยันไม่ตรง = 422', async function () {
    await expectError(A.register({ username: 'ab', email: 't@example.com', password: 'Passw0rd1', confirmPassword: 'Passw0rd1' }), 422);
    await expectError(A.register({ username: 'tester1', email: 'not-an-email', password: 'Passw0rd1', confirmPassword: 'Passw0rd1' }), 422);
    await expectError(A.register({ username: 'tester1', email: 't@example.com', password: 'short', confirmPassword: 'short' }), 422);
    await expectError(A.register({ username: 'tester1', email: 't@example.com', password: 'Passw0rd1', confirmPassword: 'Different1' }), 422);
  });
  t('S3 สมาชิกและรหัสผ่าน', 'register สำเร็จ 2 บัญชี (tester1, tester2) ได้สิทธิ์ user', async function () {
    var r1 = await A.register({ username: 'tester1', email: 'tester1@example.com', password: 'Passw0rd1', confirmPassword: 'Passw0rd1' });
    eq(r1.user.username, 'tester1');
    eq(r1.user.role, 'user');
    var r2 = await A.register({ username: 'tester2', email: 'tester2@example.com', password: 'Passw0rd2', confirmPassword: 'Passw0rd2' });
    eq(r2.user.username, 'tester2');
  });
  t('S3 สมาชิกและรหัสผ่าน', 'register ซ้ำ (username หรือ email ที่ใช้แล้ว) = 409', async function () {
    await expectError(A.register({ username: 'tester1', email: 'other@example.com', password: 'Passw0rd9', confirmPassword: 'Passw0rd9' }), 409);
    await expectError(A.register({ username: 'tester9', email: 'tester2@example.com', password: 'Passw0rd9', confirmPassword: 'Passw0rd9' }), 409);
  });
  t('S3 สมาชิกและรหัสผ่าน', 'login ด้วย username / email / ตัวพิมพ์ใหญ่ได้ และรหัสผิดหรือไม่มีบัญชี = 401', async function () {
    eq((await login('demo', 'demo123')).user.username, 'demo');
    await A.logout();
    eq((await login('demo@maison.demo', 'demo123')).user.username, 'demo');
    await A.logout();
    eq((await login('DEMO', 'demo123')).user.username, 'demo');
    await A.logout();
    await expectError(login('demo', 'wrong-pass1'), 401);
    await expectError(login('ghost-user', 'whatever123'), 401);
  });
  t('S3 สมาชิกและรหัสผ่าน', 'session: currentUser/me ตรงกับคนที่ login และ logout ล้าง session', async function () {
    await login('demo', 'demo123');
    eq(A.currentUser() && A.currentUser().username, 'demo');
    eq((await A.me()).user.username, 'demo');
    await A.logout();
    eq(A.currentUser(), null);
    await expectError(A.me(), 401);
  });
  t('S3 สมาชิกและรหัสผ่าน', 'Remember me: session ฟื้นจาก localStorage เมื่อ sessionStorage ถูกล้าง (regression P-10)', async function () {
    await login('demo', 'demo123', true);
    ok(peekLS('maison_v1_remember'), 'ต้องเก็บ remember ไว้ใน localStorage');
    if (IS_NODE) { ok(G.document.cookie.indexOf('maison_remember') !== -1, 'ต้องเขียน cookie maison_remember'); }
    wipeSessionStores();
    eq(A.currentUser() && A.currentUser().username, 'demo', 'ต้องฟื้น session จาก remember ได้');
    await A.logout();
    eq(peekLS('maison_v1_remember'), null, 'logout ต้องล้าง remember');
    eq(A.currentUser(), null);
  });
  t('S3 สมาชิกและรหัสผ่าน', 'changePassword: รหัสเดิมผิด 401 / ใหม่อ่อน 422 / ยืนยันไม่ตรง 422 / ซ้ำรหัสเดิม 422', async function () {
    await login('demo', 'demo123');
    await expectError(A.changePassword({ currentPassword: 'wrong1234', newPassword: 'NewPass99', confirmPassword: 'NewPass99' }), 401);
    await expectError(A.changePassword({ currentPassword: 'demo123', newPassword: 'weak', confirmPassword: 'weak' }), 422);
    await expectError(A.changePassword({ currentPassword: 'demo123', newPassword: 'NewPass99', confirmPassword: 'OtherPass9' }), 422);
    await expectError(A.changePassword({ currentPassword: 'demo123', newPassword: 'demo123', confirmPassword: 'demo123' }), 422);
    await A.logout();
  });
  t('S3 สมาชิกและรหัสผ่าน', 'changePassword สำเร็จ: รหัสเก่าใช้ไม่ได้ รหัสใหม่ใช้ได้ (ทดสอบแล้วเปลี่ยนกลับ)', async function () {
    /* ใช้ tester1 แทน demo เพราะรหัส seed ของ demo (demo123) สั้นกว่านโยบาย 8 ตัวอักษร
       เปลี่ยนกลับไม่ได้ และจะทำให้ข้อทดสอบถัด ๆ ไป login demo ไม่ได้ */
    await login('tester1', 'Passw0rd1');
    await A.changePassword({ currentPassword: 'Passw0rd1', newPassword: 'NewPass99', confirmPassword: 'NewPass99' });
    await A.logout();
    await expectError(login('tester1', 'Passw0rd1'), 401, 'รหัสเก่าต้องใช้ไม่ได้');
    await login('tester1', 'NewPass99');
    await A.changePassword({ currentPassword: 'NewPass99', newPassword: 'Passw0rd1', confirmPassword: 'Passw0rd1' });
    await A.logout();
    await login('tester1', 'Passw0rd1');
    await A.logout();
  });

  /* ============================================================ S4 */
  t('S4 ค้นหา/กรอง/รอบฉาย', 'ค้นหาชื่อแบบไม่สนตัวพิมพ์เล็ก-ใหญ่ และคำที่ไม่ตรงต้องได้ 0 เรื่อง', async function () {
    eq((await A.movies({ search: 'requiem' })).total, 1);
    eq((await A.movies({ search: 'REQUIEM' })).items[0].title, 'Iron Requiem');
    eq((await A.movies({ search: 'zzzznope' })).total, 0);
  });
  t('S4 ค้นหา/กรอง/รอบฉาย', 'กรองตามแนว และใช้ค้นหาร่วมกับกรองได้', async function () {
    eq((await A.movies({ genre: 'Horror' })).items[0].title, 'The Hollow Choir');
    eq((await A.movies({ genre: 'Western' })).items[0].title, 'Dust and Ember');
    eq((await A.movies({ search: 'the', genre: 'Horror' })).total, 1);
  });
  t('S4 ค้นหา/กรอง/รอบฉาย', 'เรียงตามชื่อ (title) และราคาถูกขึ้น (price-asc)', async function () {
    var byTitle = (await A.movies({ sort: 'title' })).items;
    for (var i = 1; i < byTitle.length; i++) { ok(byTitle[i - 1].title.localeCompare(byTitle[i].title) <= 0, 'เรียงชื่อไม่ถูกที่ ' + byTitle[i].title); }
    var byPrice = (await A.movies({ sort: 'price-asc' })).items;
    for (var j = 1; j < byPrice.length; j++) { ok(byPrice[j - 1].price <= byPrice[j].price, 'เรียงราคาไม่ถูกที่ ' + byPrice[j].title); }
  });
  t('S4 ค้นหา/กรอง/รอบฉาย', 'movie(): ข้อมูลถูก + ตารางฉายครบ (โรง/ช่วงวัน/ป้ายช่วงเวลา) / จะฉายไม่มีตาราง / ไม่มีเรื่อง 404', async function () {
    var m1 = await A.movie('m01');
    eq(m1.title, 'Iron Requiem');
    eq(m1.price, 260);
    eq(m1.genres, ['Action']);
    eq(m1.hall, 'Hall 01');
    eq(m1.dateStart, refTodayISO(), 'm01 เริ่มฉายวันนี้');
    eq(m1.dateEnd, refISO(3), 'm01 หมดวันฉายวันที่ +3');
    eq(m1.periods, ['morning']);
    eq(m1.periodLabels, ['เช้า']);
    var m7 = await A.movie('m07');
    eq(m7.hall, 'Hall 02');
    eq(m7.periodLabels, ['เย็น']);
    var m9 = await A.movie('m09');
    eq(m9.nowShowing, false);
    eq(m9.hall, null, 'หนังจะฉายต้องไม่มีโรง');
    eq(m9.periods, [], 'หนังจะฉายต้องไม่มีช่วงเวลา');
    await expectError(A.movie('nope'), 404);
  });
  t('S4 ค้นหา/กรอง/รอบฉาย', 'showtimes(): ตามช่วงเวลาในตารางของเรื่องนั้น เวลา/โรง/ราคาตรง (m01 Hall 01 เช้า, m07 Hall 02 เย็น)', async function () {
    var r1 = await A.showtimes('m01', refTodayISO());
    eq(r1.items.map(function (s) { return s.time; }), ['10:30'], 'm01 ต้องมีเฉพาะรอบเช้า');
    eq(r1.items.map(function (s) { return s.period; }), ['morning']);
    eq(r1.price, 260);
    eq(r1.hall, 'Hall 01');
    eq(r1.dateStart, refTodayISO());
    eq(r1.dateEnd, refISO(3));
    var r7 = await A.showtimes('m07', refTodayISO());
    eq(r7.items.map(function (s) { return s.time; }), ['19:00']);
    eq(r7.hall, 'Hall 02');
    eq(r7.items[0].periodLabel, 'เย็น');
    r7.items.forEach(function (s) { ok(s.status === 'available' || s.status === 'full', 'สถานะรอบไม่ถูกต้อง'); });
  });
  t('S4 ค้นหา/กรอง/รอบฉาย', 'ช่วงวันฉาย: วันนอกช่วง = 0 รอบ (m01 วัน +4, m06 วันนี้) และ m06 เริ่มมีรอบวัน +3', async function () {
    eq((await A.showtimes('m01', refISO(4))).items.length, 0, 'm01 หมดช่วงฉายแล้ววันที่ +4');
    eq((await A.showtimes('m06', refTodayISO())).items.length, 0, 'm06 ยังไม่เริ่มฉายวันนี้');
    var r = await A.showtimes('m06', refISO(3));
    eq(r.items.length, 1, 'm06 ต้องมีรอบวันที่ +3');
    eq(r.hall, 'Hall 02');
    eq(r.items[0].time, '14:20');
  });
  t('S4 ค้นหา/กรอง/รอบฉาย', 'สถานะเต็ม: The Hollow Choir รอบเย็นวันนี้ต้องเต็ม (fixture) และเป็นรอบเดียวของเรื่อง', async function () {
    var res = await A.showtimes('m02', refTodayISO());
    eq(res.items.length, 1, 'm02 มีเฉพาะรอบเย็น');
    eq(res.items[0].id, stIdOf('m02', refTodayISO(), 'evening'));
    eq(res.items[0].status, 'full', 'รอบเย็นของ m02 ต้องเต็ม');
    eq(res.items[0].availableCount, 0);
  });
  t('S4 ค้นหา/กรอง/รอบฉาย', 'seats(): 96 ที่นั่งต่อโรง / id ขึ้นต้นด้วยรหัสโรง / รอบเต็ม booked ทั้งหมด / deterministic / ไม่มีรอบ 404', async function () {
    var fullRes = await A.seats(stIdOf('m02', refTodayISO(), 'evening'));
    eq(fullRes.seats.length, 96);
    eq(fullRes.hall.id, 'hall-01');
    ok(fullRes.seats.every(function (s) { return s.status === 'booked'; }), 'รอบเต็มต้อง booked ทุกที่นั่ง');
    var h2 = await A.seats(stIdOf('m06', refISO(3), 'afternoon'));
    eq(h2.hall.id, 'hall-02');
    ok(h2.seats.every(function (s) { return s.id.indexOf('hall-02-') === 0; }), 'ที่นั่งของ Hall 02 ต้องขึ้นต้น hall-02-');
    var st = stIdOf('m01', refTodayISO(), 'morning');
    var booked1 = (await A.seats(st)).seats.filter(function (s) { return s.status === 'booked'; }).length;
    ok(booked1 > 0 && booked1 < 96, 'รอบปกติต้องมีทั้งว่างและจองแล้ว');
    var booked2 = (await A.seats(st)).seats.filter(function (s) { return s.status === 'booked'; }).length;
    eq(booked2, booked1, 'ผล occupancy ต้อง deterministic ซ้ำกัน');
    await expectError(A.seats('st-m99-2026-01-01-evening'), 404);
    await expectError(A.seats('not-a-showtime'), 404);
    await expectError(A.showtimes('m09', refTodayISO()), 404, 'หนังที่ยังไม่ฉายต้องไม่มีรอบ');
    await expectError(A.seats(stIdOf('m01', refISO(4), 'morning')), 404, 'รอบนอกช่วงวันฉายต้อง 404');
  });

  /* ============================================================ S5 */
  t('S5 ที่นั่งและการจอง', 'จองโดยไม่เลือกที่นั่ง = 422 และจองรอบเต็ม = 409', async function () {
    await login('tester1', 'Passw0rd1');
    await expectError(A.createBooking({ showtimeId: stIdOf('m01', refTodayISO(), 'morning'), seatIds: [] }), 422);
    await expectError(A.createBooking({ showtimeId: stIdOf('m02', refTodayISO(), 'evening'), seatIds: ['hall-01-A1'] }), 409);
    await A.logout();
  });
  t('S5 ที่นั่งและการจอง', 'ที่นั่งต้องเป็นของโรงที่ฉายรอบนั้น: จอง m07 (Hall 02) ด้วยที่นั่ง hall-01 = 422 / ที่นั่งไม่มีจริง = 422', async function () {
    await login('tester1', 'Passw0rd1');
    var st = stIdOf('m07', refTodayISO(), 'evening');
    await expectError(A.createBooking({ showtimeId: st, seatIds: ['hall-01-A1'] }), 422, 'ที่นั่งของโรงอื่นต้องถูกปฏิเสธ');
    await expectError(A.createBooking({ showtimeId: st, seatIds: ['hall-02-Z99'] }), 422, 'ที่นั่งที่ไม่มีจริงต้องถูกปฏิเสธ');
    await A.logout();
  });
  t('S5 ที่นั่งและการจอง', 'จอง 2 ที่นั่ง: รวม = (ราคา 260 + ค่าบริการ 30) × 2 และที่นั่งเปลี่ยนเป็น booked', async function () {
    await login('tester1', 'Passw0rd1');
    var st = stIdOf('m01', refTodayISO(), 'morning');
    var pick = await firstAvailable(st, 2);
    eq(pick.length, 2);
    var b = (await A.createBooking({ showtimeId: st, seatIds: pick })).booking;
    eq(b.movieTitle, 'Iron Requiem');
    eq(b.unitPrice, 260);
    eq(b.serviceFee, 30);
    eq(b.total, (260 + 30) * 2, 'ต้นทุนรวม = (ราคา+ค่าบริการ)×จำนวนที่นั่ง');
    eq(b.seats.length, 2);
    eq(b.status, 'confirmed');
    ok(/^MAI-/.test(b.code), 'รหัสจองต้องขึ้นต้น MAI-');
    lastBookedSeats = pick;
    var after = await A.seats(st);
    pick.forEach(function (id) {
      var s = after.seats.filter(function (x) { return x.id === id; })[0];
      eq(s.status, 'booked', id + ' ต้องเป็น booked หลังจอง');
    });
  });
  t('S5 ที่นั่งและการจอง', 'จองที่นั่งเดิมซ้ำ = 409 พร้อมรายการ conflicts ตรงกับที่นั่งที่ชน', async function () {
    ok(lastBookedSeats.length === 2, 'ต้องมีที่นั่งที่จองไว้จากข้อก่อน');
    var err = await expectError(A.createBooking({ showtimeId: stIdOf('m01', refTodayISO(), 'morning'), seatIds: lastBookedSeats }), 409);
    eq((err.conflicts || []).sort(), lastBookedSeats.slice().sort(), 'conflicts ต้องตรงกับที่นั่งที่ชน');
  });
  t('S5 ที่นั่งและการจอง', 'myBookings: tester1 เห็นการจองของตัวเองครบ field (ชื่อ/ที่นั่ง/ยอด)', async function () {
    var list = await A.myBookings();
    ok(list.length >= 1, 'ต้องมีอย่างน้อย 1 รายการ');
    var b = list[0];
    eq(b.movieTitle, 'Iron Requiem');
    eq(b.seats.length, 2);
    eq(b.total, 580);
    ok(b.startsAt.indexOf('T') !== -1, 'startsAt ต้องเป็นรูปแบบ ISO');
  });
  t('S5 ที่นั่งและการจอง', 'demo มีประวัติจองตั้งต้นจาก seed 2 รายการ (Orbit 9 @ Hall 01 และ Bangkok Bank Run @ Hall 02)', async function () {
    await A.logout();
    await login('demo', 'demo123');
    var list = await A.myBookings();
    eq(list.length, 2);
    ok(list.every(function (b) { return b.userId === 'u-demo'; }), 'ต้องเป็นประวัติของ demo เท่านั้น');
    var b7 = list.filter(function (b) { return b.code === 'MAI-7Q3F'; })[0];
    ok(b7, 'ต้องมีรายการ MAI-7Q3F');
    eq(b7.movieTitle, 'Orbit 9');
    eq(b7.hall, 'Hall 01');
    eq(b7.seats.length, 2);
    eq(b7.total, 660, 'Orbit 9 (300+30)×2');
    var b2 = list.filter(function (b) { return b.code === 'MAI-2K8D'; })[0];
    ok(b2, 'ต้องมีรายการ MAI-2K8D');
    eq(b2.movieTitle, 'Bangkok Bank Run');
    eq(b2.hall, 'Hall 02');
    eq(b2.total, 230, 'Bangkok Bank Run (200+30)×1');
    await A.logout();
  });

  /* ============================================================ S6 */
  t('S6 โปรโมชัน', 'promotion(): ดึงรายละเอียดตาม id ได้ และ id ไม่มี = 404', async function () {
    var p = await A.promotion('p01');
    eq(p.code, 'MAISON20');
    ok(Array.isArray(p.terms) && p.terms.length >= 1, 'ต้องมีข้อกำหนดการใช้');
    await expectError(A.promotion('zz'), 404);
  });
  t('S6 โปรโมชัน', 'redeem: ตัดช่องว่าง + ไม่สนตัวพิมพ์เล็ก-ใหญ่ / โค้ดไม่มี = 404', async function () {
    var r = await A.redeem(' maison20 ');
    eq(r.valid, true);
    eq(r.promotion.code, 'MAISON20');
    await expectError(A.redeem('NOPE123'), 404);
  });

  /* ============================================================ S7 */
  t('S7 แอดมิน', 'ผู้ใช้ทั่วไปเรียกงาน admin = 403', async function () {
    await login('tester1', 'Passw0rd1');
    await expectError(A.adminStats(), 403);
    await expectError(A.adminUsers(), 403);
    await expectError(A.adminCreateMovie({ title: 'X Film', price: 100, genres: ['Drama'] }), 403);
    await expectError(A.adminDeleteMovie('m01'), 403);
    await expectError(A.adminPromotions(), 403);
    await expectError(A.adminCreatePromotion({}), 403);
    await expectError(A.adminUpdatePromotion('p01', {}), 403);
    await expectError(A.adminDeletePromotion('p01'), 403);
    await A.logout();
  });
  t('S7 แอดมิน', 'คูปอง: เพิ่ม/แก้/ลบ สะท้อนหน้า public/redeem, ตรวจรหัสซ้ำและภาพที่ไม่ปลอดภัย', async function () {
    await login('admin', 'admin123');
    eq((await A.adminPromotions()).length, 3);
    var fields = { code: ' new-50 ', title: 'คูปองทดสอบ', summary: 'คำอธิบาย', details: 'รายละเอียด', terms: ['เงื่อนไข'] };
    await expectError(A.adminCreatePromotion(Object.assign({}, fields, { code: 'MAISON20' })), 409);
    await expectError(A.adminCreatePromotion(Object.assign({}, fields, { image: 'javascript:alert(1)' })), 422);
    await expectError(A.adminCreatePromotion(Object.assign({}, fields, { image: 'data:image/png;base64,YWJj' })), 422);
    var image = 'data:image/png;base64,' + (typeof Buffer !== 'undefined' ? Buffer.from('\x89PNG\r\n\x1a\n').toString('base64') : 'iVBORw0KGgo=');
    var p = await A.adminCreatePromotion(Object.assign({}, fields, { image: image }));
    eq(p.code, 'NEW-50');
    eq((await A.promotions()).length, 4);
    eq((await A.redeem('new-50')).promotion.id, p.id);
    eq((await A.promotion(p.id)).image, image);
    var updated = await A.adminUpdatePromotion(p.id, { title: 'คูปองใหม่', code: 'FINAL-50' });
    eq(updated.title, 'คูปองใหม่');
    eq((await A.promotion(p.id)).image, image);
    await expectError(A.adminUpdatePromotion(p.id, { code: 'MAISON20' }), 409);
    await expectError(A.adminUpdatePromotion('missing', {}), 404);
    await A.adminDeletePromotion(p.id);
    eq((await A.promotions()).length, 3);
    await expectError(A.redeem('FINAL-50'), 404);
    await expectError(A.adminDeletePromotion(p.id), 404);
    await A.logout();
  });
  t('S7 แอดมิน', 'localStorage เต็ม: คูปองที่เพิ่มไม่รายงานสำเร็จและไม่ค้างใน memory', async function () {
    await login('admin', 'admin123');
    var original = G.localStorage.setItem;
    G.localStorage.setItem = function (key, val) {
      if (key === 'maison_v1_db') { var e = new Error('Quota exceeded'); e.name = 'QuotaExceededError'; throw e; }
      return original.call(G.localStorage, key, val);
    };
    try {
      await expectError(A.adminCreatePromotion({ code: 'FULL-50', title: 'เต็ม', summary: 'สั้น', details: 'ยาว', terms: [] }), 507);
      eq((await A.promotions()).length, 3);
    } finally { G.localStorage.setItem = original; await A.logout(); }
  });
  t('S7 แอดมิน', 'adminStats: รูปร่างครบ (daily 14 วัน, ยอดรวมตรงตาราง byMovie, กรองวันที่ได้)', async function () {
    await login('admin', 'admin123');
    var s = await A.adminStats();
    eq(s.isDemoData, true);
    ok(s.totalUsers >= 4, 'ต้องนับผู้ใช้ >= 4 (admin, demo, tester1, tester2)');
    eq(s.daily.length, 14);
    var sumTickets = s.byMovie.reduce(function (a, r) { return a + r.tickets; }, 0);
    eq(sumTickets, s.tickets, 'ผลรวมตั๋วจากตารางต้องตรงกับ tickets');
    var s7 = await A.adminStats({ days: 7 });
    ok(s7.bookings <= s.bookings, 'กรอง 7 วันต้องไม่มากกว่าช่วงทั้งหมด');
  });
  t('S7 แอดมิน', 'adminUsers: ครบบัญชี + ค้นหาได้ + นับ bookingCount', async function () {
    var users = await A.adminUsers();
    var names = users.map(function (u) { return u.username; });
    ok(names.indexOf('admin') !== -1 && names.indexOf('demo') !== -1 && names.indexOf('tester1') !== -1, 'ต้องมีบัญชีหลักครบ');
    var demo = users.filter(function (u) { return u.username === 'demo'; })[0];
    eq(demo.bookingCount, 2, 'demo ต้องมี bookingCount 2 จาก seed');
    var found = await A.adminUsers({ search: 'tester1' });
    eq(found.length, 1);
    eq(found[0].username, 'tester1');
  });
  t('S7 แอดมิน', 'adminSetRole: เปลี่ยนสิทธิ์ได้ / ลดสิทธิ์ตัวเอง 422 / role ไม่ถูกต้อง 422', async function () {
    var users = await A.adminUsers();
    var t1 = users.filter(function (u) { return u.username === 'tester1'; })[0];
    var me = users.filter(function (u) { return u.username === 'admin'; })[0];
    eq((await A.adminSetRole(t1.id, 'admin')).role, 'admin');
    eq((await A.adminSetRole(t1.id, 'user')).role, 'user');
    await expectError(A.adminSetRole(me.id, 'user'), 422);
    await expectError(A.adminSetRole(t1.id, 'superuser'), 422);
  });
  t('S7 แอดมิน', 'adminDeleteUser: ลบตัวเอง 422 / ไม่มีบัญชี 404 / ลบบัญชีอื่นได้จริง', async function () {
    var users = await A.adminUsers();
    var me = users.filter(function (u) { return u.username === 'admin'; })[0];
    var t2 = users.filter(function (u) { return u.username === 'tester2'; })[0];
    await expectError(A.adminDeleteUser(me.id), 422);
    await expectError(A.adminDeleteUser('u-ghost'), 404);
    await A.adminDeleteUser(t2.id);
    eq((await A.adminUsers()).filter(function (u) { return u.username === 'tester2'; }).length, 0, 'tester2 ต้องถูกลบแล้ว');
  });
  t('S7 แอดมิน', 'adminMovies + สร้างหนัง: validation ครบ (422/409) และสร้างสำเร็จเป็น m12 พร้อมตารางฉาย', async function () {
    eq((await A.adminMovies()).length, 11, '8 กำลังฉาย + 3 จะฉาย');
    await expectError(A.adminCreateMovie({ title: '', price: 100, genres: ['Drama'] }), 422);
    await expectError(A.adminCreateMovie({ title: 'No Price', price: 0, genres: ['Drama'] }), 422);
    await expectError(A.adminCreateMovie({ title: 'Too Much', price: 6000, genres: ['Drama'] }), 422);
    await expectError(A.adminCreateMovie({ title: 'No Genre', price: 100 }), 422);
    await expectError(A.adminCreateMovie({ title: 'Orbit 9', price: 100, genres: ['Drama'] }), 409);
    /* ตารางฉาย (v1.3): โรง / ช่วงเวลา / ช่วงวันที่ ต้องครบ */
    await expectError(A.adminCreateMovie({ title: 'No Hall', price: 100, genres: ['Drama'], dateStart: refISO(6), dateEnd: refISO(8), periods: ['evening'] }), 422, 'ไม่เลือกโรง');
    await expectError(A.adminCreateMovie({ title: 'No Period', price: 100, genres: ['Drama'], hallId: 'hall-02', dateStart: refISO(6), dateEnd: refISO(8) }), 422, 'ไม่เลือกช่วงเวลา');
    await expectError(A.adminCreateMovie({ title: 'No Dates', price: 100, genres: ['Drama'], hallId: 'hall-02', periods: ['evening'] }), 422, 'ไม่ระบุช่วงวันที่');
    await expectError(A.adminCreateMovie({ title: 'Bad Range', price: 100, genres: ['Drama'], hallId: 'hall-02', dateStart: refISO(8), dateEnd: refISO(6), periods: ['evening'] }), 422, 'วันสิ้นสุดก่อนวันเริ่ม');
    /* ตารางชน: Hall 01 รอบเช้าวันนี้ถึง +5 ชนกับ Iron Requiem / m08 */
    await expectError(A.adminCreateMovie({ title: 'Clash Reel', price: 100, genres: ['Drama'], hallId: 'hall-01', dateStart: refTodayISO(), dateEnd: refISO(5), periods: ['morning'] }), 409);
    var created = await A.adminCreateMovie({ title: 'Test Reel พิเศษ', price: 150, genres: ['Drama'], director: 'QA', nowShowing: true, hallId: 'hall-02', dateStart: refISO(6), dateEnd: refISO(8), periods: ['evening'] });
    eq(created.id, 'm12');
    eq(created.hallId, 'hall-02');
    eq(created.dateStart, refISO(6));
    eq(created.dateEnd, refISO(8));
    eq(created.periods, ['evening']);
    eq((await A.adminMovies({ search: 'Test Reel' })).length, 1);
    eq((await A.movies()).total, 9, 'หนังกำลังฉายต้องเพิ่มเป็น 9');
    eq((await A.showtimes('m12', refISO(6))).items.length, 1, 'm12 ต้องมีรอบเย็นวันที่ +6');
    eq((await A.showtimes('m12', refTodayISO())).items.length, 0, 'm12 ยังไม่เริ่มฉายในวันนี้');
  });
  t('S7 แอดมิน', 'adminUpdateMovie: แก้ราคาได้ / ชื่อชนกับเรื่องอื่น 409 / ไม่มีเรื่อง 404', async function () {
    eq((await A.adminUpdateMovie('m12', { price: 180 })).price, 180);
    await expectError(A.adminUpdateMovie('m12', { title: 'Orbit 9' }), 409);
    await expectError(A.adminUpdateMovie('m99', { price: 100 }), 404);
  });
  t('S7 แอดมิน', 'แก้ตารางฉาย: โรงไม่ถูกต้อง 422 / ตารางชนเรื่องอื่น 409 / ยืดช่วงวันฉายได้จริง', async function () {
    await expectError(A.adminUpdateMovie('m12', { hallId: 'hall-03' }), 422, 'โรงที่ไม่มีจริง');
    await expectError(A.adminUpdateMovie('m12', { hallId: 'hall-01', dateStart: refTodayISO(), dateEnd: refISO(2), periods: ['evening'] }), 409, 'ชน The Hollow Choir (Hall 01 รอบเย็น)');
    var up = await A.adminUpdateMovie('m12', { dateEnd: refISO(9) });
    eq(up.dateEnd, refISO(9));
    eq((await A.showtimes('m12', refISO(9))).items.length, 1, 'วันที่ +9 ต้องมีรอบหลังยืดช่วงฉาย');
  });
  t('S7 แอดมิน', 'ลบหนัง: ประวัติจองยังเห็นชื่อเรื่อง (movieTitle snapshot) และรอบฉายหาย', async function () {
    await A.logout();
    await login('tester1', 'Passw0rd1');
    var st = stIdOf('m12', refISO(6), 'evening');
    var pick = await firstAvailable(st, 1);
    eq((await A.createBooking({ showtimeId: st, seatIds: pick })).booking.movieTitle, 'Test Reel พิเศษ');
    await A.logout();
    await login('admin', 'admin123');
    eq((await A.adminDeleteMovie('m12')).removedTitle, 'Test Reel พิเศษ');
    eq((await A.movies()).total, 8, 'กลับมา 8 เรื่องหลังลบ');
    await expectError(A.showtimes('m12', refTodayISO()), 404, 'รอบของหนังที่ลบแล้วต้อง 404');
    await A.logout();
    await login('tester1', 'Passw0rd1');
    var snap = (await A.myBookings()).filter(function (b) { return b.movieTitle === 'Test Reel พิเศษ'; });
    eq(snap.length, 1, 'ประวัติต้องยังแสดงชื่อหนังที่ถูกลบ (snapshot)');
    await A.logout();
  });

  /* ============================================================ S8 */
  t('S8 วันที่/เขตเวลา', 'todayISO อิงเขตเวลาท้องถิ่น: เทียมเวลา 00:30 และ 23:59 ของวันนี้ ผลต้องเป็นวันเดิม', function () {
    var today = refTodayISO();
    var y = parseInt(today.slice(0, 4), 10);
    var mo = parseInt(today.slice(5, 7), 10) - 1;
    var d = parseInt(today.slice(8, 10), 10);
    var Real = G.Date;
    var early = new Real(y, mo, d, 0, 30, 0, 0).getTime();
    var late = new Real(y, mo, d, 23, 59, 0, 0).getTime();
    withMockedNow(early, function () {
      eq(A.showDates()[0], today, 'ผ่านเที่ยงคืนไป 30 นาที ต้องยังนับเป็นวันเดิม (จับบัค UTC: P-11)');
    });
    withMockedNow(late, function () {
      eq(A.showDates()[0], today, 'ก่อนเที่ยงคืน 1 นาที ต้องยังเป็นวันเดิม');
    });
  });

  /* ---------- รันชุดทดสอบตามลำดับ ---------- */
  (async function run() {
    line('MAISON — ชุดทดสอบอัตโนมัติ (API logic) ตาม cinema-testing-formation.md');
    var off = new Date().getTimezoneOffset();
    var tzLabel = 'UTC' + (off <= 0 ? '+' : '-') + (Math.abs(off) / 60);
    line('เขตเวลาที่รันอยู่: ' + tzLabel + (off === 0 ? ' (ควรตั้ง TZ=Asia/Bangkok เพื่อจับบัคเขตเวลา)' : ''));
    line('โหมด: ' + (IS_NODE ? 'Node (storage ใน memory — ไม่แตะข้อมูลจริง)' : 'เบราว์เซอร์ (จะคืนค่า storage เมื่อจบ)'));
    line('--------------------------------------------------');
    if (!A) {
      line('[FATAL] ไม่พบ window.MAISON_API — ตรวจว่าโหลด assets/js/api.js ก่อน run-tests.js');
      finish(1);
      return;
    }
    await A.ready;
    for (var i = 0; i < TESTS.length; i++) {
      var item = TESTS[i];
      try {
        await item.fn();
        passCount++;
        line('[PASS] ' + item.suite + ' — ' + item.name);
      } catch (e) {
        failCount++;
        line('[FAIL] ' + item.suite + ' — ' + item.name);
        line('        ' + (e && e.message ? e.message : e));
      }
    }
    line('--------------------------------------------------');
    line('สรุป: ' + passCount + ' ผ่าน / ' + failCount + ' ไม่ผ่าน / รวม ' + TESTS.length + ' รายการ');
    line('SUMMARY pass=' + passCount + ' fail=' + failCount + ' total=' + TESTS.length);
    finish(failCount ? 1 : 0);
  })();

  function finish(code) {
    if (!IS_NODE) {
      /* เบราว์เซอร์: คืนค่า storage ของผู้ใช้จริง (สำรองไว้โดย run-tests.html ก่อนโหลด api.js) */
      try {
        var backup = G.window.__MAISON_TEST_BACKUP || {};
        Object.keys(backup).forEach(function (k) {
          var v = backup[k];
          try {
            if (v && v.ls !== null && v.ls !== undefined) { G.localStorage.setItem(k, v.ls); } else { G.localStorage.removeItem(k); }
            if (v && v.ss !== null && v.ss !== undefined) { G.sessionStorage.setItem(k, v.ss); } else { G.sessionStorage.removeItem(k); }
          } catch (e) {}
        });
        G.document.cookie = 'maison_remember=; max-age=0; path=/';
        line('(คืนค่า localStorage/sessionStorage ของผู้ใช้เรียบร้อย)');
      } catch (e) {}
    } else if (typeof process !== 'undefined' && process.exit) {
      process.exit(code);
    }
  }
})();
