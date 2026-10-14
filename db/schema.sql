-- =============================================================
-- MAISON Cinema — schema (Neon Postgres)
-- รันซ้ำได้ (idempotent): npm run db:migrate
-- ไม่มีตาราง showtimes — รอบฉายคำนวณจาก movies.hall_id/date_start/date_end/periods
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
  id          text PRIMARY KEY,
  username    text NOT NULL,
  email       text NOT NULL,
  pass_hash   text NOT NULL,
  role        text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

-- session ฝั่ง server (Rubric 9): เก็บ sha256 ของ token เท่านั้น
CREATE TABLE IF NOT EXISTS sessions (
  id_hash     text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remember    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- นับการเข้าสู่ระบบที่ล้มเหลว (rate limit)
CREATE TABLE IF NOT EXISTS login_attempts (
  identifier  text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts (identifier, at);

CREATE TABLE IF NOT EXISTS movies (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  genres        text[] NOT NULL DEFAULT '{}',
  price         integer NOT NULL CHECK (price >= 0 AND price <= 5000),
  duration_min  integer NOT NULL DEFAULT 0,
  age_rating    text NOT NULL DEFAULT 'ยังไม่ประกาศ',
  director      text NOT NULL DEFAULT '',
  synopsis      text NOT NULL DEFAULT '',
  release_date  date,
  now_showing   boolean NOT NULL DEFAULT true,
  poster        text NOT NULL DEFAULT '',
  coming_days   integer,
  hall_id       text NOT NULL DEFAULT '',
  date_start    date,
  date_end      date,
  periods       text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS movies_title_lower_key ON movies (lower(title));

-- การจอง: เก็บ snapshot ชื่อหนัง/ราคา — ลบบัญชีหรือหนังแล้วประวัติยังอยู่
CREATE TABLE IF NOT EXISTS bookings (
  id           text PRIMARY KEY,
  code         text NOT NULL UNIQUE,
  user_id      text REFERENCES users(id) ON DELETE SET NULL,
  movie_id     text REFERENCES movies(id) ON DELETE SET NULL,
  movie_title  text NOT NULL,
  showtime_id  text NOT NULL,
  starts_at    timestamptz NOT NULL,
  hall         text NOT NULL,
  unit_price   integer NOT NULL,
  service_fee  integer NOT NULL,
  total        integer NOT NULL,
  status       text NOT NULL DEFAULT 'confirmed',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_created_idx ON bookings (created_at);
CREATE INDEX IF NOT EXISTS bookings_movie_idx ON bookings (movie_id);

-- ที่นั่งต่อการจอง: UNIQUE (showtime_id, seat_id) กันจองซ้อนแม้คำขอมาพร้อมกัน (P-03)
CREATE TABLE IF NOT EXISTS booking_seats (
  booking_id   text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  showtime_id  text NOT NULL,
  seat_id      text NOT NULL,
  seat_row     text NOT NULL,
  seat_number  integer NOT NULL,
  CONSTRAINT booking_seats_showtime_seat_key UNIQUE (showtime_id, seat_id)
);
CREATE INDEX IF NOT EXISTS booking_seats_booking_idx ON booking_seats (booking_id);

CREATE TABLE IF NOT EXISTS promotions (
  id          text PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  title       text NOT NULL,
  summary     text NOT NULL,
  details     text NOT NULL,
  terms       text[] NOT NULL DEFAULT '{}',
  image       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- กติกาคำนวณส่วนลด (ว่าง = โค้ดยังไม่เปิดให้คำนวณ) — ดู server/pricing.js
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS rule_type   text CHECK (rule_type IN ('percent_off', 'bundle_price', 'unit_price'));
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS rule_value  integer;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS weekday     smallint CHECK (weekday BETWEEN 0 AND 6);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS time_from   text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS time_to     text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS seat_count  smallint;

-- snapshot ส่วนลดในการจอง: ประวัติยังเห็นว่าลดเท่าไรแม้โปรถูกแก้/ลบ
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount   integer NOT NULL DEFAULT 0;
