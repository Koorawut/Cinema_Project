/* =============================================================
   MAISON Cinema — โรงฉาย / ช่วงเวลา / รอบฉาย (ย้ายจาก mock)
   ไม่มีตาราง showtimes: รอบคำนวณจากตารางฉายต่อเรื่อง
   (movies.hall_id + date_start..date_end + periods)
   รหัสรอบ: st-{movieId}-{YYYY-MM-DD}-{morning|afternoon|evening}
   รหัสที่นั่ง: {hallId}-{แถว}{เลข} เช่น hall-02-C7
   ============================================================= */
'use strict';

const { ApiError } = require('./http');
const { isISODate, startsAtISO } = require('./time');

const HALLS = [
  { id: 'hall-01', name: 'Hall 01', rows: ['A','B','C','D','E','F','G','H'], cols: 12 },
  { id: 'hall-02', name: 'Hall 02', rows: ['A','B','C','D','E','F','G','H'], cols: 12 }
];
const PERIODS = [
  { key: 'morning',   label: 'เช้า',     time: '10:30' },
  { key: 'afternoon', label: 'กลางวัน', time: '14:20' },
  { key: 'evening',   label: 'เย็น',     time: '19:00' }
];
const SERVICE_FEE = 30; // ค่าบริการต่อตั๋ว (นิยามยังรอยืนยัน: P-04)
const GENRES = ['Horror','Action','Comedy','Drama','Science Fiction','Romance','Thriller','Western'];
const SHOW_DAYS = 6;    // วันนี้ – วันที่ +5

/* ตารางฉายของหนัง seed (offset จากวันที่รัน seed) — ใช้โดย scripts/seed.js */
const SEED_SCHEDULE = {
  m01: { hallId: 'hall-01', periods: ['morning'],   from: 0, to: 3 },
  m02: { hallId: 'hall-01', periods: ['evening'],   from: 0, to: 5 },
  m05: { hallId: 'hall-01', periods: ['afternoon'], from: 0, to: 5 },
  m08: { hallId: 'hall-01', periods: ['morning'],   from: 4, to: 5 },
  m03: { hallId: 'hall-02', periods: ['afternoon'], from: 0, to: 2 },
  m04: { hallId: 'hall-02', periods: ['morning'],   from: 0, to: 5 },
  m06: { hallId: 'hall-02', periods: ['afternoon'], from: 3, to: 5 },
  m07: { hallId: 'hall-02', periods: ['evening'],   from: 0, to: 5 }
};

function hallById(id) { return HALLS.find((h) => h.id === id) || null; }
function periodByKey(key) { return PERIODS.find((p) => p.key === key) || null; }
function hallSize(hall) { return hall.rows.length * hall.cols; }
function periodLabels(periods) { return periods.map((p) => { const x = periodByKey(p); return x ? x.label : p; }); }

function showtimeId(movieId, dateISO, periodKey) { return 'st-' + movieId + '-' + dateISO + '-' + periodKey; }
function parseShowtimeId(stId) {
  const m = /^st-(m\d+)-(\d{4}-\d{2}-\d{2})-(morning|afternoon|evening)$/.exec(String(stId || ''));
  if (!m || !isISODate(m[2])) { return null; }
  return { movieId: m[1], date: m[2], period: m[3] };
}

function allSeats(hall) {
  const list = [];
  hall.rows.forEach((r) => {
    for (let n = 1; n <= hall.cols; n++) { list.push({ id: hall.id + '-' + r + n, row: r, number: n }); }
  });
  return list;
}

function dateInRange(movie, dateISO) {
  return !!(movie.dateStart && movie.dateEnd && dateISO >= movie.dateStart && dateISO <= movie.dateEnd);
}

/* รอบฉาย 1 รอบในรูปแบบเดียวกับ mock — คืน null เมื่อรอบไม่อยู่ในตาราง */
function buildShowtime(movie, dateISO, periodKey, bookedCount) {
  if (!movie || !movie.nowShowing || !dateInRange(movie, dateISO) || movie.periods.indexOf(periodKey) === -1) { return null; }
  const hall = hallById(movie.hallId);
  const period = periodByKey(periodKey);
  if (!hall || !period) { return null; }
  const total = hallSize(hall);
  const available = Math.max(0, total - (bookedCount || 0));
  return { id: showtimeId(movie.id, dateISO, periodKey), movieId: movie.id, hallId: hall.id, hall: hall.name,
    period: period.key, periodLabel: period.label, time: period.time,
    startsAt: startsAtISO(dateISO, period.time), date: dateISO,
    status: available > 0 ? 'available' : 'full', availableCount: available,
    totalSeats: total };
}

/* รหัสรอบทั้งหมดของหนังในวันหนึ่ง (เรียงตามลำดับช่วงเวลา) */
function showtimeIdsFor(movie, dateISO) {
  if (!movie.nowShowing || !dateInRange(movie, dateISO)) { return []; }
  return PERIODS.filter((p) => movie.periods.indexOf(p.key) !== -1).map((p) => showtimeId(movie.id, dateISO, p.key));
}

/* ตรวจ+normalize ตารางฉาย (การตรวจชนรอบต้องอ่าน DB — อยู่ที่ routes/admin.js) */
function normalizeSchedule(data) {
  if (!data.nowShowing) { return { hallId: '', dateStart: null, dateEnd: null, periods: [] }; }
  const hall = hallById(data.hallId);
  if (!hall) { throw new ApiError(422, 'กรุณาเลือกโรงฉาย'); }
  let periods = (Array.isArray(data.periods) ? data.periods : [data.periods]).filter(Boolean);
  periods = PERIODS.map((p) => p.key).filter((k) => periods.indexOf(k) !== -1);
  if (!periods.length) { throw new ApiError(422, 'กรุณาเลือกช่วงเวลาฉายอย่างน้อย 1 ช่วง'); }
  const start = String(data.dateStart || '').slice(0, 10);
  const end = String(data.dateEnd || '').slice(0, 10);
  if (!isISODate(start) || !isISODate(end)) {
    throw new ApiError(422, 'กรุณาระบุช่วงวันที่ฉายให้ครบถ้วน');
  }
  if (end < start) { throw new ApiError(422, 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มฉาย'); }
  return { hallId: hall.id, dateStart: start, dateEnd: end, periods: periods };
}

function publicHalls() { return HALLS.map((h) => ({ id: h.id, name: h.name, rows: h.rows.slice(), cols: h.cols })); }
function publicPeriods() { return PERIODS.map((p) => ({ key: p.key, label: p.label, time: p.time })); }

module.exports = {
  HALLS, PERIODS, SERVICE_FEE, GENRES, SHOW_DAYS, SEED_SCHEDULE,
  hallById, periodByKey, hallSize, periodLabels, showtimeId, parseShowtimeId, allSeats, dateInRange,
  buildShowtime, showtimeIdsFor, normalizeSchedule, publicHalls, publicPeriods
};
