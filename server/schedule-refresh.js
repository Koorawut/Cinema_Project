/* =============================================================
   MAISON Cinema — เลื่อนตารางฉายหนัง seed ที่หมดวันแล้ว (cron รายวัน)
   ย้ายจาก scripts/seed.js — ใช้ร่วมกันระหว่าง seed --refresh-schedule
   กับ route GET /api/cron/refresh-schedule (Vercel Cron)
   - เลื่อนเฉพาะหนัง seed (id อยู่ใน SEED_SCHEDULE) ที่ date_end < วันนี้
     ให้กลับไปใช้ offset เดิมจากวันนี้ (เหมือนตอน seed) — idempotent:
     เลื่อนแล้ววันที่เริ่มที่วันนี้ รันซ้ำจึงไม่ทำอะไร
   - ถ้าเลื่อนแล้วชนโรง+ช่วงเวลากับหนังเรื่องอื่น (เงื่อนไขเดียวกับ
     assertNoClash ใน routes/admin.js) ให้ข้ามเรื่องนั้นแล้วรายงานเหตุผล
   - ไม่แตะการจองใดๆ (หนังที่หมดวันแล้วไม่มีรอบอนาคตให้กระทบ)
     และไม่แตะหนังที่ admin เพิ่มเอง (id ไม่อยู่ใน SEED_SCHEDULE)
   ============================================================= */
'use strict';

const db = require('./db');
const S = require('./schedule');
const { todayISO } = require('./time');

/* ตรวจชนรอบแบบเดียวกับ assertNoClash (routes/admin.js) — คืนชื่อหนังที่ชน หรือ null */
async function clashWith(sched, movieId) {
  return db.one(
    'SELECT title FROM movies WHERE id <> $1 AND now_showing AND hall_id = $2 AND date_start IS NOT NULL AND date_end IS NOT NULL ' +
    'AND date_start <= $4::date AND date_end >= $3::date AND periods && $5::text[] LIMIT 1',
    [movieId, sched.hallId, sched.dateStart, sched.dateEnd, sched.periods]);
}

/* คืน { moved: [{id, dateStart, dateEnd}], skipped: [{id, reason}] } */
async function refreshSchedule() {
  const today = todayISO(0);
  const moved = [];
  const skipped = [];
  const expired = {};
  (await db.query(
    'SELECT id FROM movies WHERE now_showing AND date_end IS NOT NULL AND date_end < $1::date', [today]))
    .forEach((r) => { expired[r.id] = true; });
  for (const id of Object.keys(S.SEED_SCHEDULE)) {
    if (!expired[id]) { continue; } // ยังไม่หมดวัน / ไม่ใช่หนัง seed / ไม่ฉายแล้ว
    const sch = S.SEED_SCHEDULE[id];
    const next = { hallId: sch.hallId, periods: sch.periods, dateStart: todayISO(sch.from), dateEnd: todayISO(sch.to) };
    const clash = await clashWith(next, id);
    if (clash) {
      skipped.push({ id: id, reason: 'ชนกับ ' + clash.title + ' ใน' + S.hallById(sch.hallId).name + ' (โรงเดียวกัน+ช่วงเวลาทับวันฉาย)' });
      continue;
    }
    await db.query('UPDATE movies SET hall_id = $2, periods = $3, date_start = $4, date_end = $5 WHERE id = $1 AND now_showing',
      [id, next.hallId, next.periods, next.dateStart, next.dateEnd]);
    moved.push({ id: id, dateStart: next.dateStart, dateEnd: next.dateEnd });
  }
  return { moved: moved, skipped: skipped };
}

module.exports = { refreshSchedule };
