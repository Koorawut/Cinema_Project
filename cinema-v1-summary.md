# สรุป v1 — เว็บจองตั๋วหนัง MAISON (ส่งต่อ backend)

อัปเดต: 14 ตุลาคม 2026 (รอบปรับปรุง v1.4) · เวอร์ชัน 1.4 (v1.4) · แสดงเลขเวอร์ชันที่ eyebrow หน้าแรกและ footer ทุกหน้า
เอกสารหลัก: `cinema-frontend-plan.md` (สัญญา API หัวข้อ 5) · `CHANGELOG.md` · `cinema-issues.md`

## 1. สิ่งที่ส่งมอบ

- หน้า HTML 15 หน้า (vanilla JS ไม่ใช้ framework/build tool): index, login, register, account, movies, movie, seats, checkout, ticket, bookings, offers, admin, admin-accounts, admin-movies, admin-promotions
- `assets/js/api.js` — mock API ครบทุก endpoint ตามสัญญาในแผน; ทุก call ผ่าน `MAISON_API.*` เท่านั้น การสลับเป็น backend จริงทำที่ไฟล์นี้จุดเดียว
- `assets/js/app.js` — utilities/UI shell (toast, dialog, confirm, จัดรูปแบบวันที่-เงินภาษาไทย)
- `assets/css/styles.css`, `assets/data/seed.json`, `assets/img/*.svg` (12 ไฟล์ สร้างเอง)

## 2. การสลับเป็น backend จริง

1. เก็บ endpoint ทั้งหมดที่หน้าเพจเรียก (ผ่าน `MAISON_API`) แล้วเขียน implement ใหม่เรียก HTTP แทน localStorage
2. โครงสร้าง request/response อ้างอิงหัวข้อ 5 ของแผน; seed.json ใช้เป็นข้อมูลตั้งต้น DB ได้
3. จุดที่ต้องระวังเมื่อมี backend:
   - `createBooking` ต้องยืนยันราคา+จองที่นั่งแบบ atomic และตอบ `409` เมื่อที่นั่งถูกจองไปก่อน (P-03)
   - รอบฉายอย่า hardcode วันที่สัมพัทธ์ฝั่ง client — เก็บ "ตารางฉายต่อเรื่อง" (โรง, ช่วงเวลา, ช่วงวันที่) ตาม `SEED_SCHEDULE` ใน api.js แล้ว generate showtimes รายวันที่ server; รูปแบบ id `st-{movieId}-{YYYY-MM-DD}-{morning|afternoon|evening}` และ id ที่นั่ง `{hallId}-{แถว}{เลข}` ใช้ต่อได้; seed.json **ไม่มี**ข้อมูลตารางนี้ (วันที่สัมพัทธ์กับวันปัจจุบันจึง inject ตอน runtime)
   - session/cookie จริงแทน `maison_v1_session` + `maison_v1_session_fb` (P-06, P-10) — ตั้ง `Secure; SameSite=Lax` ให้ cookie remember (L-1)
    - `adminCreatePromotion(data)` / `adminUpdatePromotion(id,data)` / `adminDeletePromotion(id)` / `adminPromotions()` ต้องบังคับสิทธิ์ admin ที่ server และตรวจ code ซ้ำ; คูปองใช้ `{code,title,summary,details,terms,image}` ร่วมกับ public `promotions()`/`promotion(id)`/`redeem(code)` (ยังตรวจรหัสเท่านั้น ไม่คำนวณส่วนลด: P-08)
    - ฟอร์มแนบภาพใช้ PNG/JPEG/WebP สูงสุด 180 KB; mock แปลงเป็น data URL เก็บใน localStorage ภายใต้ `maison_v1_db` (อาจเต็มพื้นที่ แม้ระบบแจ้งข้อผิดพลาดแล้ว) — backend จริงควรอัปโหลดไฟล์แยกไป object storage, ตรวจชนิดจากเนื้อหา/ขนาดฝั่ง server, กำหนดสิทธิ์และคืน URL ที่อนุญาตแทน data URL; ยังต้องตรวจ URL `poster`/`image` ฝั่ง server (L-2)

## 3. ข้อมูลสาธิต

- บัญชี: `admin/admin123` (role admin), `demo/demo123` (role member) — หน้า login มีปุ่มกรอกบัญชีทั้งสองอัตโนมัติ
- ราคาบัตรต่อเรื่อง ฿200–฿300 · ค่าบริการ ฿30/ตั๋ว (SERVICE_FEE)
- โรง 2 โรง: `hall-01` / `hall-02` แถว A–H × 12 ที่นั่งเท่ากัน · 3 ช่วงเวลา/วัน — เช้า 10:30 · กลางวัน 14:20 · เย็น 19:00 · วันฉาย 6 วันนับจากวันนี้ (SHOW_DAYS)
- การจองสาธิตของบัญชี demo: MAI-7Q3F (Orbit 9, hall-01, E7+E8) และ MAI-2K8D (Bangkok Bank Run, hall-02, C4) — วันที่อดีต เพื่อให้หน้า bookings/ticket/admin มีข้อมูล
- หนัง now showing 8 เรื่อง + coming soon 3 เรื่อง (m09–m11) · โปร 3 รายการ (MAISON20, EVENINGPAIR, FRIDAY180)
- ตัวเลขสถิติหน้า admin เป็นตัวอย่าง ติดป้ายกำกับแล้ว (P-04)

## 4. ที่เก็บข้อมูล (mock)

| คีย์ | ที่เก็บ | เนื้อหา |
|---|---|---|
| `maison_v1_db` | localStorage | DB จำลอง (movies, promotions, users, bookings) — SEED_VERSION 4 |
| `maison_v1_session` | sessionStorage | session ผู้ใช้ปัจจุบัน (ตัวหลัก) |
| `maison_v1_session_fb` | localStorage | สำเนา session สำรอง (v1.1, P-10) — อ่านคืนเมื่อ sessionStorage ว่าง เพราะ preview แบบ iframe ล้าง sessionStorage ทุกครั้งที่เปลี่ยนหน้า; backend จริงให้แทนด้วย httpOnly cookie session แทนทั้งสองคีย์นี้ |
| `maison_v1_remember` | localStorage | username จำไว้สำหรับ login |

## 5. ผลตรวจ v1

- **ฟังก์ชัน/Rubrics (agent):** เดิมไม่ผ่าน 3 จุด — `novalidate` ปิด browser validation (Rubric 3), ไม่มี XHR (Rubric 10), ขาด child combinator (Rubric 2 Bonus) — **แก้ครบแล้ว** รวมถึง `disabled-look` ไม่มีนิยาม CSS, คำเตือนกันที่นั่ง, dead code `draft` — ลบ/เพิ่มแล้ว
- **ความปลอดภัย (agent):** ไม่พบ HIGH/MEDIUM; LOW 3 รายการ (L-1 cookie, L-2 URL ภาพ, L-3 `st.date` ใน href — เพิ่ม esc แล้ว) ยอมรับได้สำหรับเดโม ระบุไว้ในหัวข้อ 2 สำหรับ backend
- **สีที่นั่ง:** ว่าง = แดง `#A34A32` (ขอบ `#C77B62`), เลือก = gold `#C9B485`, จองแล้ว = เทา `#3A4038` — ยึดข้อกำหนดผู้ใช้ เป็นการปรับจากแบบ Figma (P-09) บันทึกใน `design-tokens.md`
- **การทดสอบตามระเบียบ:** v1.2 รอบแรก (T1 39/39, smoke 15 เคส, ปิด P-11) · v1.3 รอบที่ 2 (T1 42/42, smoke 17 เคส, ปิด P-13 ปุ่ม ghost บนพื้นเข้ม) — รายละเอียดใน `tests/test-log.md`
- **v1.4:** T1 44/44 ใน headless Chrome; งาน admin ภาพยนตร์/คูปองรองรับไฟล์ภาพและฟอร์มเลื่อนได้, หน้า offers และหน้าแรกอ่านรายการคูปองจาก mock DB เดียวกัน (ดู `tests/test-log.md` รอบที่ 3)

## 6. เงื่อนไขที่ยังค้าง (ส่งต่อรอบถัดไป)

- P-03 การกันที่นั่งระหว่างเลือก (frontend มีคำเตือนแล้ว ไม่มี timer/hold ตามขอบเขต v1)
- P-04 นิยาม visitor/ค่าบริการ, P-06 หลักฐาน Rubrics ฝั่ง backend/DB/session, P-07 สิทธิ์ข้อมูล+นโยบายลบ, P-08 กติกาโปรโมชันชัดเจน, P-01 การตรวจภาพจริงรายหน้า
- Rubric 1 (wireframe/architecture) — ยังไม่ชัดว่าต้องส่งไฟล์แยกหรืออ้างแผน/`design-tokens.md` พอ **ต้องถามผู้สอน/ผู้ประเมิน**

## 7. วิธีรัน

เสิร์ฟผ่าน HTTP ใดก็ได้ (เช่น VS Code Live Server) — seed.json จะโหลดผ่าน XHR; ถ้าเปิดไฟล์ตรง ๆ ผ่าน `file://` ระบบใช้ embedded seed ใน api.js อัตโนมัติ
