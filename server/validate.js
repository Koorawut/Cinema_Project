/* =============================================================
   MAISON Cinema — ตรวจข้อมูลฝั่ง server
   ข้อความ error ภาษาไทยคัดลอกจาก mock (assets/js/api-mock.js) ทุกคำ
   เพื่อให้หน้าเว็บแสดงผลเหมือนเดิม
   ============================================================= */
'use strict';

const { ApiError } = require('./http');
const { isISODate } = require('./time');

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }

function registration(data) {
  const username = str(data.username).trim();
  const email = str(data.email).trim().toLowerCase();
  const password = str(data.password);
  if (!USERNAME_RE.test(username)) {
    throw new ApiError(422, 'ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ ตัวเลข หรือ _ ความยาว 3–20 ตัวอักษร');
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) { throw new ApiError(422, 'รูปแบบอีเมลไม่ถูกต้อง'); }
  if (!PASSWORD_RE.test(password) || password.length > 72) {
    throw new ApiError(422, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร และมีทั้งตัวอักษรกับตัวเลข');
  }
  if (password !== str(data.confirmPassword)) { throw new ApiError(422, 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'); }
  return { username, email, password };
}

function newPassword(data) {
  const pw = str(data.newPassword);
  if (!PASSWORD_RE.test(pw) || pw.length > 72) {
    throw new ApiError(422, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร และมีทั้งตัวอักษรกับตัวเลข');
  }
  if (pw !== str(data.confirmPassword)) { throw new ApiError(422, 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'); }
  return pw;
}

/* ฟิลด์คูปอง (ยกเว้นภาพ ซึ่งตรวจใน images.js เพราะต้องอัปโหลด) */
function promotionFields(data) {
  data = data || {};
  const code = str(data.code).trim().toUpperCase();
  const title = str(data.title).trim();
  const summary = str(data.summary).trim();
  const details = str(data.details).trim();
  const terms = data.terms;
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) { throw new ApiError(422, 'รหัสต้องมี 3–24 ตัว ใช้ A–Z, 0–9 หรือขีดกลาง'); }
  if (!title || title.length > 100 || !summary || summary.length > 240 || !details || details.length > 1200 ||
      !Array.isArray(terms) || terms.length > 8 || terms.some((t) => typeof t !== 'string' || t.length > 240)) {
    throw new ApiError(422, 'กรุณากรอกรายละเอียดคูปองให้ครบ และไม่เกินขนาดที่กำหนด');
  }
  return { code, title, summary, details, terms: terms.map((t) => t.trim()).filter(Boolean) };
}

/* ฟิลด์ภาพยนตร์ (ยกเว้นตารางฉายและโปสเตอร์) — data คือข้อมูลที่รวมค่าเดิมแล้ว */
function movieFields(data) {
  const title = str(data.title).trim();
  if (!title) { throw new ApiError(422, 'กรุณากรอกชื่อภาพยนตร์'); }
  const price = Number(data.price);
  if (!price || price < 0 || price > 5000 || !Number.isFinite(price)) { throw new ApiError(422, 'ราคาต้องเป็นตัวเลข 0–5,000 บาท'); }
  const genres = (Array.isArray(data.genres) ? data.genres : [data.genre]).filter(Boolean);
  if (!genres.length) { throw new ApiError(422, 'กรุณาเลือกแนวภาพยนตร์อย่างน้อย 1 แนว'); }
  const durationMin = Math.round(Number(data.durationMin) || 0);
  const ageRating = str(data.ageRating).trim() || 'ยังไม่ประกาศ';
  const director = str(data.director).trim();
  const synopsis = str(data.synopsis).trim();
  if (title.length > 120 || director.length > 120 || synopsis.length > 2000 || ageRating.length > 40 ||
      genres.length > 8 || genres.some((g) => typeof g !== 'string' || g.length > 40) ||
      durationMin < 0 || durationMin > 600) {
    throw new ApiError(422, 'ข้อมูลภาพยนตร์ไม่ถูกต้องหรือยาวเกินกำหนด');
  }
  let releaseDate = data.releaseDate == null || data.releaseDate === '' ? null : str(data.releaseDate).slice(0, 10);
  if (releaseDate && !isISODate(releaseDate)) { throw new ApiError(422, 'วันที่เข้าฉายไม่ถูกต้อง'); }
  return { title, price: Math.round(price), genres, durationMin, ageRating, director, synopsis, releaseDate };
}

module.exports = { registration, newPassword, promotionFields, movieFields, str };
