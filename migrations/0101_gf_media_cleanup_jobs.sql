-- Durable outbox for owner-initiated media deletion.
-- Additive only. Test on an isolated Preview D1 first; never apply to Production
-- until a downloadable backup and restore procedure have been verified.
CREATE TABLE IF NOT EXISTS gf_media_cleanup_jobs (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  storage_key TEXT NOT NULL CHECK (length(trim(storage_key)) > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'failed', 'complete')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  CHECK (last_error_code IS NULL OR length(last_error_code) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_gf_media_cleanup_jobs_retry
  ON gf_media_cleanup_jobs(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_gf_media_cleanup_jobs_media
  ON gf_media_cleanup_jobs(media_id, project_id);
