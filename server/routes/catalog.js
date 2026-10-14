/* =============================================================
   /api/movies*, /api/showtimes/:id/seats (สาธารณะ ไม่ต้อง login)
   ============================================================= */
'use strict';

const db = require('../db');
const S = require('../schedule');
const M = require('../movies');
const { ApiError } = require('../http');
const { todayISO, addDays, isISODate } = require('../time');

function pickDate(v) { return isISODate(v) ? v : todayISO(0); }

/* GET /api/movies?search=&genre=&sort=&date= */
async function list(ctx) {
  const q = ctx.query;
  const date = pickDate(q.get('date'));
  const search = (q.get('search') || '').trim().toLowerCase();
  const genre = q.get('genre') || '';
  const movies = await M.listMovies('now_showing');
  const [byMovie, sold] = await Promise.all([
    M.showtimesByMovie(movies, date),
    db.query('SELECT b.movie_id, count(*)::int AS n FROM booking_seats s JOIN bookings b ON b.id = s.booking_id ' +
      'WHERE b.movie_id IS NOT NULL GROUP BY b.movie_id')
  ]);
  const soldMap = {};
  sold.forEach((r) => { soldMap[r.movie_id] = Number(r.n); });

  let items = movies.map((m) => {
    const hall = S.hallById(m.hallId);
    const sts = byMovie[m.id] || [];
    const availableCount = sts.filter((s) => s.status === 'available').length;
    return { id: m.id, title: m.title, genres: m.genres.slice(), price: m.price,
      durationMin: m.durationMin, ageRating: m.ageRating, poster: m.poster,
      synopsis: m.synopsis, director: m.director,
      hall: hall ? hall.name : null,
      dateStart: m.dateStart, dateEnd: m.dateEnd, periods: m.periods.slice(),
      status: sts.length ? (availableCount ? 'available' : 'full') : 'none',
      showtimeCount: sts.length, availableShowtimes: availableCount,
      ticketsSold: soldMap[m.id] || 0 };
  });
  if (search) { items = items.filter((m) => m.title.toLowerCase().indexOf(search) !== -1); }
  if (genre) { items = items.filter((m) => m.genres.indexOf(genre) !== -1); }
  const sort = q.get('sort') || 'popular';
  if (sort === 'title') { items.sort((a, b) => a.title.localeCompare(b.title)); }
  else if (sort === 'price-asc') { items.sort((a, b) => a.price - b.price); }
  else { items.sort((a, b) => b.ticketsSold - a.ticketsSold); }
  return { items, total: items.length, date };
}

/* GET /api/movies/coming-soon */
async function comingSoon() {
  const movies = await M.listMovies('NOT now_showing');
  return movies.map((m) => {
    const days = m.comingDays || 14;
    return { id: m.id, title: m.title, genres: m.genres.slice(), synopsis: m.synopsis,
      estimateDays: days, releaseDate: m.releaseDate || addDays(todayISO(0), days) };
  });
}

/* GET /api/movies/:id */
async function detail(ctx) {
  const m = await M.getMovie(ctx.params.id);
  if (!m) { throw new ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
  const hall = S.hallById(m.hallId);
  return { id: m.id, title: m.title, genres: m.genres.slice(), price: m.price,
    durationMin: m.durationMin, ageRating: m.ageRating, director: m.director,
    releaseDate: m.releaseDate, nowShowing: m.nowShowing, poster: m.poster, synopsis: m.synopsis,
    hall: m.nowShowing && hall ? hall.name : null,
    dateStart: m.dateStart, dateEnd: m.dateEnd,
    periods: m.periods.slice(), periodLabels: S.periodLabels(m.periods) };
}

/* GET /api/movies/:id/showtimes?date= */
async function showtimes(ctx) {
  const m = await M.getMovie(ctx.params.id);
  if (!m || !m.nowShowing) { throw new ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
  const date = pickDate(ctx.query.get('date'));
  const hall = S.hallById(m.hallId);
  const byMovie = await M.showtimesByMovie([m], date);
  return { movieId: m.id, date, hall: hall ? hall.name : null, price: m.price,
    dateStart: m.dateStart, dateEnd: m.dateEnd, items: byMovie[m.id] };
}

/* GET /api/showtimes/:id/seats */
async function seats(ctx) {
  const found = await M.getShowtime(ctx.params.id);
  if (!found) { throw new ApiError(404, 'ไม่พบรอบฉายนี้ (อาจถูกลบหรือหมดวันฉายแล้ว)'); }
  const { movie, showtime } = found;
  const hall = S.hallById(showtime.hallId);
  const rows = await db.query('SELECT seat_id FROM booking_seats WHERE showtime_id = $1', [showtime.id]);
  const taken = new Set(rows.map((r) => r.seat_id));
  return {
    showtime,
    movie: { id: movie.id, title: movie.title, price: movie.price, ageRating: movie.ageRating, poster: movie.poster },
    hall: { id: hall.id, name: hall.name },
    seats: S.allSeats(hall).map((s) => ({ id: s.id, row: s.row, number: s.number, label: s.row + s.number,
      status: taken.has(s.id) ? 'booked' : 'available' })),
    serviceFee: S.SERVICE_FEE
  };
}

module.exports = { list, comingSoon, detail, showtimes, seats };
