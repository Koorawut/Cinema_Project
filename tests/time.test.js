/* =============================================================
   T5-U — unit test ของ server/time.js (วันที่ตามเขตเวลาไทย)
   รัน: npm run test:unit   (ผลต้องเหมือนกันไม่ว่าเครื่องตั้ง TZ อะไร)
   ============================================================= */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../server/time');

test('00:00–07:00 น. เวลาไทย = วันใหม่แล้ว แม้ UTC ยังเป็นเมื่อวาน (P-11)', () => {
  // 2026-10-14 17:30 UTC = 2026-10-15 00:30 น. เวลาไทย
  const now = new Date('2026-10-14T17:30:00Z');
  assert.equal(T.bangkokDate(now), '2026-10-15');
  assert.equal(T.todayISO(0, now), '2026-10-15');
  assert.equal(T.todayISO(-1, now), '2026-10-14');
  assert.equal(T.todayISO(5, now), '2026-10-20');
});

test('ก่อนเที่ยงคืนไทย 1 นาที ยังเป็นวันเดิม', () => {
  assert.equal(T.bangkokDate(new Date('2026-10-14T16:59:00Z')), '2026-10-14');
  assert.equal(T.bangkokDate(new Date('2026-10-14T17:00:00Z')), '2026-10-15');
});

test('addDays ข้ามเดือน/ปี/ปีอธิกสุรทิน', () => {
  assert.equal(T.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(T.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(T.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(T.addDays('2026-10-14', 0), '2026-10-14');
});

test('isISODate รับเฉพาะวันที่มีอยู่จริงในรูปแบบ YYYY-MM-DD', () => {
  assert.equal(T.isISODate('2026-10-14'), true);
  assert.equal(T.isISODate('2028-02-29'), true);
  assert.equal(T.isISODate('2026-02-29'), false);
  assert.equal(T.isISODate('2026-13-01'), false);
  assert.equal(T.isISODate('2026-1-01'), false);
  assert.equal(T.isISODate('14/10/2026'), false);
  assert.equal(T.isISODate(null), false);
});

test('toBangkokISO แปลง timestamptz เป็นเวลาไทย +07:00', () => {
  assert.equal(T.toBangkokISO(new Date('2026-10-14T12:00:00Z')), '2026-10-14T19:00:00+07:00');
  assert.equal(T.toBangkokISO('2026-10-14T17:30:00Z'), '2026-10-15T00:30:00+07:00');
  assert.equal(T.toBangkokISO('2026-10-14T19:00:00+07:00'), '2026-10-14T19:00:00+07:00');
  assert.equal(T.toBangkokISO(null), null);
  assert.equal(T.toBangkokISO('not a date'), null);
});

test('startsAtISO / dateOnly', () => {
  assert.equal(T.startsAtISO('2026-10-14', '14:20'), '2026-10-14T14:20:00+07:00');
  assert.equal(T.dateOnly(new Date('2026-10-14T00:00:00Z')), '2026-10-14');
  assert.equal(T.dateOnly('2026-10-14'), '2026-10-14');
  assert.equal(T.dateOnly(null), null);
});
