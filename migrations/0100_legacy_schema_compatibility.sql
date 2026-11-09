-- Golden Films: additive compatibility migration for the deployed legacy D1 schema.
-- Apply ONLY after exporting and verifying a full D1 SQL backup.
-- This migration preserves existing rows and does not drop or rename any table.

-- Align existing bilingual project translations with the current Worker contract.
ALTER TABLE project_translations ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE project_translations ADD COLUMN alt_text TEXT NOT NULL DEFAULT '';
UPDATE project_translations SET language = locale WHERE locale IN ('en', 'hi');

-- Add explicit consent tracking for new enquiries. Historical rows remain unconsented (0).
ALTER TABLE enquiries ADD COLUMN consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0, 1));

-- Existing admins default to editor; the initial setup flow explicitly creates the first owner.
ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor'));

-- Customer accounts and sessions.
CREATE TABLE IF NOT EXISTS customer_users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY,
  customer_user_id TEXT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_user ON customer_sessions(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at);

-- Draft/published page content and revision history.
CREATE TABLE IF NOT EXISTS site_content (
  page_slug TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL DEFAULT '{}',
  published_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS site_content_revisions (
  id TEXT PRIMARY KEY,
  page_slug TEXT NOT NULL,
  content_json TEXT NOT NULL,
  revision_status TEXT NOT NULL CHECK (revision_status IN ('draft', 'published')),
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_content_revisions_page_created
  ON site_content_revisions(page_slug, created_at DESC);

-- Storage upload quota ledger and retryable deletion jobs.
CREATE TABLE IF NOT EXISTS gf_monthly_media_usage (
  month_key TEXT PRIMARY KEY,
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gf_media_cleanup_jobs (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed', 'complete')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gf_media_cleanup_jobs_media_status
  ON gf_media_cleanup_jobs(media_id, status, created_at DESC);
