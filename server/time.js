/* =============================================================
   MAISON Cinema — วันที่ตามเขตเวลาไทย (Asia/Bangkok)
   server ของ Vercel ใช้ UTC — ห้ามใช้ getDate()/setDate() ตรง ๆ
   (บัค P-11: ช่วง 00:00–07:00 น. วันที่ UTC ยังเป็นเมื่อวาน)
   ============================================================= */
'use strict';

const TZ = 'Asia/Bangkok';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/* วันที่ YYYY-MM-DD ของเวลา now ตามเขตเวลาไทย */
function bangkokDate(now) {
  return fmt.format(now || new Date());
}

/* บวก/ลบวันจากสตริง YYYY-MM-DD (คำนวณบน UTC ล้วน จึงไม่ขึ้นกับเขตเวลาเครื่อง) */
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (n || 0));
  return d.toISOString().slice(0, 10);
}

function todayISO(offsetDays, now) {
  return addDays(bangkokDate(now), offsetDays || 0);
}

function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) { return false; }
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

/* เวลาเริ่มฉายในรูปแบบเดียวกับ mock: 2026-10-14T19:00:00+07:00 */
function startsAtISO(dateISO, time) {
  return dateISO + 'T' + time + ':00+07:00';
}

/* timestamptz จาก DB → สตริงเวลาไทย 2026-10-14T19:00:00+07:00
   (หน้าเว็บตัด .slice(0,10) / .slice(11,16) ตรง ๆ จึงต้องเป็นเวลาท้องถิ่นไทยเสมอ) */
const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
function toBangkokISO(value) {
  if (value == null) { return null; }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) { return null; }
  const p = {};
  partsFmt.formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + '+07:00';
}

/* ค่าคอลัมน์ date → 'YYYY-MM-DD' (driver บางตัวคืนเป็น Date ที่เที่ยงคืน UTC) */
function dateOnly(value) {
  if (value == null) { return null; }
  if (value instanceof Date) { return isNaN(value) ? null : value.toISOString().slice(0, 10); }
  return String(value).slice(0, 10);
}

/* เวลาปัจจุบัน (ฉีดได้เพื่อทดสอบรอบที่เริ่มไปแล้ว — P-15):
   ลำดับ: setNow() ที่เทสต์ตั้ง → env MAISON_NOW (ยกเว้น production) → เวลาจริงของเครื่อง
   setNow() ใช้ได้ทุกสภาพแวดล้อมเพราะเทสต์ require โมดูลตรงๆ ส่วน env ปิดบน production
   เพื่อกันคนตั้ง MAISON_NOW แล้วเวลาระบบเพี้ยนจริง (A4 LOW-3) */
let testNow = null;
function setNow(value) { testNow = value == null ? null : new Date(value); }
function now() {
  if (testNow) { return new Date(testNow.getTime()); }
  const env = process.env.VERCEL_ENV === 'production' ? null : process.env.MAISON_NOW;
  if (env) {
    const d = new Date(env);
    if (!isNaN(d)) { return d; }
  }
  return new Date();
}

/* รอบเริ่มฉายไปแล้วหรือยัง — startsAt รูปแบบ 2026-10-14T19:00:00+07:00 (เทียบเป็น instant จึงไม่ขึ้นกับเขตเวลา) */
function isPast(startsAt) {
  const t = Date.parse(startsAt);
  return !isNaN(t) && now().getTime() >= t;
}

module.exports = { TZ, bangkokDate, addDays, todayISO, isISODate, startsAtISO, toBangkokISO, dateOnly,
  setNow, now, isPast };
