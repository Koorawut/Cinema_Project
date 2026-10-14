# Design tokens: MAISON (จาก Web_Dev_Figma.pdf)

ที่มา: เรนเดอร์ PDF เป็น PNG 80 dpi (หน้า 1440 x 1000 pt) ด้วย Poppler 25.07 แล้วอ่านภาพครบทั้ง 14 หน้า
ค่าสีด้านล่างอ่านจากพิกเซลของภาพที่เรนเดอร์ ไม่ใช่ค่าจากคำสั่งวาดใน PDF
ฟอนต์ใน PDF เป็น Type 3 ไม่มีชื่อ จึงระบุจากรูปทรงตัวอักษรเท่านั้น

สถานะ: `ยืนยัน` = อ่านจากพิกเซลโดยตรง, `ประมาณ` = ดูจากภาพ ยังไม่ได้ sample, ห้ามล็อกเป็นค่าสุดท้าย

## สี

| โทเคน | ค่า | สถานะ | ใช้ที่ |
|---|---|---|---|
| bg-dark | `#101211` | ยืนยัน | พื้นหลังหน้า dark, header, sidebar แอดมิน |
| bg-cream | `#F2EFE7` | ยืนยัน | พื้นหลังหน้า light (login, account, bookings, checkout, ภาพรวมแอดมิน) |
| surface-light | `#FAF8F2` | ยืนยัน | การ์ดและช่อง input บนพื้นครีม |
| accent-gold | `#C9B485` | ยืนยัน | ปุ่มหลัก, ที่นั่งที่เลือก, วันที่ที่เลือก, แท่งกราฟ |
| tint-beige | `#EAE2CF` | ยืนยัน | แถว/เมนูที่เลือก, กล่องข้อมูล, ตัวเลือกชำระเงินที่เลือก, badge |
| border-light | `#E4E2D9` | ยืนยัน | เส้นแบ่งบนพื้นครีม |
| border-card-light | `#E7E5DD` | ยืนยัน | ขอบการ์ดบนพื้นครีม |
| border-dark | `#1D201D` | ยืนยัน | เส้นใต้ nav บนพื้นเข้ม |
| surface-dark | `#242824` | ยืนยัน | กล่องหมายเหตุที่นั่ง, รอบฉายที่เลือก |
| text-success | `#48684B` | ยืนยัน (สีตัวอักษร) | Verified, Upcoming |
| danger-banner-bg | `#F4E4DE` | ยืนยัน | แถบยืนยันลบบัญชี |
| text-primary-dark | `#171A18` (ใช้จริง v1) | ประมาณ | ข้อความบนพื้นครีม |
| text-muted-light | `#696D66` (บนพื้นครีม) / `#A3A89F` (บนพื้นเข้ม) (ใช้จริง v1) | ประมาณ | ข้อความรอง |
| danger | `#A34A32`, hover `#8A3D28` (ใช้จริง v1) | ประมาณ | ปุ่ม Confirm deletion, ลิงก์ Delete, ที่นั่งว่าง (P-09) |
| seat-available | แดง `#A34A32` ขอบ `#C77B62` ตัวอักษร `#F7F1E8` (ใช้จริง v1) | ปรับตามข้อกำหนดผู้ใช้ | ที่นั่งว่าง — ต่างจากแบบ Figma (ขอบครีมบนพื้นเข้ม) ดูหมวดล่าง |
| seat-booked | `#3A4038` ตัวอักษร `#6E736B` (ใช้จริง v1) | ประมาณ | ที่นั่งถูกจอง |
| gold-pressed | `#B39F6E` (ใช้จริง v1) | ประมาณ | สถานะกดของปุ่ม/ตัวเลือกหลัก |
| overlay-dark | `rgba(16,18,17,0.62)` (ใช้จริง v1) | ประมาณ | พื้นหลัง dialog/overlay |

## ตัวอักษร (ระบุจากรูปทรง ยังไม่ยืนยันชื่อฟอนต์)

- หัวข้อ/ตัวเลขเด่น: เซอริฟทรง Cormorant Garamond, ตัวเลขเป็น old-style figures (เช่น 8,432 และ ฿960)
- เนื้อหา/ปุ่ม/ฟอร์ม: ซานส์ทรง Inter
- ป้ายหัวข้อเล็ก: ตัวพิมพ์ใหญ่ ตัวอักษรห่าง (เช่น WELCOME TO MAISON)
- ข้อความภาษาไทย: PDF ไม่มีตัวอย่าง ต้องเลือกฟอนต์ไทยเพิ่มเอง (เช่น Noto Sans Thai)

## รูปร่าง

- ปุ่มและช่อง input: มุมโค้งเล็กน้อย (ประมาณ 6 px) การ์ดมุมโค้งประมาณ 8 px (ประมาณ ยังไม่ได้วัด)
- พื้นที่เนื้อหากว้างสุดประมาณ 1458 px จากขอบ 71 ถึง 1529 ในภาพ 1600 px (ประมาณ)

## ค่าที่ใช้จริงใน v1 (บันทึกการปรับจากค่าประมาณ)

ค่าประมาณข้างต้นถูกกำหนดเป็นค่าจริงใน `assets/css/styles.css` เมื่อ 14 ตุลาคม 2026 — ยังไม่ใช่ค่าที่ sample จาก Figma และต้องตรวจ contrast/ความเหมาะสมอีกครั้งเมื่อตรวจภาพจริงได้ (P-01):

- **สี:** `--danger #A34A32`, `--danger-hover #8A3D28`, `--text-on-light #171A18`, `--text-muted-on-light #696D66`, `--text-on-dark #F2EFE7`, `--text-muted-on-dark #A3A89F`, `--seat-booked #3A4038`, `--gold-pressed #B39F6E`, `--overlay-dark rgba(16,18,17,0.62)`, ขอบที่นั่งว่าง `#C77B62`, ตัวอักษรบนที่นั่งว่าง `#F7F1E8`, ตัวอักษรที่นั่งจองแล้ว `#6E736B`
- **ฟอนต์:** display = Cormorant Garamond + Noto Serif Thai, body = Inter + Noto Sans Thai (Google Fonts)
- **ระยะ/ขนาด:** container 1220px, radius 6px (ปุ่ม/input) / 8px (การ์ด), header สูง 72px, breakpoints 1080/720px
- **การปรับจากแบบ Figma (P-09):** ที่นั่งว่างเปลี่ยนจาก "ขอบครีมบนพื้นเข้ม" เป็นสีแดงตามข้อกำหนดผู้ใช้; เหตุผล = โจทย์ผู้ใช้กำหนดสีที่นั่งว่าง=แดง/จองแล้ว=เทาไว้ก่อนที่จะอ่านแบบ; จุดที่ใช้ = ปุ่ม `.seat` และ legend `.sw-free` บน seats.html ทั้งหมด; ลดการพึ่งสีอย่างเดียวด้วยข้อความ legend และ cursor/สถานะ disabled
- **v1.4 (contrast เฉพาะ component ไม่เปลี่ยน token):** `.theme-light .btn-ghost` เดิมใช้ข้อความ `--text-on-light #171A18` + ขอบ `--border-card-light #E7E5DD` เมื่ออยู่ใน header `--bg-dark #101211` ทำให้อ่านยาก; เปลี่ยนเฉพาะ `.site-header .btn-ghost` เป็นข้อความ `--text-on-dark #F2EFE7` + ขอบ `--accent-gold #C9B485` และ hover สีทอง (หน้า login/admin และหน้าโทนสว่างอื่น). `.modal .btn-secondary` บนพื้น `--surface-light #FAF8F2` เดิมถูกกฎ theme-dark เปลี่ยนข้อความเป็น `--text-on-dark`; ตัดกฎนั้นเฉพาะ modal เพื่อใช้ข้อความ `--text-on-light` ตามปุ่มรองพื้นสว่าง. ค่า token ทุกตัวคงเดิม

## รายการหน้าใน Figma (14 หน้า)

| หน้า | เนื้อหา | อยู่ในขอบเขต v1 |
|---|---|---|
| 1 | Sign in | ทำ |
| 2 | Register + กล่อง Verify your email | ทำ ตัดกล่อง/ขั้นตอน verify |
| 3 | My account, Change password | ทำ |
| 4 | Home (hero, Top 5, โปรโมชัน, Coming soon) | ทำ ตัดปุ่ม Watch trailer |
| 5 | Movies (ค้นหา, กรองประเภท, ตาราง 8 เรื่อง) | ทำ |
| 6 | Movie detail + เลือกวัน/รอบ | ทำ ตัด Watch trailer |
| 7 | Seat selection + สรุปราคา | ทำ ตัด timer "Seats held" ถ้าไม่มี hold จริง (P-03) |
| 8 | Review and pay | ทำเฉพาะสรุปและยืนยันการจอง ไม่รับข้อมูลบัตร (P-02) |
| 9 | Your ticket (ยืนยันการจอง) | ทำ ตัดบาร์โค้ด/QR และปุ่ม Download ticket |
| 10 | My bookings (Purchase history) | ทำ |
| 11 | Offers + Redeem code | ทำ |
| 12 | Admin overview (สถิติ) | ทำ ติดป้ายข้อมูลตัวอย่างจนกว่าจะนิยามตัวเลข (P-04) |
| 13 | Admin accounts (สิทธิ์, ลบบัญชี) | ทำ ต้องตัดสินนโยบายลบ (P-07) |
| 14 | Admin movies (เพิ่ม/แก้/ลบหนัง) | ทำ ต้องตัดสินนโยบายลบ (P-07) |

## ความไม่สอดคล้องของ Figma ที่ต้องรู้ก่อนทำ UI

- Admin overview ใช้ "Total visitors" และ "User service revenue" (ค่าบริการ ฿30 ต่อตั๋ว ไม่ใช่ราคาตั๋ว) ต่างจากที่ P-04 เข้าใจ ต้องยืนยันนิยามกับผู้สอน
- หน้า 8 มีบรรทัด "This is an illustrative checkout. No payment is processed in this design." ใช้เป็นข้อความกำกับได้
- ข้อความ "Valid on Wednesdays only" ของ MAISON20 ขัดกับโปรโมชัน 2 ใบในหน้า 11 ต้องกำหนดกติกาโปรโมชันให้ตรงกัน
