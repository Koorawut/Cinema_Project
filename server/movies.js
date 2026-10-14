/* =============================================================
   MAISON Cinema — อ่านข้อมูลหนัง/รอบฉายจาก DB (ใช้ร่วมหลาย route)
   ============================================================= */
'use strict';

const db = require('./db');
const S = require('./schedule');
const { dateOnly } = require('./time');

const MOVIE_COLS = 'id, title, genres, price, duration_min, age_rating, director, synopsis, release_date, ' +
  'now_showing, poster, coming_days, hall_id, date_start, date_end, periods';

function rowToMovie(r) {
  return {
    id: r.id, title: r.title, genres: r.genres || [], price: Number(r.price),
    durationMin: Number(r.duration_min) || 0, ageRating: r.age_rating, director: r.director,
    synopsis: r.synopsis, releaseDate: dateOnly(r.release_date), nowShowing: !!r.now_showing,
    poster: r.poster || '', comingDays: r.coming_days == null ? null : Number(r.coming_days),
    hallId: r.hall_id || '', dateStart: dateOnly(r.date_start), dateEnd: dateOnly(r.date_end),
    periods: r.periods || []
  };
}

async function listMovies(where) {
  const rows = await db.query('SELECT ' + MOVIE_COLS + ' FROM movies' + (where ? ' WHERE ' + where : '') + ' ORDER BY id');
  return rows.map(rowToMovie);
}
async function getMovie(id) {
  const r = await db.one('SELECT ' + MOVIE_COLS + ' FROM movies WHERE id = $1', [id]);
  return r ? rowToMovie(r) : null;
}

/* จำนวนที่นั่งที่ถูกจองต่อรอบ — query เดียว GROUP BY */
async function bookedCounts(showtimeIds) {
  const out = {};
  if (!showtimeIds.length) { return out; }
  const rows = await db.query(
    'SELECT showtime_id, count(*)::int AS n FROM booking_seats WHERE showtime_id = ANY($1::text[]) GROUP BY showtime_id',
    [showtimeIds]);
  rows.forEach((r) => { out[r.showtime_id] = Number(r.n); });
  return out;
}

/* รอบฉายทั้งหมดของหลายเรื่องในวันเดียว → { movieId: [showtime…] } */
async function showtimesByMovie(movies, dateISO) {
  const ids = [];
  movies.forEach((m) => { S.showtimeIdsFor(m, dateISO).forEach((id) => ids.push(id)); });
  const counts = await bookedCounts(ids);
  const out = {};
  movies.forEach((m) => {
    out[m.id] = S.showtimeIdsFor(m, dateISO).map((id) => {
      const p = S.parseShowtimeId(id);
      return S.buildShowtime(m, p.date, p.period, counts[id] || 0);
    }).filter(Boolean);
  });
  return out;
}

/* รอบฉายเดียวจากรหัส — null เมื่อรหัสผิดรูปแบบ/ไม่อยู่ในตาราง */
async function getShowtime(stId) {
  const p = S.parseShowtimeId(stId);
  if (!p) { return null; }
  const movie = await getMovie(p.movieId);
  if (!movie || !movie.nowShowing) { return null; }
  if (!S.buildShowtime(movie, p.date, p.period, 0)) { return null; }
  const counts = await bookedCounts([stId]);
  return { movie, showtime: S.buildShowtime(movie, p.date, p.period, counts[stId] || 0) };
}

module.exports = { MOVIE_COLS, rowToMovie, listMovies, getMovie, bookedCounts, showtimesByMovie, getShowtime };
