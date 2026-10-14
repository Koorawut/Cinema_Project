/* =============================================================
   MAISON Cinema — ภาพโปสเตอร์/คูปอง (Vercel Blob)
   รับค่า image ได้ 4 แบบ:
   1) ''                      → ไม่มีภาพ
   2) assets/img/*.svg|png…   → ภาพที่มากับเว็บ (seed)
   3) ค่าเดิมที่เก็บอยู่แล้ว      → คงไว้ ไม่อัปโหลดซ้ำ
   4) data:image/…;base64,…   → ตรวจชนิดจาก magic bytes + ≤180 KB
                                 แล้ว put() ขึ้น Blob คืน URL สาธารณะ
   URL ภายนอกอื่น ๆ ถูกปฏิเสธ (L-2)
   ============================================================= */
'use strict';

const { ApiError } = require('./http');

const MAX_BYTES = 180000;
const LOCAL_RE = /^assets\/img\/[a-z0-9-]+\.(svg|png|jpg|jpeg|webp)$/i;
const DATA_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const BLOB_HOST_RE = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/;

function blobToken() { return process.env.BLOB_READ_WRITE_TOKEN || ''; }
function onVercel() { return !!process.env.VERCEL; }

function isBlobUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && BLOB_HOST_RE.test(u.hostname);
  } catch (e) { return false; }
}

function decodeDataUrl(v) {
  const match = DATA_RE.exec(v);
  if (!match || match[2].length > 240000) { throw new ApiError(422, 'ภาพต้องเป็น PNG, JPEG หรือ WebP ขนาดไม่เกิน 180 KB'); }
  const bytes = Buffer.from(match[2], 'base64');
  const type = match[1];
  const ok = bytes.length > 0 && bytes.length <= MAX_BYTES && (
    (type === 'png' && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (type === 'jpeg' && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
    (type === 'webp' && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP'));
  if (!ok) { throw new ApiError(422, 'เนื้อหาไฟล์ภาพไม่ตรงกับชนิดภาพ'); }
  return { bytes, type };
}

/* แปลงค่าที่ผู้ดูแลส่งมาเป็นค่าที่เก็บใน DB — folder: 'posters' | 'promotions' */
async function resolveImage(value, current, folder) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) { return ''; }
  if (current && v === current) { return current; }
  if (LOCAL_RE.test(v)) { return v; }
  if (!v.startsWith('data:')) { throw new ApiError(422, 'ภาพต้องเป็น PNG, JPEG หรือ WebP ขนาดไม่เกิน 180 KB'); }
  const img = decodeDataUrl(v);
  if (!blobToken()) {
    // เครื่อง dev ที่ยังไม่ผูก Blob store: เก็บ data URL ใน DB ตรง ๆ (แบบเดียวกับ mock)
    if (!onVercel()) { return v; }
    throw new ApiError(503, 'ยังไม่ได้ตั้งค่าที่เก็บไฟล์ภาพ (BLOB_READ_WRITE_TOKEN)');
  }
  const { put } = require('@vercel/blob');
  const ext = img.type === 'jpeg' ? 'jpg' : img.type;
  try {
    const out = await put(folder + '/image.' + ext, img.bytes, {
      access: 'public', contentType: 'image/' + img.type, addRandomSuffix: true, token: blobToken()
    });
    return out.url;
  } catch (e) {
    console.error('[blob] put failed', e && e.message);
    throw new ApiError(502, 'อัปโหลดภาพไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
}

/* ลบภาพเก่าบน Blob (best effort — ล้มเหลวก็ไม่ทำให้คำขอหลักล้ม) */
async function discardImage(url) {
  if (!url || !isBlobUrl(url) || !blobToken()) { return; }
  try {
    const { del } = require('@vercel/blob');
    await del(url, { token: blobToken() });
  } catch (e) { console.error('[blob] del failed', e && e.message); }
}

module.exports = { resolveImage, discardImage, decodeDataUrl, isBlobUrl };
