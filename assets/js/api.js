/* =============================================================
   MAISON Cinema — HTTP API client (v2)
   -------------------------------------------------------------
   interface เดียวกับ mock เดิม (assets/js/api-mock.js) ทุกเมธอด
   หน้า HTML จึงไม่ต้องแก้ — ต่างกันที่ข้อมูลทั้งหมดมาจาก server
   (Vercel Functions /api/* + Neon Postgres)

   - session อยู่ใน cookie HttpOnly `maison_sid` ที่ server ตั้งให้
     JavaScript อ่านไม่ได้ และไม่เก็บอะไรใน localStorage/sessionStorage
   - ready: โหลด /api/config ด้วย XMLHttpRequest + JSON.parse(responseText)
     (Rubrics ข้อ 10 Basic) ได้วันที่วันนี้ (เขตเวลาไทย) + ผู้ใช้ปัจจุบัน
   - ทุกคำขอที่แก้ข้อมูลส่ง Content-Type: application/json (server บังคับ — กัน CSRF)
   ============================================================= */
(function () {
  'use strict';

  var BASE = 'api';
  var NETWORK_MSG = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง';

  function ApiError(status, message, extra) {
    var e = new Error(message);
    e.name = 'ApiError';
    e.status = status;
    if (extra) { for (var k in extra) { if (k !== 'message') { e[k] = extra[k]; } } }
    return e;
  }

  /* สถานะฝั่ง client (ไม่ persist) */
  var state = { today: null, showDays: 6, user: null };

  /* วันที่วันนี้ตามเขตเวลาไทย — ใช้เมื่อโหลด config ไม่สำเร็จเท่านั้น */
  function localTodayISO() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date());
    } catch (e) {
      var d = new Date(Date.now() + 7 * 3600000);
      return d.toISOString().slice(0, 10);
    }
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') { return; }
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }
  function seg(v) { return encodeURIComponent(String(v == null ? '' : v)); }

  /* แปลงคำตอบ error ของ server { error: { message, ... } } เป็น ApiError */
  function toError(status, data) {
    var err = data && data.error;
    var msg = err && err.message ? err.message : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
    return ApiError(status, msg, err);
  }

  function request(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body || {});
    }
    return fetch(BASE + path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          if (res.status === 401) { state.user = null; } // session หมดอายุ/ถูกตัดจากที่อื่น
          throw toError(res.status, data);
        }
        if (data === null) { throw ApiError(res.status || 0, NETWORK_MSG); }
        return data;
      });
    }, function () {
      throw ApiError(0, NETWORK_MSG);
    });
  }

  /* bootstrap ด้วย XMLHttpRequest — resolve เสมอ (หน้าเว็บแสดงผลได้แม้ server ล่ม
     คำขอถัดไปจะแจ้ง error เครือข่ายเอง) */
  function loadConfig() {
    return new Promise(function (resolve) {
      function fallback() {
        state.today = state.today || localTodayISO();
        resolve();
      }
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', BASE + '/config', true);
        xhr.withCredentials = true;
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              var cfg = JSON.parse(xhr.responseText);
              state.today = cfg.today;
              state.showDays = cfg.showDays || state.showDays;
              state.user = cfg.user || null;
              if (Array.isArray(cfg.genres)) { API.genres = cfg.genres; }
              if (typeof cfg.serviceFee === 'number') { API.serviceFee = cfg.serviceFee; }
              if (Array.isArray(cfg.halls)) { API.halls = cfg.halls; }
              if (Array.isArray(cfg.periods)) { API.periods = cfg.periods; }
              resolve();
              return;
            } catch (e) { /* ใช้ค่าสำรอง */ }
          }
          fallback();
        };
        xhr.onerror = fallback;
        xhr.onabort = fallback;
        xhr.send();
      } catch (e) { fallback(); }
    });
  }

  function get(path) { return API.ready.then(function () { return request('GET', path); }); }
  function send(method, path, body) { return API.ready.then(function () { return request(method, path, body); }); }

  var API = {
    ApiError: ApiError,
    ready: null,
    mode: 'http',
    /* ค่าเริ่มต้นเหมือน mock — ถูกแทนด้วยค่าจาก /api/config เมื่อ ready */
    genres: ['Horror', 'Action', 'Comedy', 'Drama', 'Science Fiction', 'Romance', 'Thriller', 'Western'],
    serviceFee: 30,
    halls: [
      { id: 'hall-01', name: 'Hall 01', rows: ['A','B','C','D','E','F','G','H'], cols: 12 },
      { id: 'hall-02', name: 'Hall 02', rows: ['A','B','C','D','E','F','G','H'], cols: 12 }
    ],
    periods: [
      { key: 'morning', label: 'เช้า', time: '10:30' },
      { key: 'afternoon', label: 'กลางวัน', time: '14:20' },
      { key: 'evening', label: 'เย็น', time: '19:00' }
    ],

    /* POST /api/auth/register — สมัครแล้วยังไม่ login */
    register: function (data) { return send('POST', '/auth/register', data); },

    /* POST /api/auth/login — server ตั้ง cookie HttpOnly */
    login: function (data) {
      return send('POST', '/auth/login', {
        identifier: data.identifier, password: data.password, remember: !!data.remember
      }).then(function (out) { state.user = out.user || null; return out; });
    },

    /* POST /api/auth/logout — server ลบ session ใน DB และล้าง cookie */
    logout: function () {
      return send('POST', '/auth/logout', {}).then(function (out) { state.user = null; return out; },
        function (err) { state.user = null; throw err; });
    },

    /* GET /api/auth/me */
    me: function () {
      return get('/auth/me').then(function (out) { state.user = out.user || null; return out; });
    },

    /* POST /api/auth/change-password */
    changePassword: function (data) { return send('POST', '/auth/change-password', data); },

    /* GET /api/movies?search=&genre=&sort=&date= */
    movies: function (opts) {
      opts = opts || {};
      return get('/movies' + qs({ search: opts.search, genre: opts.genre, sort: opts.sort, date: opts.date }));
    },
    comingSoon: function () { return get('/movies/coming-soon'); },
    movie: function (id) { return get('/movies/' + seg(id)); },
    showtimes: function (movieId, date) { return get('/movies/' + seg(movieId) + '/showtimes' + qs({ date: date })); },
    seats: function (stId) { return get('/showtimes/' + seg(stId) + '/seats'); },

    /* POST /api/bookings — ราคาคำนวณที่ server (promoCode ไม่บังคับ); ที่นั่งชน → 409 + conflicts */
    createBooking: function (data) {
      return send('POST', '/bookings', { showtimeId: data.showtimeId, seatIds: data.seatIds, promoCode: data.promoCode || undefined });
    },
    myBookings: function () { return get('/me/bookings'); },

    promotions: function () { return get('/promotions'); },
    promotion: function (id) { return get('/promotions/' + seg(id)); },
    /* ส่ง showtimeId + seatIds ด้วยเพื่อให้ server คำนวณราคา (quote); ไม่ส่ง = ตรวจแค่รหัส */
    redeem: function (code, showtimeId, seatIds) {
      return send('POST', '/promotions/redeem', { code: code, showtimeId: showtimeId || undefined, seatIds: seatIds || undefined });
    },

    adminPromotions: function () { return get('/admin/promotions'); },
    adminCreatePromotion: function (data) { return send('POST', '/admin/promotions', data); },
    adminUpdatePromotion: function (id, data) { return send('PATCH', '/admin/promotions/' + seg(id), data); },
    adminDeletePromotion: function (id) { return send('DELETE', '/admin/promotions/' + seg(id), {}); },

    adminStats: function (opts) { return get('/admin/stats' + qs({ days: (opts || {}).days || 0 })); },

    adminUsers: function (opts) { return get('/admin/users' + qs({ search: (opts || {}).search })); },
    adminSetRole: function (userId, role) { return send('PATCH', '/admin/users/' + seg(userId) + '/role', { role: role }); },
    adminDeleteUser: function (userId) { return send('DELETE', '/admin/users/' + seg(userId), {}); },

    adminMovies: function (opts) { return get('/admin/movies' + qs({ search: (opts || {}).search })); },
    adminCreateMovie: function (data) { return send('POST', '/admin/movies', data); },
    adminUpdateMovie: function (id, data) { return send('PATCH', '/admin/movies/' + seg(id), data); },
    adminDeleteMovie: function (id) { return send('DELETE', '/admin/movies/' + seg(id), {}); },

    /* ผู้ใช้ปัจจุบันแบบ sync (จาก /api/config หรือการ login ล่าสุด) — สิทธิ์จริงตรวจที่ server */
    currentUser: function () { return state.user; },

    /* วันที่เปิดรอบฉาย (วันนี้ถึงอีก 5 วันข้างหน้า รวม 6 วัน) ตามวันที่ของ server */
    showDates: function () {
      var today = state.today || localTodayISO();
      var out = [];
      for (var i = 0; i < state.showDays; i++) { out.push(addDays(today, i)); }
      return out;
    }
  };

  API.ready = loadConfig();
  window.MAISON_API = API;
})();
