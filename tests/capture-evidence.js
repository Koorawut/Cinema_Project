/* =============================================================
   P-01: จับภาพหลักฐานรายหน้า (มือถือ 390×844 + เดสก์ท็อป 1366×768)
   รันกับ production จริง (อ่าน URL จาก argv) บนบัญชี demo:
     node tests/capture-evidence.js https://maison-cinema-<id>-ai-test-project1.vercel.app
   เขียนไฟล์: evidence/v2.4/<viewport>-<page>.png
   หน้าที่จับ: index, movies, movie, offers, login, register,
   seats, checkout, ticket, bookings, account, admin ×5 (login admin)
   ============================================================= */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2];
if (!BASE || !/^https?:\/\//.test(BASE)) {
  throw new Error('วิธีรัน: node tests/capture-evidence.js https://<deployment-url>');
}
const OUT = path.join(__dirname, '..', 'evidence', 'v2.4');
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(Boolean);

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1366, height: 768 }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) { throw new Error('ไม่พบ Edge/Chrome — ตั้ง BROWSER=path'); }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maison-evidence-'));
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
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting[msg.id]) { waiting[msg.id](msg); delete waiting[msg.id]; }
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
    throw new Error('timeout รอ: ' + expr);
  };
  const open = async (p) => {
    await send('Page.navigate', { url: BASE + '/' + p });
    await sleep(400);
    // รอ readyState แบบยืดหยุ่น (ไม่ throw — บางหน้าเช่น seats/ticket อาจยังโหลดข้อมูลต่อ)
    for (let i = 0; i < 60; i++) {
      if (await evaluate('document.readyState === "complete"')) { break; }
      await sleep(150);
    }
    await sleep(600);
  };

  await send('Page.enable');
  await send('Runtime.enable');

  // login ด้วยบัญชี demo ก่อน (กรอกฟอร์ม + submit เหมือนผู้ใช้จริง — cookie HttpOnly อยู่ใน profile นี้ตลอดรอบ)
  async function login(identifier, password) {
    await open('login.html');
    // รอ bootstrap ของหน้าให้เสร็จก่อน และรอจนกว่า navigation จะเกิดจริง (login สำเร็จ → index.html)
    // ใช้ลูปไม่จำกัดเวลาแบบตรวจ 2 เงื่อนไข: หน้าเปลี่ยน = สำเร็จ / form-error โผล่ = ล้มเหลว (throw)
    await evaluate('(function(){' +
      'document.getElementById("identifier").value=' + JSON.stringify(identifier) + ';' +
      'document.getElementById("password").value=' + JSON.stringify(password) + ';' +
      'document.getElementById("remember").checked=false;' +
      'document.getElementById("login-form").requestSubmit()})()');
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const state = await evaluate('(function(){' +
        'if (!/login\\.html/.test(location.href)) { return "ok"; }' +
        'var e = document.getElementById("form-error");' +
        'if (e && !e.hidden && e.textContent) { return "err:" + e.textContent; }' +
        'return "wait"; })()');
      if (state === 'ok') { break; }
      if (String(state).indexOf('err:') === 0) { throw new Error('login ล้มเหลว: ' + state.slice(4)); }
    }
    await sleep(700);
  }

  let shot = 0;
  async function capture(name) {
    const file = path.join(OUT, name + '.png');
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    shot++;
    console.log('[OK] ' + name + '.png');
  }

  for (const vp of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.name === 'mobile' });
    const n = vp.name;

    // กลุ่มไม่ login: index, movies, movie, offers, login, register
    await open('index.html');
    await waitFor('document.querySelectorAll("#top5-row > *").length > 0 || /soon|เร็ว ๆ นี้|ไม่มี/.test(document.body.innerText)');
    await capture(n + '-index');
    await open('movies.html');
    await waitFor('document.querySelectorAll("a[href*=\\"movie.html?id=\\"]").length > 0');
    await capture(n + '-movies');
    await open('movie.html?id=m02');
    await waitFor('document.querySelector("main") && document.querySelector("main").innerText.length > 50');
    await capture(n + '-movie-m02');
    await open('offers.html');
    await waitFor('document.querySelector("main") && document.querySelector("main").innerText.length > 50');
    await capture(n + '-offers');
    await open('login.html'); await capture(n + '-login');
    await open('register.html'); await capture(n + '-register');

    // login demo: seats, checkout, ticket, bookings, account
    await login('demo', 'demo123');
    // หารอบพรุ่งนี้ของ m04
    const st = await evaluate('MAISON_API.ready.then(function(){return MAISON_API.showtimes("m04", MAISON_API.showDates()[1])}).then(function(r){return r.items.length ? r.items[0].id : ""})');
    if (!st) { console.log('[WARN] ไม่มีรอบ m04 พรุ่งนี้ — ข้ามกลุ่ม seats/checkout/ticket'); }
    else {
      await open('seats.html?st=' + encodeURIComponent(st));
      await waitFor('document.querySelectorAll("button.seat").length > 0');
      await evaluate('var b=[].slice.call(document.querySelectorAll("button.seat:not([disabled])")).slice(-2);b.forEach(function(x){x.click()})');
      await capture(n + '-seats');
      const go = await evaluate('(document.querySelector("a[href*=\\"checkout.html\\"]")||{}).href||""');
      if (go) {
        await send('Page.navigate', { url: go });
        await waitFor('document.getElementById("promo-code") || document.body.innerText.length > 100');
        await sleep(600);
        await capture(n + '-checkout');
        await evaluate('var b=[].filter.call(document.querySelectorAll("button"),function(x){return /ยืนยันการจอง/.test(x.textContent)});if(b[0])b[0].click()');
        for (let i = 0; i < 40; i++) {
          await sleep(500);
          const state = await evaluate('(function(){' +
            'if (/ticket\\.html/.test(location.href)) { return "ok"; }' +
            'var e = document.getElementById("form-error") || document.querySelector(".error, .banner-error");' +
            'if (e && !e.hidden && e.textContent && /ไม่|ผิด|ล้มเหลว/.test(e.textContent)) { return "err:" + e.textContent; }' +
            'return "wait"; })()');
          if (state === 'ok') { break; }
          if (String(state).indexOf('err:') === 0) { console.log('[WARN] ยืนยันการจอง: ' + state.slice(4) + ' — ข้าม ticket'); break; }
        }
        await sleep(600);
        if (await evaluate('/ticket\\.html/.test(location.href)')) { await capture(n + '-ticket'); }
      }
    }
    await open('bookings.html');
    await waitFor('document.querySelector("main") && document.querySelector("main").innerText.length > 50');
    await capture(n + '-bookings');
    await open('account.html');
    await waitFor('document.querySelector("main") && document.querySelector("main").innerText.length > 30');
    await capture(n + '-account');
    // ออกจากระบบ → login admin สำหรับกลุ่ม admin
    await evaluate('MAISON_API.logout()');
    await sleep(600);
    await login('admin', 'admin123');
    for (const pg of ['admin.html', 'admin-movies.html', 'admin-promotions.html', 'admin-accounts.html']) {
      await open(pg);
      // admin หน้าอาจ redirect กลับ index ถ้า role ไม่ใช่ admin — จับตาม URL ปัจจุบันแทน (เก็บภาพตามที่เห็นจริง)
      for (let i = 0; i < 30; i++) {
        const t = await evaluate('document.querySelector("main") ? document.querySelector("main").innerText.length : 0');
        if (t > 50) { break; }
        await sleep(400);
      }
      await capture(n + '-' + pg.replace('.html', ''));
    }
    await evaluate('MAISON_API.logout()');
    await sleep(400);
  }

  ws.close();
  proc.kill();
  console.log('รวม ' + shot + ' ภาพ → ' + OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
