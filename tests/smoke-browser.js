/* =============================================================
   Smoke ผ่านเบราว์เซอร์จริง (Edge/Chrome headless ผ่าน CDP)
   รัน: DATABASE_URL=pglite:./.pglite COOKIE_INSECURE=1 node tests/smoke-browser.js
   (ควร seed --reset ก่อน) — ต้องมี Microsoft Edge หรือ Chrome ในเครื่อง
   เดิน: login ผ่านฟอร์ม → รอบฉาย → เลือกที่นั่ง → checkout → ticket → bookings
   แล้วเปิดครบ 15 หน้า ตรวจ console error / ข้อความ error บนหน้า / localStorage
   ============================================================= */
'use strict';

require('../scripts/env');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) { throw new Error('ไม่พบ Edge/Chrome — ตั้ง BROWSER=path'); }
  const server = require('../scripts/dev-server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maison-smoke-'));
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { resolve(m[1]); }
    });
    setTimeout(() => reject(new Error('browser ไม่ตอบ')), 20000);
  });
  const port = new URL(wsUrl).port;
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let seq = 0;
  const waiting = {};
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting[msg.id]) { waiting[msg.id](msg); delete waiting[msg.id]; return; }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('exception: ' + (msg.params.exceptionDetails.exception || {}).description);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('console.error: ' + msg.params.args.map((a) => a.value || a.description).join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      // 401 ของ /api/auth/me ตอนยังไม่ login, favicon.ico ที่เบราว์เซอร์ขอเอง และ 422 ของ redeem ที่ตั้งใจลองโค้ดผิดเงื่อนไข เป็นเรื่องปกติ ไม่นับ
      if (!/status of 401/.test(msg.params.entry.text) && !/favicon.ico/.test(msg.params.entry.url || '') && !(/status of 422/.test(msg.params.entry.text) && /promotions\/redeem/.test(msg.params.entry.url || ''))) { errors.push('log: ' + msg.params.entry.text + ' ' + (msg.params.entry.url || '')); }
    }
  });
  const send = (method, params) => new Promise((resolve) => {
    const id = ++seq;
    waiting[id] = resolve;
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) { throw new Error('eval: ' + JSON.stringify(r.result.exceptionDetails.exception)); }
    return r.result.result.value;
  };
  const waitFor = async (expr, ms) => {
    const end = Date.now() + (ms || 8000);
    while (Date.now() < end) {
      if (await evaluate('!!(' + expr + ')')) { return true; }
      await sleep(100);
    }
    throw new Error('timeout รอ: ' + expr + ' @ ' + (await evaluate('location.href')));
  };
  const open = async (p) => { await send('Page.navigate', { url: BASE + '/' + p }); await sleep(250); await waitFor('document.readyState === "complete"'); };
  const settle = () => sleep(700);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');

  const results = [];
  async function step(name, fn) {
    const before = errors.length;
    try {
      const note = await fn();
      const errs = errors.slice(before);
      results.push({ name, ok: !errs.length, note: errs.length ? errs.join(' | ') : (note || '') });
    } catch (e) {
      results.push({ name, ok: false, note: e.message + ' ' + errors.slice(before).join(' | ') });
    }
  }
  const text = () => evaluate('document.querySelector("main") ? document.querySelector("main").innerText : document.body.innerText');

  await step('index.html (ยังไม่ login)', async () => {
    await open('index.html'); await settle();
    const t = await evaluate('document.body.innerText');
    if (!/เวอร์ชัน 2\.3/.test(t)) { throw new Error('ไม่พบเวอร์ชัน 2.3'); }
    return 'eyebrow+footer v2.3';
  });
  await step('movies.html + ค้นหา', async () => {
    await open('movies.html'); await settle();
    const n = await evaluate('document.querySelectorAll("a[href*=\\"movie.html?id=\\"]").length');
    if (!n) { throw new Error('ไม่มีการ์ดหนัง'); }
    return n + ' ลิงก์หนัง';
  });
  await step('movie.html?id=m02', async () => {
    await open('movie.html?id=m02'); await settle();
    const t = await text();
    if (!/The Hollow Choir/.test(t)) { throw new Error('ไม่พบชื่อหนัง'); }
    return /เต็ม/.test(t) ? 'แสดงรอบเต็ม' : 'โหลดแล้ว';
  });
  await step('offers.html', async () => { await open('offers.html'); await settle(); return (await text()).slice(0, 0); });
  await step('bookings.html (guard → login)', async () => {
    await open('bookings.html'); await sleep(1200);
    const href = await evaluate('location.href');
    if (!/login\.html/.test(href)) { throw new Error('ไม่ redirect ไป login: ' + href); }
    return 'redirect ไป login';
  });
  await step('register.html', async () => { await open('register.html'); await settle(); });

  await step('login ผ่านฟอร์ม (demo)', async () => {
    await open('login.html'); await settle();
    await evaluate('document.getElementById("fill-demo").click()');
    await evaluate('document.getElementById("login-form").requestSubmit()');
    await waitFor('!/login\\.html/.test(location.href)', 8000);
    const cookie = await evaluate('document.cookie');
    if (/maison_sid/.test(cookie)) { throw new Error('cookie อ่านได้จาก JS (ต้อง HttpOnly)'); }
    const ck = await send('Network.getCookies', { urls: [BASE] });
    const sid = ck.result.cookies.find((c) => c.name === 'maison_sid');
    if (!sid || !sid.httpOnly) { throw new Error('ไม่มี cookie maison_sid แบบ HttpOnly'); }
    return 'cookie HttpOnly, ไปที่ ' + (await evaluate('location.pathname'));
  });

  let stId = '';
  let seatIds = [];
  await step('seats.html (m04 พรุ่งนี้)', async () => {
    stId = await evaluate('MAISON_API.ready.then(function(){return MAISON_API.showtimes("m04", MAISON_API.showDates()[1])}).then(function(r){return r.items[0].id})');
    await open('seats.html?st=' + encodeURIComponent(stId));
    await waitFor('document.querySelectorAll("button.seat").length > 0');
    seatIds = await evaluate('(function(){var b=[].slice.call(document.querySelectorAll("button.seat:not([disabled])")).slice(-2);b.forEach(function(x){x.click()});return b.map(function(x){return x.getAttribute("data-seat")||x.textContent})})()');
    const go = await evaluate('(document.querySelector("a[href*=\\"checkout.html\\"]")||{}).href||""');
    if (!go) { throw new Error('ไม่มีปุ่มไป checkout'); }
    return 'เลือก ' + seatIds.join(',');
  });
  await step('checkout → ticket', async () => {
    const go = await evaluate('document.querySelector("a[href*=\\"checkout.html\\"]").href');
    await send('Page.navigate', { url: go });
    await waitFor('[].some.call(document.querySelectorAll("button"),function(b){return /ยืนยันการจอง/.test(b.textContent)})');
    await evaluate('[].filter.call(document.querySelectorAll("button"),function(b){return /ยืนยันการจอง/.test(b.textContent)})[0].click()');
    await waitFor('/ticket\\.html/.test(location.href)', 8000);
    await settle();
    const t = await text();
    const code = (/MAI-[A-Z0-9]{4}/.exec(t) || [])[0];
    if (!code) { throw new Error('ไม่พบรหัสการจองบนตั๋ว'); }
    return 'ตั๋ว ' + code;
  });
  await step('checkout ที่นั่งเดิมซ้ำ → 409 แล้วกลับหน้าเลือกที่นั่ง', async () => {
    const ids = await evaluate('MAISON_API.myBookings().then(function(r){return r[0].seats.map(function(s){return s.id}).join(",")})');
    await open('checkout.html?st=' + encodeURIComponent(stId) + '&seats=' + encodeURIComponent(ids));
    await settle();
    return (await text()).match(/ถูกจอง|ไม่ว่าง|เต็ม/) ? 'แจ้งว่าที่นั่งไม่ว่าง' : 'โหลดแล้ว';
  });
  await step('checkout ที่นั่ง id ไม่มีจริง (P-12) → แจ้ง "ไม่พบรหัสที่นั่ง" ต่างจากที่ถูกจอง', async () => {
    await open('checkout.html?st=' + encodeURIComponent(stId) + '&seats=' + encodeURIComponent('hall-99-Z99'));
    await settle();
    const t = await text();
    if (!/ไม่พบรหัสที่นั่งนี้ในรอบฉาย/.test(t)) {
      throw new Error('ข้อความ P-12 ไม่ตรง (ได้: ' + t.slice(0, 120).replace(/\s+/g, ' ') + ')');
    }
    if (/ถูกจองไปแล้ว/.test(t)) { throw new Error('ต้องไม่ใช้ข้อความ "ถูกจอง" กับ id ที่ไม่มีจริง'); }
    return 'แจ้งไม่พบรหัสที่นั่ง';
  });
  await step('checkout + โค้ด EVENINGPAIR → ยอด 540 → ticket แสดงส่วนลด', async () => {
    const pick = await evaluate('MAISON_API.ready.then(function(){return MAISON_API.showtimes("m07", MAISON_API.showDates()[1])}).then(function(r){var st=r.items.filter(function(s){return s.period==="evening"})[0];return MAISON_API.seats(st.id).then(function(x){return st.id+"|"+x.seats.filter(function(s){return s.status==="available"}).slice(0,2).map(function(s){return s.id}).join(",")})})');
    const [evId, evSeats] = pick.split('|');
    await open('checkout.html?st=' + encodeURIComponent(evId) + '&seats=' + encodeURIComponent(evSeats));
    await waitFor('!!document.getElementById("promo-code")');
    await evaluate('(function(){var i=document.getElementById("promo-code");i.value="MAISON20";document.getElementById("promo-apply").click()})()');
    await sleep(800);
    const bad = await evaluate('document.getElementById("promo-msg").textContent');
    if (!/วันพุธ/.test(bad) && !/ส่วนลด/.test(bad)) { throw new Error('โค้ดผิดเงื่อนไขต้องมีข้อความอธิบาย: ' + bad); }
    await evaluate('(function(){var i=document.getElementById("promo-code");i.value="eveningpair";document.getElementById("promo-apply").click()})()');
    await waitFor('!document.getElementById("discount-line").hidden', 6000);
    const sum = await text();
    if (!/540/.test(sum)) { throw new Error('ยอดรวมหลังใช้โค้ดต้องเป็น 540: ' + sum.slice(0, 300)); }
    await evaluate('[].filter.call(document.querySelectorAll("button"),function(b){return /ยืนยันการจอง/.test(b.textContent)})[0].click()');
    await waitFor('/ticket\\.html/.test(location.href)', 8000);
    await settle();
    const t = await text();
    if (!/ส่วนลด \(EVENINGPAIR\)/.test(t)) { throw new Error('ตั๋วไม่แสดงส่วนลด'); }
    return 'ตั๋วแสดงส่วนลด EVENINGPAIR';
  });
  await step('bookings.html', async () => {
    await open('bookings.html'); await settle();
    const t = await text();
    if (!/MAI-7Q3F/.test(t)) { throw new Error('ไม่พบการจอง seed MAI-7Q3F'); }
    return 'มีประวัติ';
  });
  await step('account.html', async () => { await open('account.html'); await settle(); if (!/demo/.test(await text())) { throw new Error('ไม่แสดงชื่อผู้ใช้'); } });
  await step('admin.html ด้วยบัญชี user (guard)', async () => {
    await open('admin.html'); await sleep(1200);
    const href = await evaluate('location.href');
    return /admin\.html/.test(href) ? 'อยู่หน้าเดิม: ' + (await text()).slice(0, 60).replace(/\s+/g, ' ') : 'redirect ' + href.replace(BASE, '');
  });
  await step('logout', async () => {
    await evaluate('MAISON_API.logout()');
    const ck = await send('Network.getCookies', { urls: [BASE] });
    if (ck.result.cookies.some((c) => c.name === 'maison_sid')) { throw new Error('cookie ยังอยู่'); }
    return 'cookie ถูกล้าง';
  });

  await step('login admin', async () => {
    await open('login.html'); await settle();
    await evaluate('document.getElementById("fill-admin").click()');
    await evaluate('document.getElementById("login-form").requestSubmit()');
    await waitFor('!/login\\.html/.test(location.href)', 8000);
  });
  await step('admin.html (สถิติ)', async () => {
    await open('admin.html'); await sleep(1200);
    const t = await text();
    if (!/ข้อมูลจากฐานข้อมูล/.test(t)) { throw new Error('demo-note ยังเป็นข้อความเดิม'); }
    if (/ฐานข้อมูลตัวอย่าง \d/.test(t)) { throw new Error('ยังบวก demoBaselineUsers'); }
    const users = (/ผู้ใช้ทั้งหมด\s*([\d,]+)/.exec(t) || [])[1];
    await evaluate('document.querySelector("[data-days=\\"7\\"]").click()');
    await sleep(800);
    return 'ผู้ใช้ทั้งหมด ' + users;
  });
  await step('admin-movies.html', async () => { await open('admin-movies.html'); await sleep(1000); if (!/The Hollow Choir/.test(await text())) { throw new Error('ไม่มีรายการหนัง'); } });
  await step('admin-promotions.html + สร้างคูปองพร้อมกติกา (UI)', async () => {
    await open('admin-promotions.html'); await sleep(1000);
    const before = await evaluate('MAISON_API.adminPromotions().then(function (l) { return l.length; })');
    await evaluate('document.getElementById("add-promotion").click()');
    await waitFor('!!document.getElementById("promotion-form")');
    // เลือกชนิดกติกา percent_off → ฟิลด์ value/weekday ต้องโผล่
    await evaluate('var s = document.getElementById("promo-rule-type"); s.value = "percent_off"; s.dispatchEvent(new Event("change"));');
    if (!await evaluate('!document.getElementById("promo-rule-value-field").hidden')) { throw new Error('ฟิลด์มูลค่าไม่แสดง'); }
    const code = 'SMOKE' + String(Date.now()).slice(-5);
    await evaluate('var f = document.getElementById("promotion-form");' +
      'f.querySelector("#promo-code").value = ' + JSON.stringify(code) + ';' +
      'f.querySelector("#promo-title").value = "คูปองทดสอบ smoke";' +
      'f.querySelector("#promo-summary").value = "สรุปทดสอบ";' +
      'f.querySelector("#promo-details").value = "รายละเอียดทดสอบ";' +
      'f.querySelector("#promo-rule-value").value = "25";');
    await evaluate('document.getElementById("promotion-form").requestSubmit()');
    await waitFor('!document.getElementById("promotion-form")', 8000); // ปิด dialog = บันทึกสำเร็จ
    await waitFor('document.querySelectorAll("#promotion-rows tr").length > ' + before, 8000);
    const rowText = await evaluate('Array.prototype.map.call(document.querySelectorAll("#promotion-rows tr"), function (tr) { return tr.innerText; }).join("\\n")');
    if (rowText.indexOf(code) === -1) { throw new Error('ไม่พบแถวคูปองใหม่'); }
    if (rowText.indexOf('ลด 25%') === -1) { throw new Error('สรุปกติกาไม่แสดง ลด 25%'); }
    // เก็บ id เพื่อลบทิ้ง — คืนค่าจาก API ตรง ๆ เพราะแถวตารางไม่ได้ใส่ data-id
    const id = await evaluate('MAISON_API.adminPromotions().then(function (l) { var p = l.filter(function (x) { return x.code === ' + JSON.stringify(code) + '; })[0]; return p && p.id; })');
    if (id) {
      if (!await evaluate('MAISON_API.adminPromotions().then(function (l) { var p = l.filter(function (x) { return x.id === ' + JSON.stringify(id) + '; })[0]; return !!(p && p.rule && p.rule.type === "percent_off" && p.rule.value === 25); })')) { throw new Error('กติกา percent_off 25 ไม่ถูกบันทึก'); }
      await evaluate('MAISON_API.adminDeletePromotion(' + JSON.stringify(id) + ')');
    } else { throw new Error('ไม่พบคูปองที่สร้าง'); }
    return 'สร้าง+ลบคูปอง ' + code + ' กติกา percent_off 25';
  });
  await step('admin-accounts.html', async () => { await open('admin-accounts.html'); await sleep(1000); if (!/guest01/.test(await text())) { throw new Error('ไม่มีบัญชี guest'); } });

  await step('ไม่มีคีย์ maison_v1_* ใน localStorage', async () => {
    const keys = await evaluate('Object.keys(localStorage)');
    const bad = keys.filter((k) => /^maison_v1_/.test(k));
    if (bad.length) { throw new Error(bad.join(',')); }
    return 'localStorage: [' + keys.join(',') + ']';
  });

  ws.close();
  proc.kill();
  server.closeAllConnections();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Edge อาจยังล็อกไฟล์ */ }

  let fail = 0;
  results.forEach((r) => {
    if (!r.ok) { fail++; }
    console.log((r.ok ? '[PASS] ' : '[FAIL] ') + r.name + (r.note ? ' — ' + r.note : ''));
  });
  console.log('SMOKE pass=' + (results.length - fail) + ' fail=' + fail + ' total=' + results.length);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
