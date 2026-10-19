/* =============================================================
   MAISON Cinema — Mock API layer (v1)
   -------------------------------------------------------------
   จำลอง REST API ตามสัญญาใน cinema-frontend-plan.md (หัวข้อ 5)
   ทุกเมธอดคืน Promise เพื่อสลับเป็น backend จริงภายหลังได้โดย
   แก้เฉพาะชั้นนี้ โดยไม่ต้องแตะ DOM logic ของแต่ละหน้า
   (เมธอดแต่ละตัวระบุ endpoint อนาคตไว้ในคอมเมนต์เพื่อส่งต่อ backend)

   ข้อจำกัดที่ยอมรับไว้ชัดเจน (ระบบสาธิตเพื่อการเรียนรู้):
   - รหัสผ่านเก็บเป็น mock hash แบบง่าย ไม่ปลอดภัยจริง
     (backend จริงต้อง hash ด้วย bcrypt/argon2 พร้อม salt ฝั่ง server)
   - สิทธิ์ admin ตรวจเฉพาะฝั่ง client ไม่ใช่ความปลอดภัยจริง
   - ข้อมูลสถิติบางส่วนเป็นข้อมูลสาธิตที่สร้างแบบ deterministic
   ============================================================= */
(function () {
  'use strict';

  /* ---------- ค่าคงที่ของระบบสาธิต ---------- */
  var DB_KEY = 'maison_v1_db';
  var SESSION_KEY = 'maison_v1_session';      // sessionStorage
  var SESSION_FB_KEY = 'maison_v1_session_fb'; // localStorage — สำรอง session (P-10)
  var REMEMBER_KEY = 'maison_v1_remember';    // localStorage
  var SEED_VERSION = 5;
  /* โรงฉาย 2 หลัง — ผังเหมือนกันทุกหลัง (แถว A–H × 12 ที่นั่ง)
     id ของที่นั่งอยู่ในรูปแบบ {hallId}-{แถว}{เลข} เช่น hall-02-C7 */
  var HALLS = [
    { id: 'hall-01', name: 'Hall 01', rows: ['A','B','C','D','E','F','G','H'], cols: 12 },
    { id: 'hall-02', name: 'Hall 02', rows: ['A','B','C','D','E','F','G','H'], cols: 12 }
  ];
  /* ช่วงเวลาฉาย 3 ช่วงต่อวัน (v1.3): เช้า / กลางวัน / เย็น */
  var PERIODS = [
    { key: 'morning',   label: 'เช้า',     time: '10:30' },
    { key: 'afternoon', label: 'กลางวัน', time: '14:20' },
    { key: 'evening',   label: 'เย็น',     time: '19:00' }
  ];
  var SERVICE_FEE = 30; // ค่าบริการต่อตั๋ว (ตัวอย่างตามแบบ Figma — ยังไม่ยืนยันนิยามจริง: P-04)
  var GENRES = ['Horror','Action','Comedy','Drama','Science Fiction','Romance','Thriller','Western'];
  var SHOW_DAYS = 6; // หน้าต่างเปิดขายล่วงหน้า 6 วัน (วันนี้ – วันที่ +5)

  /* ---------- เครื่องมือภายใน ---------- */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function latency() { return sleep(120 + Math.floor(Math.random() * 220)); }

  function ApiError(status, message, extra) {
    var e = new Error(message);
    e.name = 'ApiError';
    e.status = status;
    if (extra) { for (var k in extra) { e[k] = extra[k]; } }
    return e;
  }
  function imageRef(value) {
    var v = String(value || '');
    if (!v) { return ''; }
    if (/^assets\/img\/[a-z0-9-]+\.(svg|png|jpg|jpeg|webp)$/i.test(v)) { return v; }
    var match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
    if (!match || match[2].length > 240000) { throw ApiError(422, 'ภาพต้องเป็น PNG, JPEG หรือ WebP ขนาดไม่เกิน 180 KB'); }
    var bytes;
    try { bytes = atob(match[2]); } catch (e) { throw ApiError(422, 'ไฟล์ภาพไม่ถูกต้อง'); }
    if (!bytes.length || bytes.length > 180000 ||
        (match[1] === 'png' && bytes.slice(0, 8) !== '\x89PNG\r\n\x1a\n') ||
        (match[1] === 'jpeg' && bytes.slice(0, 3) !== '\xff\xd8\xff') ||
        (match[1] === 'webp' && (bytes.slice(0, 4) !== 'RIFF' || bytes.slice(8, 12) !== 'WEBP'))) {
      throw ApiError(422, 'เนื้อหาไฟล์ภาพไม่ตรงกับชนิดภาพ');
    }
    return v;
  }
  function promotionCopy(p) {
    var copy = Object.assign({}, p); copy.terms = (p.terms || []).slice();
    copy.rule = p.rule ? Object.assign({}, p.rule) : null;
    return copy;
  }
  /* แบ่งหน้า opt-in (parity กับ server): ไม่ส่ง page = คืน array เดิมทั้งหมด
     ส่ง page = { items, page, limit, total, totalPages } — limit จำกัด 1–100 (default 20)
     page จำกัดบน 1e6 และหน้าเกินขอบเขตคืนหน้าสุดท้ายแทนลิสต์เปล่า (parity กับ server) */
  function paginate(items, opts) {
    opts = opts || {};
    if (opts.page == null || opts.page === '') { return items; }
    var reqPage = Math.min(1000000, Math.max(1, parseInt(opts.page, 10) || 1));
    var limit = Math.max(1, Math.min(100, parseInt(opts.limit, 10) || 20));
    var totalPages = Math.max(1, Math.ceil(items.length / limit));
    var page = Math.min(reqPage, totalPages);
    return { items: items.slice((page - 1) * limit, page * limit), page: page, limit: limit,
      total: items.length, totalPages: totalPages };
  }
  var WEEKDAYS_TH = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
  /* สำเนาตรรกะของ server/pricing.js quote() — ต้องแก้ให้ตรงกันทั้งสองที่ */
  function quotePrice(input) {
    var n = input.seatCount;
    var ticketSubtotal = input.unit * n, serviceFee = input.fee * n, rule = input.rule;
    if (!input.promoCode) {
      return { ticketSubtotal: ticketSubtotal, discount: 0, serviceFee: serviceFee, total: ticketSubtotal + serviceFee, promoCode: null };
    }
    if (!rule) { throw ApiError(422, 'โค้ดนี้ยังไม่เปิดให้คำนวณส่วนลด'); }
    if (rule.weekday != null && new Date(input.date + 'T00:00:00Z').getUTCDay() !== rule.weekday) {
      throw ApiError(422, 'โค้ดนี้ใช้ได้เฉพาะรอบฉาย' + WEEKDAYS_TH[rule.weekday]);
    }
    if (rule.timeFrom && input.time < rule.timeFrom) { throw ApiError(422, 'โค้ดนี้ใช้ได้กับรอบฉายเวลา ' + rule.timeFrom + ' น. ขึ้นไป'); }
    if (rule.timeTo && input.time >= rule.timeTo) { throw ApiError(422, 'โค้ดนี้ใช้ได้กับรอบฉายก่อนเวลา ' + rule.timeTo + ' น.'); }
    if (rule.seatCount != null && n !== rule.seatCount) { throw ApiError(422, 'โค้ดนี้ใช้ได้กับการจองพอดี ' + rule.seatCount + ' ที่นั่ง'); }
    var discounted;
    if (rule.type === 'percent_off') { discounted = Math.round(ticketSubtotal * (100 - rule.value) / 100); }
    else if (rule.type === 'bundle_price') { discounted = rule.value; }
    else if (rule.type === 'unit_price') { discounted = rule.value * n; }
    else { throw ApiError(422, 'โค้ดนี้ยังไม่เปิดให้คำนวณส่วนลด'); }
    var discount = ticketSubtotal - discounted;
    if (discount <= 0) { throw ApiError(422, 'โค้ดนี้ไม่ทำให้ราคาถูกลง'); }
    return { ticketSubtotal: ticketSubtotal, discount: discount, serviceFee: serviceFee, total: discounted + serviceFee, promoCode: input.promoCode };
  }
  function promotionByCode(raw) {
    var c = String(raw || '').trim().toUpperCase();
    return c ? db.promotions.filter(function (x) { return x.code === c; })[0] || null : null;
  }
  function promotionFields(data) {
    data = data || {};
    var code = String(data.code || '').trim().toUpperCase();
    var title = String(data.title || '').trim();
    var summary = String(data.summary || '').trim();
    var details = String(data.details || '').trim();
    var terms = data.terms;
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) { throw ApiError(422, 'รหัสต้องมี 3–24 ตัว ใช้ A–Z, 0–9 หรือขีดกลาง'); }
    if (!title || title.length > 100 || !summary || summary.length > 240 || !details || details.length > 1200 ||
        !Array.isArray(terms) || terms.length > 8 || terms.some(function (t) { return typeof t !== 'string' || t.length > 240; })) {
      throw ApiError(422, 'กรุณากรอกรายละเอียดคูปองให้ครบ และไม่เกินขนาดที่กำหนด');
    }
    return { code: code, title: title, summary: summary, details: details,
      terms: terms.map(function (t) { return t.trim(); }).filter(Boolean), image: imageRef(data.image) };
  }
  /* กติกาส่วนลด (parity กับ server/validate.js promotionRule) — null = ไม่มีกติกา */
  var RULE_TYPES = ['percent_off', 'bundle_price', 'unit_price'];
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  function optInt(v) {
    if (v == null || v === '') { return null; }
    var n = Number(v);
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n ? n : NaN;
  }
  function promotionRule(data) {
    var rule = (data || {}).rule;
    if (rule == null) { return null; }
    if (typeof rule !== 'object' || Array.isArray(rule)) { throw ApiError(422, 'รูปแบบกติกาส่วนลดไม่ถูกต้อง'); }
    var type = String(rule.type || '').trim();
    if (RULE_TYPES.indexOf(type) === -1) { throw ApiError(422, 'ชนิดกติกาส่วนลดไม่ถูกต้อง'); }
    var value = optInt(rule.value);
    if (value == null || isNaN(value)) { throw ApiError(422, 'กรุณาระบุมูลค่าของกติกาส่วนลดเป็นตัวเลข'); }
    if (type === 'percent_off' && (value < 1 || value > 99)) { throw ApiError(422, 'ส่วนลดต้องเป็นตัวเลข 1–99'); }
    if (type === 'bundle_price' && (value < 1 || value > 100000)) { throw ApiError(422, 'ราคากลุ่มต้องเป็นตัวเลข 1–100,000 บาท'); }
    if (type === 'unit_price' && (value < 1 || value > 5000)) { throw ApiError(422, 'ราคาต่อที่นั่งต้องเป็นตัวเลข 1–5,000 บาท'); }
    var weekday = optInt(rule.weekday);
    if (weekday != null && (weekday < 0 || weekday > 6)) { throw ApiError(422, 'วันในสัปดาห์ไม่ถูกต้อง'); }
    var seatCount = optInt(rule.seatCount);
    if (seatCount != null && (seatCount < 1 || seatCount > 99)) { throw ApiError(422, 'จำนวนที่นั่งต้องเป็นตัวเลข 1–99'); }
    var timeFrom = rule.timeFrom == null || rule.timeFrom === '' ? null : String(rule.timeFrom).trim();
    var timeTo = rule.timeTo == null || rule.timeTo === '' ? null : String(rule.timeTo).trim();
    if ((timeFrom && !TIME_RE.test(timeFrom)) || (timeTo && !TIME_RE.test(timeTo))) {
      throw ApiError(422, 'เวลาต้องอยู่ในรูปแบบ HH:MM (เช่น 18:00)');
    }
    if (timeFrom && timeTo && timeFrom >= timeTo) { throw ApiError(422, 'เวลาเริ่มต้องมาก่อนเวลาสิ้นสุด'); }
    return { type: type, value: value, weekday: weekday, timeFrom: timeFrom, timeTo: timeTo, seatCount: seatCount };
  }

  /* PRNG แบบ deterministic เพื่อให้ที่นั่งจองแล้วของ "ลูกค้าคนอื่น"
     คงที่ทุกครั้งที่โหลด (ไม่ต้องเก็บลง storage) */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* mock hash — ใช้เพื่อหลีกเลี่ยงการเก็บรหัสผ่านแบบข้อความเดียว
     ไม่ใช่การเข้ารหัสที่ปลอดภัยจริง (ดูหัวข้อข้อจำกัด) */
  function mockHash(pw) {
    var s = 'maison-demo-salt::' + pw;
    var h1 = 5381, h2 = 52711;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = (h1 * 33 ^ c) >>> 0;
      h2 = (h2 * 31 ^ c) >>> 0;
    }
    return 'mock$' + h1.toString(16) + h2.toString(16);
  }

  function todayISO(offsetDays) {
    var d = new Date();
    if (offsetDays) { d.setDate(d.getDate() + offsetDays); }
    return isoDateStr(d);
  }
  function nowISO() { return new Date().toISOString(); }
  /* รอบเริ่มฉายไปแล้วหรือยัง (parity กับ server/time.js isPast — P-15)
     startsAt อยู่ในรูปแบบ +07:00 เทียบเป็น instant จึงถูกต้องทุกเขตเวลา */
  function isPast(startsAt) {
    var t = Date.parse(startsAt);
    return !isNaN(t) && Date.now() >= t;
  }
  function isoDateStr(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- ข้อมูลสาธิต (สะท้อนชุดเดียวกับ assets/data/seed.json) ---------- */
  var SEED = {
    movies: [
      { id:'m01', title:'Iron Requiem', genres:['Action'], price:260, durationMin:128, ageRating:'ฉ 15+', director:'N. Kraivich', releaseDate:'2026-09-18', nowShowing:true, poster:'assets/img/poster-iron-requiem.svg', synopsis:'สายลับคนสุดท้ายของหน่วยต้องกลับมาปิดคดีเก่าที่ไม่เคยแคล้วคลาด ก่อนที่เมืองจะจ่ายราคาแทนเขา' },
      { id:'m02', title:'The Hollow Choir', genres:['Horror'], price:220, durationMin:104, ageRating:'ฉ 18+', director:'P. Sornthorn', releaseDate:'2026-09-25', nowShowing:true, poster:'assets/img/poster-the-hollow-choir.svg', synopsis:'บทเพลงสวดที่ดังขึ้นเองในโบสถ์ร้าง ไม่เคยตั้งใจให้ผู้ใดรอด และคืนนี้เพลงนั้นเลือกคนฟังเอง' },
      { id:'m03', title:'Bangkok Bank Run', genres:['Comedy'], price:200, durationMin:112, ageRating:'ฉ 13+', director:'K. Thamanat', releaseDate:'2026-10-02', nowShowing:true, poster:'assets/img/poster-bangkok-bank-run.svg', synopsis:'พนักงานธนาคารผู้พบว่าวันเงินเดือนออก คือวันที่ทุกอย่างในชีวิตเลือกพังพร้อมกันในครั้งเดียว' },
      { id:'m04', title:'Letters from Phuket', genres:['Drama'], price:240, durationMin:131, ageRating:'ฉ 13+', director:'S. Anongnard', releaseDate:'2026-09-11', nowShowing:true, poster:'assets/img/poster-letters-from-phuket.svg', synopsis:'จดหมายฉบับสุดท้ายที่ส่งไม่ถึง พาหญิงสาวกลับไปตามรอยฤดูร้อน และคำตอบที่รออยู่นานเกินไป' },
      { id:'m05', title:'Orbit 9', genres:['Science Fiction'], price:300, durationMin:142, ageRating:'ฉ 13+', director:'R. Ekworomadu', releaseDate:'2026-09-04', nowShowing:true, poster:'assets/img/poster-orbit-9.svg', synopsis:'สถานีวิจัยลำสุดท้ายของมนุษยชาติรับสัญญาณที่ไม่ควรมีใครได้ยิน และเวลาเหลือน้อยกว่าที่ใครคิด' },
      { id:'m06', title:'Two Rainy Seasons', genres:['Romance'], price:210, durationMin:118, ageRating:'ท น่าดู', director:'M. Charoenpok', releaseDate:'2026-09-27', nowShowing:true, poster:'assets/img/poster-two-rainy-seasons.svg', synopsis:'สองคน สองฤดูฝน และคำสัญญาเดียวที่ยังรอฝนกลับมาพิสูจน์ว่ามันเคยมีจริง' },
      { id:'m07', title:'Silent Verdict', genres:['Thriller'], price:250, durationMin:122, ageRating:'ฉ 15+', director:'T. Vipada', releaseDate:'2026-10-09', nowShowing:true, poster:'assets/img/poster-silent-verdict.svg', synopsis:'คณะลูกขุนต้องตัดสินคดีที่หลักฐานทุกชิ้นบอกคนละเรื่อง และหนึ่งในนั้นกำลังโกหก' },
      { id:'m08', title:'Dust and Ember', genres:['Western'], price:270, durationMin:136, ageRating:'ฉ 15+', director:'J. Calloway', releaseDate:'2026-08-28', nowShowing:true, poster:'assets/img/poster-dust-and-ember.svg', synopsis:'มือปืนชราออกเดินทางครั้งสุดท้าย เพื่อเผาข้อตกลงเก่าก่อนที่ไฟจะมาถึงตัวเขาเอง' },
      { id:'m09', title:'Neon Province', genres:['Science Fiction'], price:300, durationMin:0, ageRating:'ยังไม่ประกาศ', director:'A. Phanuwat', releaseDate:null, comingDays:10, nowShowing:false, poster:'', synopsis:'เมืองที่ความทรงจำถูกซื้อขายได้ กำลังจะได้เจอลูกค้าที่จ่ายด้วยอดีตของคนอื่น' },
      { id:'m10', title:'The Cartographer\u2019s Daughter', genres:['Drama'], price:230, durationMin:0, ageRating:'ยังไม่ประกาศ', director:'L. Benson', releaseDate:null, comingDays:17, nowShowing:false, poster:'', synopsis:'แผนที่ฉบับสุดท้ายของบิดา พาลูกสาวออกเดินทางไปยังดินแดนที่ไม่มีในแผนที่ใด' },
      { id:'m11', title:'Midnight Siamese', genres:['Thriller'], price:250, durationMin:0, ageRating:'ยังไม่ประกาศ', director:'W. Rattanaporn', releaseDate:null, comingDays:24, nowShowing:false, poster:'', synopsis:'แมวจริงของกรุงเทพฯ รู้ว่าใครลงมือในคืนที่ฝนไม่ตก และมันกำลังจะบอกคนผิด' }
    ],
    promotions: [
      { id:'p01', code:'MAISON20', title:'ส่วนลด 20% วันพุธสำหรับสมาชิก', image:'assets/img/promo-wednesday.svg',
        summary:'สมาชิก MAISON รับส่วนลด 20% ทุกที่นั่ง ทุกวันพุธ',
        details:'สมาชิก MAISON รับส่วนลด 20% จากราคาตั๋วปกติ ใช้ได้ทุกรอบฉายของวันพุธ ทั้งที่จองล่วงหน้าและซื้อหน้าโรง',
        terms:['ใช้ได้กับรอบฉายวันพุธ','ส่วนลดคิดจากค่าตั๋วเท่านั้น ไม่รวมค่าบริการ','ใช้ได้ 1 โค้ดต่อ 1 การจอง'],
        rule:{type:"percent_off",value:20,weekday:3,timeFrom:null,timeTo:null,seatCount:null} },
      { id:'p02', code:'EVENINGPAIR', title:'Evening Pair — คู่รักค่ำคืน', image:'assets/img/promo-evening-pair.svg',
        summary:'จับคู่รอบเย็น 2 ที่นั่งราคาพิเศษ พร้อมโพสต์คอร์น 1 ส่วน',
        details:'จอง 2 ที่นั่งในรอบ 18:00 ขึ้นไป รับราคาตั๋วพิเศษคู่ละ 480 บาท พร้อมป๊อปคอร์น 1 ส่วน',
        terms:['รอบฉาย 18:00 ขึ้นไป ทุกวัน','เลือกพอดี 2 ที่นั่ง (ไม่บังคับติดกัน)','ราคา 480 บาทคิดจากค่าตั๋ว ไม่รวมค่าบริการ','ใช้ได้ 1 โค้ดต่อ 1 การจอง'],
        rule:{type:"bundle_price",value:480,weekday:null,timeFrom:"18:00",timeTo:null,seatCount:2} },
      { id:'p03', code:'FRIDAY180', title:'First Show Fridays — รอบเช้าวันศุกร์', image:'assets/img/promo-first-show.svg',
        summary:'ทุกที่นั่งราคา 180 บาท สำหรับรอบก่อน 15:00 ของวันศุกร์',
        details:'เริ่มสัปดาห์ใหม่ด้วยภาพยนตร์เรื่องโปรด รอบก่อน 15:00 ของทุกวันศุกร์ ทุกที่นั่งราคาตั๋วเดียว 180 บาท',
        terms:['วันศุกร์เท่านั้น รอบก่อน 15:00','ราคาตั๋วที่นั่งละ 180 บาท ไม่รวมค่าบริการ','ใช้ได้ 1 โค้ดต่อ 1 การจอง ไม่ใช้ร่วมกับโค้ดอื่น'],
        rule:{type:"unit_price",value:180,weekday:5,timeFrom:null,timeTo:"15:00",seatCount:null} }
    ],
    users: [
      { id:'u-admin', username:'admin', email:'admin@maison.demo', passHash:'', role:'admin', createdAt:'2026-09-01T09:00:00+07:00' },
      { id:'u-demo', username:'demo', email:'demo@maison.demo', passHash:'', role:'user', createdAt:'2026-09-15T13:30:00+07:00' }
    ],
    demoPasswordHints: { admin:'admin123', demo:'demo123' } // ใช้ตอน seed เท่านั้น
  };

  /* ---------- ตารางฉายของข้อมูลสาธิต (v1.3) ----------
     หนังแต่ละเรื่องผูกกับ 1 โรง + ช่วงวันที่ (เลข offset จาก "วันนี้") + ช่วงเวลา
     วันที่เป็นค่าสัมพัทธ์กับวันปัจจุบัน จึงต้องคำนวณตอน runtime
     (seed.json เป็นไฟล์นิ่งจึงเก็บค่านี้ไม่ได้ — ตารางนี้เป็นแหล่งจริง)
     ออกแบบให้ไม่มีเรื่องใดชนช่วงเวลาเดียวกันในโรงเดียวกัน */
  var SEED_SCHEDULE = {
    m01: { hallId: 'hall-01', periods: ['morning'],                     from: 0, to: 3 },
    m02: { hallId: 'hall-01', periods: ['evening'],                     from: 0, to: 5 },
    m05: { hallId: 'hall-01', periods: ['afternoon'],                   from: 0, to: 5 },
    m08: { hallId: 'hall-01', periods: ['morning'],                     from: 4, to: 5 },
    m03: { hallId: 'hall-02', periods: ['afternoon'],                   from: 0, to: 2 },
    m04: { hallId: 'hall-02', periods: ['morning'],                     from: 0, to: 5 },
    m06: { hallId: 'hall-02', periods: ['afternoon'],                   from: 3, to: 5 },
    m07: { hallId: 'hall-02', periods: ['evening'],                     from: 0, to: 5 }
  };

  /* ---------- ที่เก็บข้อมูล (localStorage + fallback ใน memory) ---------- */
  var memoryDB = null;
  function storageGet(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { return memoryDB && key === DB_KEY ? memoryDB : null; }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
        throw ApiError(507, 'พื้นที่จัดเก็บในเบราว์เซอร์ไม่พอ กรุณาใช้ภาพขนาดเล็กลง');
      }
      if (key === DB_KEY) { memoryDB = val; }
    }
  }
  function storageDel(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    try { sessionStorage.removeItem(key); } catch (e) {}
  }

  /* ---------- session storage แบบทนทาน (แก้ P-10) ----------
     sessionStorage อาจถูกล้างเมื่อ host/iframe สร้าง browsing context ใหม่
     ทุกครั้งที่เปลี่ยนหน้า (พฤติกรรมของ preview แบบฝัง) ทำให้ถูกส่งกลับหน้า
     login ทั้งที่เข้าระบบแล้ว — จึงเขียน session ลง localStorage สำรองไว้ด้วย
     และอ่านกลับเมื่อ sessionStorage ว่าง (การออกจากระบบจะล้างทั้งสองที่) */
  function readStore(storeName, key) {
    try {
      var raw = window[storeName].getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeSession(sess) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess)); } catch (e) {}
    try { localStorage.setItem(SESSION_FB_KEY, JSON.stringify(sess)); } catch (e) {}
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(SESSION_FB_KEY); } catch (e) {}
  }

  var db = null; // { seedVersion, users, movies, promotions, bookings }

  function initDB(seed) {
    var existing = storageGet(DB_KEY);
    if (existing && existing.seedVersion === SEED_VERSION) { db = existing; return; }
    var users = (seed.users || SEED.users).map(function (u) {
      var copy = Object.assign({}, u);
      copy.passHash = copy.passHash || mockHash(SEED.demoPasswordHints[u.username]);
      return copy;
    });
    db = {
      seedVersion: SEED_VERSION,
      users: users,
      movies: (seed.movies || SEED.movies).map(function (m) { return hydrateMovie(m); }),
      promotions: (seed.promotions || SEED.promotions).map(function (p) {
        var copy = Object.assign({}, p); copy.terms = (p.terms || []).slice(); return copy;
      }),
      bookings: []
    };
    seedDemoBookings();
    saveDB();
  }
  function saveDB() { storageSet(DB_KEY, db); }

  /* กำหนดตารางฉาย (โรง / ช่วงวันที่ / ช่วงเวลา) ให้หนัง seed —
     หนังที่ไม่อยู่ใน SEED_SCHEDULE (เช่น จะฉาย) ไม่มีตารางฉาย */
  function hydrateMovie(m) {
    var copy = Object.assign({}, m);
    var sch = m.nowShowing ? SEED_SCHEDULE[m.id] : null;
    copy.hallId = sch ? sch.hallId : '';
    copy.dateStart = sch ? todayISO(sch.from) : null;
    copy.dateEnd = sch ? todayISO(sch.to) : null;
    copy.periods = sch ? sch.periods.slice() : [];
    return copy;
  }

  /* ประวัติจองสาธิตของบัญชี demo (เพื่อให้หน้า History/สถิติมีข้อมูลให้ดู) */
  function seedDemoBookings() {
    function mk(code, movieId, dateISO, periodKey, hallId, seatLabels, daysAgo) {
      var movie = db.movies.filter(function (m) { return m.id === movieId; })[0];
      var hall = hallById(hallId);
      var period = periodByKey(periodKey);
      var seats = seatLabels.map(function (lbl) {
        return { id: hallId + '-' + lbl, row: lbl.charAt(0), number: parseInt(lbl.slice(1), 10) };
      });
      var unit = movie.price, fee = SERVICE_FEE;
      var total = (unit + fee) * seats.length;
      var d = new Date(); d.setDate(d.getDate() - daysAgo);
      return { id:'b-' + code, code: code, userId:'u-demo', movieId: movieId, movieTitle: movie.title,
        showtimeId: 'st-' + movieId + '-' + dateISO + '-' + periodKey,
        startsAt: dateISO + 'T' + period.time + ':00+07:00', hall: hall.name,
        seats: seats, unitPrice: unit, serviceFee: fee, discount: 0, promoCode: null, total: total, status: 'confirmed',
        createdAt: d.toISOString() };
    }
    db.bookings.push(mk('MAI-7Q3F', 'm05', todayISO(-6), 'afternoon', 'hall-01', ['E7','E8'], 7));
    db.bookings.push(mk('MAI-2K8D', 'm03', todayISO(-13), 'afternoon', 'hall-02', ['C4'], 14));
  }

  /* โหลด seed จาก assets/data/seed.json ด้วย XMLHttpRequest — จัดการ responseText
     แบบ JSON ตาม Rubrics ข้อ 10 (ทำงานเมื่อเสิร์ฟผ่าน http) หากไม่สำเร็จ
     (เช่น เปิดไฟล์ตรง ๆ ผ่าน file://) ใช้ seed ที่ฝังไว้ในไฟล์นี้แทน */
  function loadSeedViaXHR() {
    return new Promise(function (resolve) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'assets/data/seed.json?v=' + SEED_VERSION, true);
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); return; } catch (e) {}
          }
          resolve(null);
        };
        xhr.onerror = function () { resolve(null); };
        xhr.onabort = xhr.onerror;
        xhr.send();
      } catch (e) { resolve(null); }
    });
  }
  var readyPromise = (function () {
    if (typeof XMLHttpRequest !== 'undefined') {
      return loadSeedViaXHR().then(function (seed) { initDB(seed || SEED); });
    }
    if (typeof fetch !== 'function') { initDB(SEED); return Promise.resolve(); }
    return fetch('assets/data/seed.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (seed) { initDB(seed || SEED); })
      .catch(function () { initDB(SEED); });
  })();

  /* ---------- รอบฉายและที่นั่ง (คำนวณแบบ deterministic) ----------
     รูปแบบรหัสรอบ: st-{movieId}-{วันที่ ISO}-{ช่วงเวลา}
     เช่น st-m02-2026-10-14-evening — โรงฉายดูจากตารางของหนังเรื่องนั้น */
  function hallById(hallId) {
    return HALLS.filter(function (h) { return h.id === hallId; })[0] || null;
  }
  function periodByKey(key) {
    return PERIODS.filter(function (p) { return p.key === key; })[0] || null;
  }
  function showtimeId(movieId, dateISO, periodKey) { return 'st-' + movieId + '-' + dateISO + '-' + periodKey; }
  function allSeats(hall) {
    var list = [];
    hall.rows.forEach(function (r) {
      for (var n = 1; n <= hall.cols; n++) { list.push({ id: hall.id + '-' + r + n, row: r, number: n }); }
    });
    return list;
  }
  /* ที่นั่งที่ "ลูกค้าคนอื่น" จองไว้ — คำนวณจาก hash ของ showtimeId
     ให้ผลเดิมทุกครั้ง รวมถึงกำหนดให้รอบเย็นของ The Hollow Choir วันนี้เต็ม */
  function seededOccupancy(stId, hall) {
    if (stId === showtimeId('m02', todayISO(0), 'evening')) {
      return allSeats(hall).map(function (s) { return s.id; });
    }
    var rnd = mulberry32(hashStr(stId));
    var target = 0.28 + rnd() * 0.42; // 28–70%
    var pool = allSeats(hall).map(function (s) { return s.id; });
    var count = Math.round(pool.length * target);
    // สุ่มแบบสลับตำแหน่ง (Fisher–Yates ด้วย PRNG เดียวกัน)
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, count);
  }
  function bookedSeatIds(stId, hall) {
    var ids = {};
    seededOccupancy(stId, hall).forEach(function (id) { ids[id] = true; });
    db.bookings.forEach(function (b) {
      if (b.showtimeId === stId) { b.seats.forEach(function (s) { ids[s.id] = true; }); }
    });
    return ids;
  }
  /* ตารางฉายของหนังครอบคลุมวันที่นี้หรือไม่ */
  function dateInRange(movie, dateISO) {
    return !!(movie.dateStart && movie.dateEnd && dateISO >= movie.dateStart && dateISO <= movie.dateEnd);
  }
  function getShowtime(stId) {
    var m = /^st-(m\d+)-(\d{4}-\d{2}-\d{2})-(morning|afternoon|evening)$/.exec(stId);
    if (!m) { return null; }
    var movie = db.movies.filter(function (x) { return x.id === m[1] && x.nowShowing; })[0];
    if (!movie || !dateInRange(movie, m[2]) || movie.periods.indexOf(m[3]) === -1) { return null; }
    var period = periodByKey(m[3]);
    var hall = hallById(movie.hallId);
    if (!hall) { return null; }
    var occupied = bookedSeatIds(stId, hall);
    var total = hall.rows.length * hall.cols;
    var available = total - Object.keys(occupied).length;
    return { id: stId, movieId: movie.id, hallId: hall.id, hall: hall.name,
      period: period.key, periodLabel: period.label, time: period.time,
      startsAt: m[2] + 'T' + period.time + ':00+07:00', date: m[2],
      status: available > 0 ? 'available' : 'full', availableCount: available,
      totalSeats: total };
  }
  /* รอบฉายทั้งหมดของหนังในวันที่กำหนด (ตามช่วงเวลาในตารางของเรื่องนั้น) */
  function movieShowtimes(movie, dateISO) {
    return movie.periods.map(function (p) { return getShowtime(showtimeId(movie.id, dateISO, p)); })
      .filter(Boolean);
  }

  /* ---------- session (mock) ---------- */
  function currentSession() {
    var s = readStore('sessionStorage', SESSION_KEY) || readStore('localStorage', SESSION_FB_KEY);
    if (s && s.userId) { return s; }
    var rem = storageGet(REMEMBER_KEY);
    if (rem && rem.userId) {
      var u = db.users.filter(function (x) { return x.id === rem.userId; })[0];
      if (u) {
        var sess = { userId: u.id, loginAt: nowISO(), remembered: true };
        writeSession(sess);
        return sess;
      }
    }
    return null;
  }
  function currentUser() {
    var s = currentSession();
    if (!s) { return null; }
    var u = db.users.filter(function (x) { return x.id === s.userId; })[0];
    if (!u) { return null; }
    return { id: u.id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt };
  }
  function requireUser() {
    var u = currentUser();
    if (!u) { throw ApiError(401, 'ต้องเข้าสู่ระบบก่อนใช้งานส่วนนี้'); }
    return u;
  }
  function requireAdmin() {
    var u = requireUser();
    if (u.role !== 'admin') { throw ApiError(403, 'ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น'); }
    return u;
  }

  /* ---------- สถิติสาธิต ----------
     สร้างประวัติ "ลูกค้ารายอื่น" ย้อนหลัง 30 วันแบบ deterministic
     เพื่อให้กราฟ/ตัวกรองช่วงเวลาทำงานได้ ทุกตัวเลขติดป้ายว่าเป็นข้อมูลสาธิต */
  function demoHistory() {
    var out = [];
    for (var d = 30; d >= 1; d--) {
      var dateISO = todayISO(-d);
      var rnd = mulberry32(hashStr('demo-day-' + dateISO));
      var n = 1 + Math.floor(rnd() * 4);
      var showing = db.movies.filter(function (m) { return m.nowShowing; });
      for (var i = 0; i < n && showing.length; i++) {
        var movie = showing[Math.floor(rnd() * showing.length)];
        var seats = 1 + Math.floor(rnd() * 3);
        var hh = 12 + Math.floor(rnd() * 10);
        var mm = ['00','15','30','45'][Math.floor(rnd() * 4)];
        out.push({ movieId: movie.id, movieTitle: movie.title, seats: seats,
          value: movie.price * seats, createdAt: dateISO + 'T' + (hh < 10 ? '0' + hh : hh) + ':' + mm + ':00+07:00' });
      }
    }
    return out;
  }
  function realBookingsView() {
    return db.bookings.map(function (b) {
      return { movieId: b.movieId, movieTitle: b.movieTitle, seats: b.seats.length, value: b.total, createdAt: b.createdAt };
    });
  }

    /* ---------- helper ตรวจตารางฉายสำหรับ admin ----------
       ตรวจ+normalize ข้อมูลตารางฉาย (โรง/ช่วงวันที่/ช่วงเวลา) ของหนังที่กำลังฉาย
       และป้องกันชนรอบ: ห้ามหนัง 2 เรื่องใช้โรงเดียวกัน+ช่วงเวลาเดียวกันในวันที่ซ้อนกัน */
    function normalizeSchedule(data, movieId) {
      if (!data.nowShowing) { return { hallId: '', dateStart: null, dateEnd: null, periods: [] }; }
      var hall = hallById(data.hallId);
      if (!hall) { throw ApiError(422, 'กรุณาเลือกโรงฉาย'); }
      var periods = (Array.isArray(data.periods) ? data.periods : [data.periods]).filter(Boolean);
      periods = PERIODS.map(function (p) { return p.key; }).filter(function (k) { return periods.indexOf(k) !== -1; });
      if (!periods.length) { throw ApiError(422, 'กรุณาเลือกช่วงเวลาฉายอย่างน้อย 1 ช่วง'); }
      var start = (data.dateStart || '').slice(0, 10);
      var end = (data.dateEnd || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        throw ApiError(422, 'กรุณาระบุช่วงวันที่ฉายให้ครบถ้วน');
      }
      if (end < start) { throw ApiError(422, 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มฉาย'); }
      // กติกาตรวจชน: เทียบกับหนังกำลังฉายเรื่องอื่นในโรงเดียวกัน
      var clash = db.movies.filter(function (m) {
        return m.id !== movieId && m.nowShowing && m.hallId === hall.id
          && m.dateStart && m.dateEnd && start <= m.dateEnd && end >= m.dateStart;
      }).some(function (m) {
        return m.periods.some(function (p) { return periods.indexOf(p) !== -1; });
      });
      if (clash) {
        throw ApiError(409, 'ตารางชนกับภาพยนตร์เรื่องอื่นใน' + hall.name
          + ' (โรงเดียวกัน+ช่วงเวลาทับวันฉาย) กรุณาเลือกโรง/ช่วงเวลา/ช่วงวันที่ใหม่');
      }
      return { hallId: hall.id, dateStart: start, dateEnd: end, periods: periods };
    }

    /* ============================================================
       Public API — ทุกเมธอดมีคอมเมนต์ endpoint ปลายทางตามแผนหัวข้อ 5
       ============================================================ */
  var API = {
    ApiError: ApiError,
    ready: readyPromise,
    mode: 'mock',
    genres: GENRES.slice(),
    serviceFee: SERVICE_FEE,
    halls: HALLS.map(function (h) { return { id: h.id, name: h.name, rows: h.rows.slice(), cols: h.cols }; }),
    periods: PERIODS.map(function (p) { return { key: p.key, label: p.label, time: p.time }; }),

    /* POST /auth/register */
    register: function (data) {
      return readyPromise.then(latency).then(function () {
        var username = (data.username || '').trim();
        var email = (data.email || '').trim().toLowerCase();
        var password = data.password || '';
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
          throw ApiError(422, 'ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ ตัวเลข หรือ _ ความยาว 3–20 ตัวอักษร');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { throw ApiError(422, 'รูปแบบอีเมลไม่ถูกต้อง'); }
        if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
          throw ApiError(422, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร และมีทั้งตัวอักษรกับตัวเลข');
        }
        if (password !== data.confirmPassword) { throw ApiError(422, 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'); }
        var dup = db.users.some(function (u) {
          return u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email;
        });
        if (dup) { throw ApiError(409, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้ไปแล้ว'); }
        var user = { id: 'u-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
          username: username, email: email, passHash: mockHash(password), role: 'user', createdAt: nowISO() };
        db.users.push(user); saveDB();
        return { user: { id: user.id, username: user.username, email: user.email, role: user.role, createdAt: user.createdAt } };
      });
    },

    /* POST /auth/login — identifier รับได้ทั้ง username และ email */
    login: function (data) {
      return readyPromise.then(latency).then(function () {
        var idf = (data.identifier || '').trim().toLowerCase();
        var u = db.users.filter(function (x) {
          return x.username.toLowerCase() === idf || x.email.toLowerCase() === idf;
        })[0];
        if (!u || u.passHash !== mockHash(data.password || '')) {
          throw ApiError(401, 'ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง');
        }
        var sess = { userId: u.id, loginAt: nowISO() };
        writeSession(sess);
        if (data.remember) {
          storageSet(REMEMBER_KEY, { userId: u.id, token: 'mock-' + hashStr(u.id + u.passHash).toString(36), at: nowISO() });
          try { document.cookie = 'maison_remember=1; max-age=2592000; path=/'; } catch (e) {}
        }
        return { user: { id: u.id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt } };
      });
    },

    /* POST /auth/logout */
    logout: function () {
      return readyPromise.then(latency).then(function () {
        clearSession();
        try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
        try { document.cookie = 'maison_remember=; max-age=0; path=/'; } catch (e) {}
        return { ok: true };
      });
    },

    /* GET /auth/me */
    me: function () {
      return readyPromise.then(latency).then(function () {
        var u = currentUser();
        if (!u) { throw ApiError(401, 'ยังไม่ได้เข้าสู่ระบบ'); }
        return { user: u };
      });
    },

    /* POST /auth/change-password */
    changePassword: function (data) {
      return readyPromise.then(latency).then(function () {
        var u = requireUser();
        var row = db.users.filter(function (x) { return x.id === u.id; })[0];
        if (row.passHash !== mockHash(data.currentPassword || '')) {
          throw ApiError(401, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }
        if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(data.newPassword || '')) {
          throw ApiError(422, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร และมีทั้งตัวอักษรกับตัวเลข');
        }
        if (data.newPassword !== data.confirmPassword) { throw ApiError(422, 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'); }
        if (mockHash(data.newPassword) === row.passHash) {
          throw ApiError(422, 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน');
        }
        row.passHash = mockHash(data.newPassword); saveDB();
        return { ok: true };
      });
    },

    /* GET /movies?search=&genre=&sort=&date= — ค้นหา+กรองแนวทำร่วมกันได้ */
    movies: function (opts) {
      opts = opts || {};
      return readyPromise.then(latency).then(function () {
        var date = opts.date || todayISO(0);
        var q = (opts.search || '').trim().toLowerCase();
        var genre = opts.genre || '';
        var items = db.movies.filter(function (m) { return m.nowShowing; }).map(function (m) {
          var hall = hallById(m.hallId);
          var sts = movieShowtimes(m, date);
          var anyAvailable = sts.some(function (s) { return s.status === 'available'; });
          var ticketsSold = demoHistory().concat(realBookingsView())
            .filter(function (b) { return b.movieId === m.id; })
            .reduce(function (a, b) { return a + b.seats; }, 0);
          return { id: m.id, title: m.title, genres: m.genres.slice(), price: m.price,
            durationMin: m.durationMin, ageRating: m.ageRating, poster: m.poster,
            synopsis: m.synopsis, director: m.director,
            hall: hall ? hall.name : null,
            dateStart: m.dateStart, dateEnd: m.dateEnd, periods: m.periods.slice(),
            status: sts.length ? (anyAvailable ? 'available' : 'full') : 'none',
            showtimeCount: sts.length, availableShowtimes: sts.filter(function (s) { return s.status === 'available'; }).length,
            ticketsSold: ticketsSold };
        });
        if (q) { items = items.filter(function (m) { return m.title.toLowerCase().indexOf(q) !== -1; }); }
        if (genre) { items = items.filter(function (m) { return m.genres.indexOf(genre) !== -1; }); }
        var sort = opts.sort || 'popular';
        if (sort === 'title') { items.sort(function (a, b) { return a.title.localeCompare(b.title); }); }
        else if (sort === 'price-asc') { items.sort(function (a, b) { return a.price - b.price; }); }
        else { items.sort(function (a, b) { return b.ticketsSold - a.ticketsSold; }); }
        return { items: items, total: items.length, date: date };
      });
    },

    /* หนังที่กำลังจะฉาย (สำหรับหน้าแรก) */
    comingSoon: function () {
      return readyPromise.then(latency).then(function () {
        return db.movies.filter(function (m) { return !m.nowShowing; }).map(function (m) {
          var d = new Date(); d.setDate(d.getDate() + (m.comingDays || 14));
          return { id: m.id, title: m.title, genres: m.genres.slice(), synopsis: m.synopsis,
            estimateDays: m.comingDays || 14, releaseDate: isoDateStr(d) };
        });
      });
    },

    /* GET /movies/:id */
    movie: function (id) {
      return readyPromise.then(latency).then(function () {
        var m = db.movies.filter(function (x) { return x.id === id; })[0];
        if (!m) { throw ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
        var hall = hallById(m.hallId);
        return { id: m.id, title: m.title, genres: m.genres.slice(), price: m.price,
          durationMin: m.durationMin, ageRating: m.ageRating, director: m.director,
          releaseDate: m.releaseDate, nowShowing: m.nowShowing, poster: m.poster, synopsis: m.synopsis,
          hall: m.nowShowing && hall ? hall.name : null,
          dateStart: m.dateStart, dateEnd: m.dateEnd,
          periods: m.periods.slice(),
          periodLabels: m.periods.map(function (p) { var x = periodByKey(p); return x ? x.label : p; }) };
      });
    },

    /* GET /movies/:id/showtimes?date= */
    showtimes: function (movieId, date) {
      return readyPromise.then(latency).then(function () {
        var m = db.movies.filter(function (x) { return x.id === movieId && x.nowShowing; })[0];
        if (!m) { throw ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
        var dateISO = date || todayISO(0);
        var hall = hallById(m.hallId);
        return { movieId: movieId, date: dateISO, hall: hall ? hall.name : null, price: m.price,
          dateStart: m.dateStart, dateEnd: m.dateEnd,
          items: movieShowtimes(m, dateISO) };
      });
    },

    /* GET /showtimes/:id/seats */
    seats: function (stId) {
      return readyPromise.then(latency).then(function () {
        var st = getShowtime(stId);
        if (!st) { throw ApiError(404, 'ไม่พบรอบฉายนี้ (อาจถูกลบหรือหมดวันฉายแล้ว)'); }
        var m = db.movies.filter(function (x) { return x.id === st.movieId; })[0];
        var hall = hallById(st.hallId);
        var occupied = bookedSeatIds(stId, hall);
        var seats = allSeats(hall).map(function (s) {
          return { id: s.id, row: s.row, number: s.number, label: s.row + s.number,
            status: occupied[s.id] ? 'booked' : 'available' };
        });
        return { showtime: st, movie: { id: m.id, title: m.title, price: m.price, ageRating: m.ageRating, poster: m.poster },
          hall: { id: hall.id, name: hall.name }, seats: seats, serviceFee: SERVICE_FEE };
      });
    },

    /* POST /bookings — ตรวจที่นั่งซ้ำแบบ atomic ก่อนยืนยัน (จำลอง 409) */
    createBooking: function (data) {
      return readyPromise.then(latency).then(function () {
        var u = requireUser();
        var st = getShowtime(data.showtimeId);
        if (!st) { throw ApiError(404, 'ไม่พบรอบฉายนี้'); }
        if (isPast(st.startsAt)) { throw ApiError(422, 'รอบนี้เริ่มฉายไปแล้ว ไม่สามารถจองได้ กรุณาเลือกรอบอื่น'); }
        if (st.status === 'full') { throw ApiError(409, 'รอบฉายนี้เต็มแล้ว กรุณาเลือกรอบอื่น'); }
        var occupied = bookedSeatIds(data.showtimeId, hallById(st.hallId));
        var wanted = Array.isArray(data.seatIds) ? data.seatIds : [];
        if (!wanted.length) { throw ApiError(422, 'กรุณาเลือกที่นั่งอย่างน้อย 1 ที่นั่ง'); }
        var validIds = {};
        allSeats(hallById(st.hallId)).forEach(function (s) { validIds[s.id] = true; });
        var invalid = wanted.filter(function (id) { return !validIds[id]; });
        if (invalid.length) {
          throw ApiError(422, 'รหัสที่นั่งไม่ถูกต้อง: ' + invalid.join(', '));
        }
        var conflicts = wanted.filter(function (id) { return occupied[id]; });
        if (conflicts.length) {
          throw ApiError(409, 'ที่นั่งที่เลือกถูกจองไปแล้ว: ' + conflicts.join(', '), { conflicts: conflicts });
        }
        var m = db.movies.filter(function (x) { return x.id === st.movieId; })[0];
        var seats = wanted.map(function (id) {
          var lbl = id.slice(st.hallId.length + 1); // ตัด prefix ของโรง เช่น hall-02-C7 → C7
          return { id: id, row: lbl.charAt(0), number: parseInt(lbl.slice(1), 10) };
        }).sort(function (a, b) { return a.row === b.row ? a.number - b.number : (a.row < b.row ? -1 : 1); });
        var rawCode = String(data.promoCode || '').trim();
        var promo = null;
        if (rawCode) {
          promo = promotionByCode(rawCode);
          if (!promo) { throw ApiError(404, 'ไม่พบรหัสโปรโมชันนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง'); }
        }
        var q = quotePrice({ unit: m.price, fee: SERVICE_FEE, seatCount: seats.length, date: st.date, time: st.time,
          promoCode: promo ? promo.code : null, rule: promo ? promo.rule : null });
        var code = 'MAI-' + hashStr(u.id + st.id + wanted.join(',')).toString(36).toUpperCase().slice(0, 4).padEnd(4, 'X');
        var booking = { id: 'b-' + Date.now().toString(36), code: code, userId: u.id,
          movieId: m.id, movieTitle: m.title, showtimeId: st.id, startsAt: st.startsAt, hall: st.hall,
          seats: seats, unitPrice: m.price, serviceFee: SERVICE_FEE, discount: q.discount, promoCode: q.promoCode,
          total: q.total, status: 'confirmed', createdAt: nowISO() };
        db.bookings.push(booking); saveDB();
        return { booking: booking };
      });
    },

    /* GET /me/bookings — ดึงจากตัวตนใน session เท่านั้น
       ส่ง { page } มา = แบ่งหน้าแบบเดียวกับ server (parity) ไม่ส่ง = array ทั้งหมด */
    myBookings: function (opts) {
      opts = opts || {};
      return readyPromise.then(latency).then(function () {
        var u = requireUser();
        var items = db.bookings.filter(function (b) { return b.userId === u.id; })
          .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0); });
        return paginate(items, opts);
      });
    },

    /* GET /promotions, GET /promotions/:id */
    promotions: function () {
      return readyPromise.then(latency).then(function () {
        return db.promotions.map(function (p) {
          return promotionCopy(p);
        });
      });
    },
    promotion: function (id) {
      return readyPromise.then(latency).then(function () {
        var p = db.promotions.filter(function (x) { return x.id === id; })[0];
        if (!p) { throw ApiError(404, 'ไม่พบโปรโมชันนี้'); }
        return promotionCopy(p);
      });
    },

    /* POST /promotions/redeem (mock) — ส่ง showtimeId + seatIds มาด้วยจะได้ quote; ไม่ส่งตรวจแค่รหัส */
    redeem: function (code, showtimeId, seatIds) {
      return readyPromise.then(latency).then(function () {
        var p = promotionByCode(code);
        if (!p) { throw ApiError(404, 'ไม่พบรหัสโปรโมชันนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง'); }
        if (!showtimeId) {
          return { valid: true, promotion: promotionCopy(p), note: 'ตรวจรหัสสำเร็จ ส่วนลดจะคำนวณในหน้ายืนยันการจอง' };
        }
        var st = getShowtime(showtimeId);
        if (!st) { throw ApiError(404, 'ไม่พบรอบฉายนี้'); }
        var ids = Array.isArray(seatIds) ? seatIds.filter(function (id, i, a) { return a.indexOf(id) === i; }) : [];
        if (!ids.length) { throw ApiError(422, 'กรุณาเลือกที่นั่งอย่างน้อย 1 ที่นั่ง'); }
        var m = db.movies.filter(function (x) { return x.id === st.movieId; })[0];
        /* P-19 (parity กับ server): รอบที่เริ่มฉายไปแล้วไม่ให้คำนวณส่วนลด */
        if (isPast(st.startsAt)) { throw ApiError(422, 'รอบนี้เริ่มฉายไปแล้ว ไม่สามารถใช้โค้ดส่วนลดได้ กรุณาเลือกรอบอื่น'); }
        var quote = quotePrice({ unit: m.price, fee: SERVICE_FEE, seatCount: ids.length, date: st.date, time: st.time,
          promoCode: p.code, rule: p.rule });
        return { valid: true, promotion: promotionCopy(p), quote: quote };
      });
    },

    /* GET/POST/PATCH/DELETE /admin/promotions — ข้อมูล mock ใช้ร่วมกับหน้าสาธารณะ */
    adminPromotions: function () {
      return readyPromise.then(latency).then(function () { requireAdmin(); return db.promotions.map(promotionCopy); });
    },
    adminCreatePromotion: function (data) {
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        var fields = promotionFields(data);
        var rule = promotionRule(data); // null = ไม่มีกติกา (โค้ดโชว์อย่างเดียว)
        if (db.promotions.some(function (p) { return p.code === fields.code; })) { throw ApiError(409, 'รหัสคูปองนี้มีอยู่แล้ว'); }
        var id = 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        var item = Object.assign({ id: id, rule: rule }, fields);
        db.promotions.push(item);
        try { saveDB(); } catch (e) { db.promotions.pop(); throw e; }
        return promotionCopy(item);
      });
    },
    adminUpdatePromotion: function (id, data) {
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        var item = db.promotions.filter(function (p) { return p.id === id; })[0];
        if (!item) { throw ApiError(404, 'ไม่พบคูปองนี้'); }
        var merged = Object.assign({}, item, data);
        var fields = promotionFields(merged);
        var rule = promotionRule(merged); // merged.rule = กติกาเดิมเมื่อ request ไม่ส่ง rule มา
        if (db.promotions.some(function (p) { return p.id !== id && p.code === fields.code; })) { throw ApiError(409, 'รหัสคูปองนี้มีอยู่แล้ว'); }
        var previous = promotionCopy(item);
        Object.assign(item, fields);
        item.rule = rule;
        try { saveDB(); } catch (e) { Object.assign(item, previous); item.rule = previous.rule; throw e; }
        return promotionCopy(item);
      });
    },
    adminDeletePromotion: function (id) {
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        if (!db.promotions.some(function (p) { return p.id === id; })) { throw ApiError(404, 'ไม่พบคูปองนี้'); }
        var previous = db.promotions;
        db.promotions = previous.filter(function (p) { return p.id !== id; });
        try { saveDB(); } catch (e) { db.promotions = previous; throw e; }
        return { ok: true };
      });
    },

    /* GET /admin/stats?from=&to= — รวมข้อมูลสาธิต + การจองจริงในระบบ mock */
    adminStats: function (opts) {
      opts = opts || {};
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        var days = opts.days || 0; // 0 = ทั้งหมด
        var minDate = days ? todayISO(-days) : null;
        function inRange(b) { return !minDate || b.createdAt.slice(0, 10) >= minDate; }
        var history = demoHistory().concat(realBookingsView());
        var rows = history.filter(inRange);
        var bookings = rows.length;
        var tickets = rows.reduce(function (a, b) { return a + b.seats; }, 0);
        var value = rows.reduce(function (a, b) { return a + b.value; }, 0);
        var byMovie = {};
        rows.forEach(function (b) {
          if (!byMovie[b.movieTitle]) { byMovie[b.movieTitle] = { title: b.movieTitle, tickets: 0, value: 0 }; }
          byMovie[b.movieTitle].tickets += b.seats;
          byMovie[b.movieTitle].value += b.value;
        });
        var table = Object.keys(byMovie).map(function (k) { return byMovie[k]; })
          .sort(function (a, b) { return b.tickets - a.tickets; });
        var daily = [];
        for (var d = 13; d >= 0; d--) {
          var dateISO = todayISO(-d);
          var dayRows = history.filter(function (b) { return b.createdAt.slice(0, 10) === dateISO; });
          daily.push({ date: dateISO, bookings: dayRows.length,
            value: dayRows.reduce(function (a, b) { return a + b.value; }, 0) });
        }
        return {
          isDemoData: true,
          totalUsers: db.users.length,
          demoBaselineUsers: 48,
          bookings: bookings, tickets: tickets, confirmedValue: value,
          serviceFeeEstimate: tickets * SERVICE_FEE,
          byMovie: table, daily: daily
        };
      });
    },

    /* GET /admin/users?search= */
    adminUsers: function (opts) {
      opts = opts || {};
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        var q = (opts.search || '').trim().toLowerCase();
        var items = db.users.map(function (u) {
          var bookingCount = db.bookings.filter(function (b) { return b.userId === u.id; }).length;
          return { id: u.id, username: u.username, email: u.email, role: u.role,
            createdAt: u.createdAt, bookingCount: bookingCount };
        });
        if (q) {
          items = items.filter(function (u) {
            return u.username.toLowerCase().indexOf(q) !== -1 || u.email.toLowerCase().indexOf(q) !== -1;
          });
        }
        items.sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
        return paginate(items, opts);
      });
    },

    /* PATCH /admin/users/:id/role */
    adminSetRole: function (userId, role) {
      return readyPromise.then(latency).then(function () {
        var me = requireAdmin();
        if (role !== 'user' && role !== 'admin') { throw ApiError(422, 'สิทธิ์ไม่ถูกต้อง'); }
        var u = db.users.filter(function (x) { return x.id === userId; })[0];
        if (!u) { throw ApiError(404, 'ไม่พบบัญชีนี้'); }
        if (u.id === me.id && role !== 'admin') {
          throw ApiError(422, 'ไม่สามารถลดสิทธิ์ของตัวเองได้');
        }
        u.role = role; saveDB();
        return { id: u.id, role: u.role };
      });
    },

    /* DELETE /admin/users/:id — ห้ามลบตัวเองและ admin คนสุดท้าย */
    adminDeleteUser: function (userId) {
      return readyPromise.then(latency).then(function () {
        var me = requireAdmin();
        var u = db.users.filter(function (x) { return x.id === userId; })[0];
        if (!u) { throw ApiError(404, 'ไม่พบบัญชีนี้'); }
        if (u.id === me.id) { throw ApiError(422, 'ไม่สามารถลบบัญชีของตัวเองได้'); }
        if (u.role === 'admin' && db.users.filter(function (x) { return x.role === 'admin'; }).length <= 1) {
          throw ApiError(422, 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้');
        }
        // นโยบาย: การลบบัญชีไม่ลบประวัติการจอง (เก็บไว้ตรวจสอบย้อนหลัง)
        db.users = db.users.filter(function (x) { return x.id !== userId; }); saveDB();
        return { ok: true };
      });
    },

    /* GET /admin/movies */
    adminMovies: function (opts) {
      opts = opts || {};
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        var q = (opts.search || '').trim().toLowerCase();
        var items = db.movies.map(function (m) {
          var hall = hallById(m.hallId);
          var sts = movieShowtimes(m, todayISO(0));
          var periodLabels = m.periods.map(function (p) { var x = periodByKey(p); return x ? x.label : p; });
          return { id: m.id, title: m.title, genres: m.genres.slice(), price: m.price,
            durationMin: m.durationMin, ageRating: m.ageRating, director: m.director,
            synopsis: m.synopsis, poster: m.poster, nowShowing: m.nowShowing,
            releaseDate: m.releaseDate,
            hallId: m.hallId, hall: hall ? hall.name : null,
            dateStart: m.dateStart, dateEnd: m.dateEnd, periods: m.periods.slice(),
            periodLabels: periodLabels,
            todayStatus: m.nowShowing ? (sts.length ? (sts.some(function (s) { return s.status === 'available'; }) ? 'available' : 'full') : 'noshow') : 'upcoming' };
        });
        if (q) { items = items.filter(function (m) { return m.title.toLowerCase().indexOf(q) !== -1; }); }
        /* db.movies เรียงตาม id อยู่แล้ว (push เข้าเรียง) — ลำดับเสถียรเช่นเดียวกับ server */
        return paginate(items, opts);
      });
    },

    /* POST /admin/movies */
    adminCreateMovie: function (data) {
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        var title = (data.title || '').trim();
        if (!title) { throw ApiError(422, 'กรุณากรอกชื่อภาพยนตร์'); }
        var price = Number(data.price);
        if (!price || price < 0 || price > 5000) { throw ApiError(422, 'ราคาต้องเป็นตัวเลข 0–5,000 บาท'); }
        var genres = (Array.isArray(data.genres) ? data.genres : [data.genre]).filter(Boolean);
        if (!genres.length) { throw ApiError(422, 'กรุณาเลือกแนวภาพยนตร์อย่างน้อย 1 แนว'); }
        if (db.movies.some(function (m) { return m.title.toLowerCase() === title.toLowerCase(); })) {
          throw ApiError(409, 'มีภาพยนตร์ชื่อนี้อยู่แล้ว');
        }
        var maxNum = db.movies.reduce(function (a, m) {
          var n = parseInt(m.id.replace(/^m/, ''), 10);
          return isNaN(n) ? a : Math.max(a, n);
        }, 0);
        var id = 'm' + String(maxNum + 1).padStart(2, '0');
        var showing = data.nowShowing !== false;
        var sched = normalizeSchedule(Object.assign({}, data, { nowShowing: showing }), id);
        var movie = { id: id, title: title, genres: genres, price: price,
          durationMin: Number(data.durationMin) || 0, ageRating: data.ageRating || 'ยังไม่ประกาศ',
          director: (data.director || '').trim(), synopsis: (data.synopsis || '').trim(),
          releaseDate: data.releaseDate || todayISO(0), nowShowing: showing,
          poster: imageRef(data.poster),
          hallId: sched.hallId, dateStart: sched.dateStart, dateEnd: sched.dateEnd, periods: sched.periods };
        db.movies.push(movie);
        try { saveDB(); } catch (e) { db.movies.pop(); throw e; }
        return movie;
      });
    },

    /* PATCH /admin/movies/:id */
    adminUpdateMovie: function (id, data) {
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        var m = db.movies.filter(function (x) { return x.id === id; })[0];
        if (!m) { throw ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
        var poster = data.poster !== undefined ? imageRef(data.poster) : undefined;
        var previous = Object.assign({}, m);
        if (data.title !== undefined) {
          var t = (data.title || '').trim();
          if (!t) { throw ApiError(422, 'กรุณากรอกชื่อภาพยนตร์'); }
          if (db.movies.some(function (x) { return x.id !== id && x.title.toLowerCase() === t.toLowerCase(); })) {
            throw ApiError(409, 'มีภาพยนตร์ชื่อนี้อยู่แล้ว');
          }
          m.title = t;
        }
        if (data.price !== undefined) {
          var p = Number(data.price);
          if (!p || p < 0 || p > 5000) { throw ApiError(422, 'ราคาต้องเป็นตัวเลข 0–5,000 บาท'); }
          m.price = p; // แก้ราคาไม่กระทบยอดของรายการจองเดิม (เก็บ snapshot ต่อรายการ)
        }
        if (data.genres !== undefined) { m.genres = data.genres; }
        if (data.durationMin !== undefined) { m.durationMin = Number(data.durationMin) || 0; }
        if (data.ageRating !== undefined) { m.ageRating = data.ageRating; }
        if (data.director !== undefined) { m.director = (data.director || '').trim(); }
        if (data.synopsis !== undefined) { m.synopsis = (data.synopsis || '').trim(); }
        if (poster !== undefined) { m.poster = poster; }
        if (data.nowShowing !== undefined) {
          var showing = !!data.nowShowing;
          var sched = normalizeSchedule({
            nowShowing: showing,
            hallId: data.hallId !== undefined ? data.hallId : m.hallId,
            periods: data.periods !== undefined ? data.periods : m.periods,
            dateStart: data.dateStart !== undefined ? data.dateStart : m.dateStart,
            dateEnd: data.dateEnd !== undefined ? data.dateEnd : m.dateEnd
          }, id);
          m.nowShowing = showing;
          m.hallId = sched.hallId; m.dateStart = sched.dateStart;
          m.dateEnd = sched.dateEnd; m.periods = sched.periods;
        } else if (data.hallId !== undefined || data.periods !== undefined || data.dateStart !== undefined || data.dateEnd !== undefined) {
          var sched2 = normalizeSchedule({
            nowShowing: m.nowShowing,
            hallId: data.hallId !== undefined ? data.hallId : m.hallId,
            periods: data.periods !== undefined ? data.periods : m.periods,
            dateStart: data.dateStart !== undefined ? data.dateStart : m.dateStart,
            dateEnd: data.dateEnd !== undefined ? data.dateEnd : m.dateEnd
          }, id);
          m.hallId = sched2.hallId; m.dateStart = sched2.dateStart;
          m.dateEnd = sched2.dateEnd; m.periods = sched2.periods;
        }
        try { saveDB(); } catch (e) { Object.assign(m, previous); throw e; }
        return m;
      });
    },

    /* DELETE /admin/movies/:id — ไม่ลบประวัติการจองย้อนหลัง */
    adminDeleteMovie: function (id) {
      return readyPromise.then(latency).then(function () {
        requireAdmin();
        var m = db.movies.filter(function (x) { return x.id === id; })[0];
        if (!m) { throw ApiError(404, 'ไม่พบภาพยนตร์เรื่องนี้'); }
        db.movies = db.movies.filter(function (x) { return x.id !== id; });
        // การจองเดิมเก็บ movieTitle snapshot ไว้ จึงยังแสดงในประวัติได้
        saveDB();
        return { ok: true, removedTitle: m.title };
      });
    },

    /* ---------- helper เพิ่มเติมสำหรับ session ฝั่ง UI ---------- */
    currentUser: function () { return db ? currentUser() : null; },

    /* วันที่เปิดรอบฉาย (วันนี้ถึงอีก 5 วันข้างหน้า รวม 6 วัน) สำหรับปุ่มเลือกวัน */
    showDates: function () {
      var out = [];
      for (var i = 0; i < SHOW_DAYS; i++) { out.push(todayISO(i)); }
      return out;
    }
  };

  window.MAISON_API = API;
})();
