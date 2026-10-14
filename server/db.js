/* =============================================================
   MAISON Cinema — การเชื่อมต่อฐานข้อมูล
   - production / preview: Neon Postgres ผ่าน HTTP (@neondatabase/serverless)
     ใช้ DATABASE_URL ที่ Vercel Storage ใส่ให้อัตโนมัติ
   - เครื่อง dev ที่ไม่มี Neon: DATABASE_URL=pglite:./.pglite ใช้ PGlite
     (Postgres แบบ WASM ใน process เดียว — devDependency, ไม่ถูก deploy)
   ทุก query ใช้ parameter ($1, $2, …) เสมอ ไม่ต่อสตริง SQL จากข้อมูลผู้ใช้
   ============================================================= */
'use strict';

let driverPromise = null;

function connect() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!url) {
    return Promise.reject(new Error('DATABASE_URL is not set (ดูคู่มือใน cinema-v1-summary.md หัวข้อ 7)'));
  }
  if (url.startsWith('pglite:')) {
    const dir = url.slice('pglite:'.length) || undefined; // ว่าง = in-memory
    // ชื่อโมดูลอยู่ในตัวแปร — ไม่ให้ Vercel (nft) trace PGlite เข้า bundle ของ function
    const mod = '@electric-sql/pglite';
    return import(mod).then(({ PGlite }) => {
      const pg = new PGlite(dir);
      return {
        kind: 'pglite',
        query: (text, params) => pg.query(text, params || []).then((r) => r.rows),
        exec: (text) => pg.exec(text).then(() => undefined),
        close: () => pg.close()
      };
    });
  }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);
  return Promise.resolve({
    kind: 'neon',
    query: (text, params) => sql.query(text, params || []),
    // Neon HTTP รันได้ครั้งละ 1 คำสั่ง — แยก statement ตาม ; ท้ายบรรทัด
    exec: async (text) => {
      const statements = text.split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
      for (const s of statements) { await sql.query(s, []); }
    }
  });
}

function driver() {
  if (!driverPromise) {
    driverPromise = connect().catch((e) => { driverPromise = null; throw e; });
  }
  return driverPromise;
}

/* คืน rows (array of object) */
async function query(text, params) {
  const d = await driver();
  return d.query(text, params);
}
async function one(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}
async function exec(text) {
  const d = await driver();
  return d.exec(text);
}

/* unique violation ของ constraint ที่ระบุ (Neon และ PGlite ส่ง code/constraint เหมือน pg) */
function isUniqueViolation(err, constraint) {
  if (!err || err.code !== '23505') { return false; }
  if (!constraint) { return true; }
  return err.constraint === constraint || String(err.message || '').indexOf(constraint) !== -1 ||
    String(err.detail || '').indexOf(constraint) !== -1;
}

function driverKind() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  return url.startsWith('pglite:') ? 'pglite' : 'neon';
}

module.exports = { query, one, exec, driver, driverKind, isUniqueViolation };
