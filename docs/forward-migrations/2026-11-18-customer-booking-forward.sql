-- Golden Films production forward migration: customer accounts and manual slot booking.
-- Prepared against the 2026-11-18 production D1 export.
-- Additive only: creates five booking tables and their indexes.
-- Does not alter existing tables, rows, admin roles, enquiries, or CMS content.
-- Apply only after a fresh production backup and successful disposable-restore test.
-- No slots are seeded: administrators must explicitly create bookable availability.

CREATE TABLE IF NOT EXISTS customer_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  phone TEXT NOT NULL CHECK (length(phone) BETWEEN 7 AND 30),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS booking_slots (
  id TEXT PRIMARY KEY,
  service_slug TEXT NOT NULL,
  slot_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'blocked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  CHECK (length(service_slug) BETWEEN 2 AND 80),
  CHECK (slot_date GLOB '????-??-??'),
  CHECK (ends_at > starts_at),
  UNIQUE(service_slug, slot_date, starts_at, ends_at)
);
CREATE INDEX IF NOT EXISTS idx_booking_slots_available
  ON booking_slots(status, slot_date, service_slug, starts_at);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  slot_id TEXT NOT NULL REFERENCES booking_slots(id) ON DELETE RESTRICT,
  service_slug TEXT NOT NULL,
  customer_note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_one_active_per_slot
  ON bookings(slot_id) WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_bookings_customer_created
  ON bookings(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status_created
  ON bookings(status, created_at DESC);

CREATE TABLE IF NOT EXISTS booking_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1
);
