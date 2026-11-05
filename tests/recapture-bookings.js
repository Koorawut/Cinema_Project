/* แก้ภาพหลักฐานที่จับตอน spinner — จับใหม่เฉพาะ bookings (ทั้ง 2 viewport) โดยรอข้อมูลจริง */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'https://maison-cinema-bml9nmurz-ai-test-project1.vercel.app';
const OUT = path.join(__dirname, '..', 'evidence', 'v2.4');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maison-fix-'));
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) resolve(m[1]); });
    setTimeout(() => reject(new Error('browser ไม่ตอบ')), 20000);
  });
  const port = new URL(wsUrl).port;
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0; const waiting = {};
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; } });
  const send = (method, params) => new Promise((resolve) => { const id = ++seq; waiting[id] = resolve; ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) { throw new Error('eval: ' + JSON.stringify(r.result.exceptionDetails.exception).slice(0, 150)); }
    return r.result.result.value;
  };
  const open = async (p) => {
    await send('Page.navigate', { url: BASE + '/' + p });
    await sleep(400);
    for (let i = 0; i < 60; i++) { if (await evaluate('document.readyState === "complete"')) break; await sleep(150); }
    await sleep(600);
  };
  await send('Page.enable'); await send('Runtime.enable');

  for (const vp of [{ name: 'mobile', width: 390, height: 844, mobile: true }, { name: 'desktop', width: 1366, height: 768, mobile: false }]) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
    // login
    await open('login.html');
    await evaluate('(function(){document.getElementById("identifier").value="demo";document.getElementById("password").value="demo123";document.getElementById("remember").checked=false;document.getElementById("login-form").requestSubmit()})()');
    for (let i = 0; i < 60; i++) { await sleep(500); if (!/login\.html/.test(await evaluate('location.href'))) break; }
    // bookings — รอรายการจริง (MAI- หรือข้อความว่าง) ไม่ใช่ spinner
    await open('bookings.html');
    for (let i = 0; i < 50; i++) {
      const t = await evaluate('document.querySelector("main").innerText');
      if (/MAI-|ยังไม่มีการจอง|ไม่พบการจอง/.test(t) && !/กำลังโหลด|spinner/.test(t)) break;
      await sleep(400);
    }
    await sleep(500);
    let r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, vp.name + '-bookings.png'), Buffer.from(r.result.data, 'base64'));
    console.log('[OK] ' + vp.name + '-bookings.png');
    await evaluate('MAISON_API.logout()');
    await sleep(500);
  }
  ws.close(); proc.kill();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
