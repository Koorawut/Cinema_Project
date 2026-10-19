/* =============================================================
   MAISON Cinema — Application shell (v1)
   -------------------------------------------------------------
   หน้าที่: session, header/footer ร่วม, toast, modal, helper
   แต่ละหน้าเรียก MAISON.init() ก่อน แล้วค่อยรัน logic ของหน้า
   ============================================================= */
(function () {
  'use strict';

  var VERSION = '2.2.0';

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var bahtFmt;
  function baht(n) {
    if (!bahtFmt) { bahtFmt = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }); }
    return bahtFmt.format(Number(n) || 0);
  }
  function parseLocal(iso) { return new Date(String(iso).slice(0, 10) + 'T00:00:00'); }
  var dateFmt, longDateFmt, timeFmt;
  function thDate(iso) {
    if (!dateFmt) { dateFmt = new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
    return dateFmt.format(parseLocal(iso));
  }
  function thLongDate(iso) {
    if (!longDateFmt) { longDateFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); }
    return longDateFmt.format(parseLocal(iso));
  }
  function thTime(iso) {
    var t = String(iso).slice(11, 16);
    return (t || '--:--') + ' น.';
  }
  function thDateTime(iso) { return thDate(iso) + ' ' + thTime(iso); }
  /* แถบเลือกวันฉายใช้ร่วมกัน (movie.html / movies.html)
     opts.isOut(iso) — วันที่อยู่นอกช่วงฉายของเรื่อง (ปุ่มหม่น กดไม่ได้)
     opts.onPick(iso) — เรียกเมื่อเลือกวัน */
  function dateStrip(container, dates, selected, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var dowFmt = new Intl.DateTimeFormat('th-TH', { weekday: 'short' });
    var dayFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });
    dates.forEach(function (iso) {
      var out = opts.isOut ? !!opts.isOut(iso) : false;
      var btn = el('button', 'date-btn' + (out ? ' out' : '') + (iso === selected && !out ? ' selected' : ''));
      btn.type = 'button';
      btn.appendChild(el('span', 'db-dow', dowFmt.format(parseLocal(iso))));
      btn.appendChild(el('span', 'db-day', dayFmt.format(parseLocal(iso))));
      if (out) {
        btn.disabled = true;
        btn.title = 'ไม่มีรอบฉายวันนี้';
      } else if (opts.onPick) {
        btn.addEventListener('click', function () { opts.onPick(iso); });
      }
      container.appendChild(btn);
    });
  }
  function byId(id) { return document.getElementById(id); }
  function readImage(file) {
    if (!file) { return Promise.resolve(null); }
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type) || file.size > 180000 || !file.size) {
      return Promise.reject(new Error('ใช้ภาพ PNG, JPEG หรือ WebP ขนาดไม่เกิน 180 KB'));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('อ่านไฟล์ภาพไม่สำเร็จ')); };
      reader.onload = function () {
        var url = String(reader.result);
        var bytes;
        try { bytes = atob(url.slice(url.indexOf(',') + 1)); }
        catch (e) { reject(new Error('ไฟล์ภาพไม่ถูกต้อง')); return; }
        if (!((bytes.slice(0, 8) === '\x89PNG\r\n\x1a\n' && file.type === 'image/png') ||
            (bytes.slice(0, 3) === '\xff\xd8\xff' && file.type === 'image/jpeg') ||
            (bytes.slice(0, 4) === 'RIFF' && bytes.slice(8, 12) === 'WEBP' && file.type === 'image/webp'))) {
          reject(new Error('เนื้อหาไฟล์ไม่ตรงกับชนิดภาพ')); return;
        }
        resolve(url);
      };
      reader.readAsDataURL(file);
    });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }
  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  function forever() { return new Promise(function () {}); }
  function go(url) { window.location.href = url; }

  /* ---------- แปลชื่อแนวภาพยนตร์เป็นภาษาไทย ---------- */
  var GENRE_MAP = {
    'Horror': 'สยองขวัญ', 'Action': 'แอ็กชัน', 'Comedy': 'ตลก', 'Drama': 'ดราม่า',
    'Science Fiction': 'ไซไฟ', 'Romance': 'โรแมนซ์', 'Thriller': 'ระทึกขวัญ', 'Western': 'คาวบอยตะวันตก'
  };
  function genreThai(g) { return GENRE_MAP[g] || g; }
  function genresLabel(genres) { return (genres || []).map(genreThai).join(', '); }

  /* ---------- Toast ---------- */
  var ICONS = {
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6m0 4h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v6m0-10h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
  };
  function toastRoot() {
    var root = byId('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    return root;
  }
  function toast(message, type) {
    type = type || 'info';
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = '<span class="toast-icon">' + (ICONS[type] || ICONS.info) + '</span><span class="toast-msg"></span>';
    el.querySelector('.toast-msg').textContent = message;
    toastRoot().appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }, 3600);
  }

  /* ---------- Modal ---------- */
  function modalRoot() {
    var root = byId('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    return root;
  }
  function dialog(opts) {
    var root = modalRoot();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var dlg = document.createElement('div');
    dlg.className = 'modal' + (opts.danger ? ' modal-danger' : '');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', opts.title || 'กล่องโต้ตอบ');
    var html = '<div class="modal-header"><h3></h3>' +
      '<button type="button" class="modal-close" aria-label="ปิด">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>' +
      '<div class="modal-body"></div>';
    dlg.innerHTML = html;
    dlg.querySelector('h3').textContent = opts.title || '';
    var body = dlg.querySelector('.modal-body');
    if (typeof opts.bodyHTML === 'string') { body.innerHTML = opts.bodyHTML; }
    else if (opts.bodyNode) { body.appendChild(opts.bodyNode); }
    overlay.appendChild(dlg);
    root.appendChild(overlay);
    var prevFocus = document.activeElement;
    function close() {
      overlay.classList.remove('open');
      setTimeout(function () { overlay.remove(); }, 200);
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) { prevFocus.focus(); }
    }
    function onKey(e) { if (e.key === 'Escape') { close(); } }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) { close(); } });
    dlg.querySelector('.modal-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () { overlay.classList.add('open'); });
    var api = { el: dlg, body: body, close: close };
    dlg.querySelector('.modal-close').focus();
    return api;
  }
  /* กล่องยืนยันงานที่ย้อนคืนยาก — คืน Promise<boolean> */
  function confirm(opts) {
    return new Promise(function (resolve) {
      var d = dialog({ title: opts.title, danger: opts.danger,
        bodyHTML: '<p class="modal-text"></p><div class="modal-actions"></div>' });
      d.body.querySelector('.modal-text').textContent = opts.message || '';
      var actions = d.body.querySelector('.modal-actions');
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-secondary';
      cancel.textContent = opts.cancelText || 'ยกเลิก';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
      ok.textContent = opts.confirmText || 'ยืนยัน';
      cancel.addEventListener('click', function () { d.close(); resolve(false); });
      ok.addEventListener('click', function () { d.close(); resolve(true); });
      actions.appendChild(ok);
      actions.appendChild(cancel);
      ok.focus();
    });
  }

  /* ---------- Chrome: header/footer ---------- */
  var NAV = {
    home: { href: 'index.html', label: 'หน้าแรก' },
    movies: { href: 'movies.html', label: 'ภาพยนตร์' },
    offers: { href: 'offers.html', label: 'โปรโมชัน' },
    bookings: { href: 'bookings.html', label: 'การจองของฉัน' }
  };
  var ADMIN_NAV = {
    'admin-overview': { href: 'admin.html', label: 'ภาพรวม' },
    'admin-movies': { href: 'admin-movies.html', label: 'ภาพยนตร์' },
    'admin-accounts': { href: 'admin-accounts.html', label: 'บัญชีผู้ใช้' },
    'admin-promotions': { href: 'admin-promotions.html', label: 'คูปอง' }
  };
  function navLink(item, active) {
    var a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.label;
    if (active) { a.setAttribute('aria-current', 'page'); }
    return a;
  }
  function renderHeader(opts, user) {
    var header = document.createElement('header');
    header.className = 'site-header' + (opts.chrome === 'admin' ? ' admin-header' : '');
    header.setAttribute('data-od-id', 'site-header');
    var inner = document.createElement('div');
    inner.className = 'container header-inner';

    var brand = document.createElement('a');
    brand.className = 'brand';
    brand.href = opts.chrome === 'admin' ? 'admin.html' : 'index.html';
    brand.innerHTML = 'MAISON <span class="brand-sub">' +
      (opts.chrome === 'admin' ? 'ผู้ดูแลระบบ' : 'THE ART OF CINEMA') + '</span>';

    var nav = document.createElement('nav');
    nav.className = 'main-nav';
    nav.setAttribute('aria-label', opts.chrome === 'admin' ? 'เมนูผู้ดูแลระบบ' : 'เมนูหลัก');
    var map = opts.chrome === 'admin' ? ADMIN_NAV : NAV;
    if (opts.chrome !== 'admin') {
      /* หน้า admin ใช้ sidebar เป็นเมนูหลัก จึงไม่ซ้ำ nav ใน header */
      Object.keys(map).forEach(function (key) {
        nav.appendChild(navLink(map[key], key === opts.nav));
      });
    }

    var actions = document.createElement('div');
    actions.className = 'header-actions';
    actions.setAttribute('data-od-id', 'header-actions');
    if (user) {
      if (user.role === 'admin' && opts.chrome !== 'admin') {
        var adminLink = document.createElement('a');
        adminLink.className = 'btn btn-ghost btn-sm';
        adminLink.href = 'admin.html';
        adminLink.textContent = 'ผู้ดูแลระบบ';
        actions.appendChild(adminLink);
      }
      var hello = document.createElement('a');
      hello.className = 'user-link';
      hello.href = 'account.html';
      hello.setAttribute('data-od-id', 'user-menu');
      hello.innerHTML = '<span class="user-hello"></span>';
      hello.querySelector('.user-hello').textContent = 'สวัสดี, ' + user.username;
      var outBtn = document.createElement('button');
      outBtn.type = 'button';
      outBtn.className = 'btn btn-ghost btn-sm';
      outBtn.setAttribute('data-od-id', 'logout-button');
      outBtn.textContent = 'ออกจากระบบ';
      outBtn.addEventListener('click', function () {
        MAISON_API.logout().then(function () {
          toast('ออกจากระบบเรียบร้อยแล้ว', 'success');
          setTimeout(function () { go('index.html'); }, 400);
        });
      });
      actions.appendChild(hello);
      actions.appendChild(outBtn);
    } else {
      var loginBtn = document.createElement('a');
      loginBtn.className = 'btn btn-ghost btn-sm';
      loginBtn.setAttribute('data-od-id', 'login-button');
      loginBtn.href = 'login.html';
      loginBtn.textContent = 'เข้าสู่ระบบ';
      actions.appendChild(loginBtn);
    }

    inner.appendChild(brand);
    if (opts.chrome !== 'admin') { inner.appendChild(nav); }
    inner.appendChild(actions);
    header.appendChild(inner);
    document.body.prepend(header);
  }
  function renderFooter(opts, user) {
    if (opts.chrome === 'admin') { return; }
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.setAttribute('data-od-id', 'site-footer');
    footer.innerHTML =
      '<div class="container footer-inner">' +
      '  <div class="footer-brand">' +
      '    <p class="footer-logo">MAISON</p>' +
      '    <p class="footer-tag">THE ART OF CINEMA — โรงภาพยนตร์เพื่อคนรักหนัง</p>' +
      '  </div>' +
      '  <nav class="footer-nav" aria-label="เมนูท้ายเว็บไซต์">' +
      '    <a href="movies.html">ภาพยนตร์</a>' +
      '    <a href="offers.html">โปรโมชัน</a>' +
      '    <a href="bookings.html">การจองของฉัน</a>' +
      (user ? '<a href="account.html">บัญชีของฉัน</a>' : '<a href="login.html">เข้าสู่ระบบ</a>') +
      '  </nav>' +
      '  <div class="footer-meta">' +
      '    <p class="version-badge" data-od-id="version-badge">เวอร์ชัน 2.2 (v2.2)</p>' +
      '    <p>ระบบสาธิตเพื่อการศึกษา — ข้อมูลภาพยนตร์และการจองเป็นชุดตัวอย่างในฐานข้อมูล</p>' +
      '    <p>&copy; 2026 MAISON Cinema Project</p>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(footer);
  }

  /* ---------- init: จุดเริ่มของทุกหน้า ---------- */
  function init(opts) {
    opts = opts || {};
    return MAISON_API.ready.then(function () {
      var user = MAISON_API.currentUser();

      if (opts.redirectIfAuth && user) {
        go('index.html');
        return forever();
      }
      if (opts.guard === 'user' || opts.guard === 'admin') {
        if (!user) {
          toast('กรุณาเข้าสู่ระบบก่อนใช้งานส่วนนี้', 'info');
          go('login.html?next=' + encodeURIComponent(window.location.pathname.split('/').pop() + window.location.search));
          return forever();
        }
        if (opts.guard === 'admin' && user.role !== 'admin') {
          toast('ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น', 'error');
          go('index.html');
          return forever();
        }
      }
      renderHeader(opts, user);
      renderFooter(opts, user);
      return { user: user };
    });
  }

  function handleApiError(err) {
    toast((err && err.message) ? err.message : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง', 'error');
  }

  /* ---------- เผยแพร่ API สาธารณะ ---------- */
  window.MAISON = {
    version: VERSION,
    esc: esc,
    baht: baht,
    genreThai: genreThai,
    genresLabel: genresLabel,
    thDate: thDate,
    thLongDate: thLongDate,
    thTime: thTime,
    thDateTime: thDateTime,
    dateStrip: dateStrip,
    byId: byId,
    readImage: readImage,
    el: el,
    qs: qs,
    go: go,
    toast: toast,
    dialog: dialog,
    confirm: confirm,
    init: init,
    handleApiError: handleApiError
  };
})();
