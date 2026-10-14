/* =============================================================
   MAISON Cinema — unit test ของ server/pricing.js (ฟังก์ชันบริสุทธิ์ ไม่ใช้ DB)
   รัน: node --test tests/pricing.test.js
   วันที่อ้างอิง: 2026-10-14 = วันพุธ, 2026-10-16 = วันศุกร์, 2026-10-17 = วันเสาร์
   ============================================================= */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { quote, weekdayOf } = require('../server/pricing');

const MAISON20 = { type: 'percent_off', value: 20, weekday: 3, timeFrom: null, timeTo: null, seatCount: null };
const EVENINGPAIR = { type: 'bundle_price', value: 480, weekday: null, timeFrom: '18:00', timeTo: null, seatCount: 2 };
const FRIDAY180 = { type: 'unit_price', value: 180, weekday: 5, timeFrom: null, timeTo: '15:00', seatCount: null };

function q(over) {
  return quote(Object.assign({ unit: 260, fee: 30, seatCount: 2, date: '2026-10-14', time: '19:00', promoCode: null, rule: null }, over));
}
function rejects(over, status, pattern) {
  assert.throws(() => q(over), (e) => e.status === status && pattern.test(e.message));
}

test('weekdayOf: คำนวณวันในสัปดาห์จากสตริงวันที่', () => {
  assert.equal(weekdayOf('2026-10-14'), 3);
  assert.equal(weekdayOf('2026-10-16'), 5);
  assert.equal(weekdayOf('2026-10-18'), 0);
});

test('ไม่ใช้โค้ด: ราคาปกติ ส่วนลด 0', () => {
  assert.deepEqual(q({}), { ticketSubtotal: 520, discount: 0, serviceFee: 60, total: 580, promoCode: null });
});

test('MAISON20: วันพุธ ลด 20% เฉพาะค่าตั๋ว ค่าบริการไม่ถูกลด', () => {
  assert.deepEqual(q({ promoCode: 'MAISON20', rule: MAISON20 }),
    { ticketSubtotal: 520, discount: 104, serviceFee: 60, total: 416 + 60, promoCode: 'MAISON20' });
});

test('MAISON20: ปัดเศษเป็นบาทเต็ม', () => {
  const r = q({ unit: 215, seatCount: 1, promoCode: 'MAISON20', rule: MAISON20 });
  assert.equal(r.discount, 43);
  assert.equal(r.total, 172 + 30);
});

test('MAISON20: ไม่ใช่วันพุธ → 422 บอกวันที่ใช้ได้', () => {
  rejects({ date: '2026-10-16', promoCode: 'MAISON20', rule: MAISON20 }, 422, /วันพุธ/);
});

test('EVENINGPAIR: 2 ที่นั่ง รอบ 18:00 ขึ้นไป ตั๋วรวม 480', () => {
  const r = q({ promoCode: 'EVENINGPAIR', rule: EVENINGPAIR, time: '19:00' });
  assert.deepEqual(r, { ticketSubtotal: 520, discount: 40, serviceFee: 60, total: 540, promoCode: 'EVENINGPAIR' });
  assert.equal(q({ promoCode: 'EVENINGPAIR', rule: EVENINGPAIR, time: '18:00' }).total, 540);
});

test('EVENINGPAIR: ก่อน 18:00 → 422', () => {
  rejects({ promoCode: 'EVENINGPAIR', rule: EVENINGPAIR, time: '14:20' }, 422, /18:00/);
});

test('EVENINGPAIR: ที่นั่งไม่ใช่ 2 → 422', () => {
  rejects({ promoCode: 'EVENINGPAIR', rule: EVENINGPAIR, seatCount: 1 }, 422, /พอดี 2 ที่นั่ง/);
  rejects({ promoCode: 'EVENINGPAIR', rule: EVENINGPAIR, seatCount: 3 }, 422, /พอดี 2 ที่นั่ง/);
});

test('EVENINGPAIR: ตั๋วคู่ไม่เกิน 480 → ไม่ทำให้ราคาถูกลง 422', () => {
  rejects({ unit: 240, promoCode: 'EVENINGPAIR', rule: EVENINGPAIR }, 422, /ไม่ทำให้ราคาถูกลง/);
  rejects({ unit: 200, promoCode: 'EVENINGPAIR', rule: EVENINGPAIR }, 422, /ไม่ทำให้ราคาถูกลง/);
});

test('FRIDAY180: วันศุกร์ก่อน 15:00 ที่นั่งละ 180', () => {
  const r = q({ seatCount: 3, date: '2026-10-16', time: '10:30', promoCode: 'FRIDAY180', rule: FRIDAY180 });
  assert.deepEqual(r, { ticketSubtotal: 780, discount: 240, serviceFee: 90, total: 540 + 90, promoCode: 'FRIDAY180' });
});

test('FRIDAY180: ผิดวัน / ตั้งแต่ 15:00 ขึ้นไป → 422', () => {
  rejects({ date: '2026-10-17', time: '10:30', promoCode: 'FRIDAY180', rule: FRIDAY180 }, 422, /วันศุกร์/);
  rejects({ date: '2026-10-16', time: '15:00', promoCode: 'FRIDAY180', rule: FRIDAY180 }, 422, /ก่อนเวลา 15:00/);
  rejects({ date: '2026-10-16', time: '19:00', promoCode: 'FRIDAY180', rule: FRIDAY180 }, 422, /ก่อนเวลา 15:00/);
});

test('FRIDAY180: ตั๋วราคา 180 หรือต่ำกว่า → ไม่ทำให้ราคาถูกลง 422', () => {
  rejects({ unit: 180, date: '2026-10-16', time: '10:30', promoCode: 'FRIDAY180', rule: FRIDAY180 }, 422, /ไม่ทำให้ราคาถูกลง/);
  rejects({ unit: 150, date: '2026-10-16', time: '10:30', promoCode: 'FRIDAY180', rule: FRIDAY180 }, 422, /ไม่ทำให้ราคาถูกลง/);
});

test('โค้ดที่ไม่มีกติกา (เช่นสร้างจากหน้า admin) → 422', () => {
  rejects({ promoCode: 'NEWCODE', rule: null }, 422, /ยังไม่เปิดให้คำนวณ/);
  rejects({ promoCode: 'NEWCODE', rule: { type: 'mystery', value: 1, weekday: null, timeFrom: null, timeTo: null, seatCount: null } }, 422, /ยังไม่เปิดให้คำนวณ/);
});
