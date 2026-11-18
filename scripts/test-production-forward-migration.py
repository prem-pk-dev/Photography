#!/usr/bin/env python3
"""Rehearse the additive booking migration against a fixture of the inspected live D1 schema.

This is NOT a backup restore and must never be treated as authorization to migrate Production.
The DDL below is captured from the read-only Production sqlite_master catalog (2026-11-18).
"""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0007_customer_booking_foundation.sql"

LIVE_SCHEMA = r"""
CREATE TABLE categories (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0,
 title_en TEXT NOT NULL, title_hi TEXT NOT NULL, description_en TEXT NOT NULL DEFAULT '',
 description_hi TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE projects (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, category_slug TEXT NOT NULL REFERENCES categories(slug),
 cover_image_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
 is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)), location TEXT, project_date TEXT,
 demo_label TEXT NOT NULL DEFAULT 'Demo Portfolio', created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE project_translations (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 locale TEXT NOT NULL CHECK (locale IN ('en','hi')), title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', PRIMARY KEY (project_id, locale)
);
CREATE TABLE project_media (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 media_type TEXT NOT NULL CHECK (media_type IN ('image','video')), preview_url TEXT NOT NULL,
 original_key TEXT, alt_en TEXT NOT NULL DEFAULT '', alt_hi TEXT NOT NULL DEFAULT '',
 sort_order INTEGER NOT NULL DEFAULT 0, is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE admin_users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL, email_verified_at TEXT, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login_at TEXT,
 role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','editor'))
);
CREATE TABLE admin_sessions (
 id TEXT PRIMARY KEY, admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 last_seen_at TEXT
);
CREATE TABLE admin_setup (id INTEGER PRIMARY KEY CHECK (id=1), completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE auth_rate_limits (rate_key TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, request_count INTEGER NOT NULL DEFAULT 1);
CREATE TABLE audit_logs (
 id TEXT PRIMARY KEY, admin_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL, action TEXT NOT NULL,
 target_type TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE enquiries (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT NOT NULL DEFAULT '', service TEXT NOT NULL,
 preferred_date TEXT, budget_range TEXT, message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0,1))
);
CREATE TABLE enquiry_rate_limits (
 ip_hash TEXT NOT NULL, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count>=0),
 PRIMARY KEY (ip_hash, window_start)
);
CREATE TABLE site_content (
 page_slug TEXT PRIMARY KEY CHECK (page_slug IN ('home','about','services','showreel','contact')),
 draft_json TEXT NOT NULL DEFAULT '{}', published_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
 updated_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), published_at TEXT
);
CREATE TABLE site_content_revisions (
 id TEXT PRIMARY KEY, page_slug TEXT NOT NULL CHECK (page_slug IN ('home','about','services','showreel','contact')),
 content_json TEXT NOT NULL, revision_status TEXT NOT NULL CHECK (revision_status IN ('draft','published')),
 changed_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE site_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_enquiries_status_created ON enquiries(status, created_at DESC);
CREATE INDEX idx_enquiry_rate_limits_window ON enquiry_rate_limits(window_start);
CREATE INDEX idx_media_project_sort ON project_media(project_id, sort_order);
CREATE INDEX idx_projects_category ON projects(category_slug, status, updated_at DESC);
CREATE INDEX idx_projects_status_featured ON projects(status, is_featured, updated_at DESC);
CREATE INDEX idx_sessions_expiry ON admin_sessions(expires_at);
CREATE INDEX idx_site_content_revisions_page_created ON site_content_revisions(page_slug, created_at DESC);
"""

def must_fail(db: sqlite3.Connection, sql: str, message: str) -> None:
    try:
        db.execute(sql)
    except sqlite3.IntegrityError:
        return
    raise AssertionError(message)

def main() -> None:
    if not MIGRATION.exists():
        raise AssertionError(f"Missing migration: {MIGRATION}")
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(LIVE_SCHEMA)

    # Synthetic sentinels only; no Production row values are copied into this test.
    db.execute("INSERT INTO categories(id,slug,title_en,title_hi) VALUES('cat','wedding-photography','Wedding','शादी')")
    db.execute("INSERT INTO admin_users(id,email,password_hash,password_salt,role) VALUES('owner','owner@example.test','hash','salt','owner')")
    db.execute("INSERT INTO admin_setup(id,completed_at) VALUES(1,'2026-11-17')")
    db.execute("INSERT INTO enquiries(id,name,service,message,consent) VALUES('enq','Test','wedding','hello',1)")
    db.execute("INSERT INTO site_content(page_slug,draft_json) VALUES(?,?)", ("home", '{"keep":true}'))
    db.execute("INSERT INTO site_content_revisions(id,page_slug,content_json,revision_status) VALUES('rev','home','{}','draft')")
    db.commit()

    db.executescript(MIGRATION.read_text(encoding="utf-8"))

    required_tables = {"customer_accounts","customer_sessions","booking_slots","bookings","booking_rate_limits"}
    actual_tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert required_tables <= actual_tables, required_tables - actual_tables
    for table, where in [
        ("categories", "id='cat'"), ("admin_users", "id='owner' AND role='owner'"),
        ("admin_setup", "id=1"), ("enquiries", "id='enq' AND consent=1"),
        ("site_content", "page_slug='home' AND draft_json LIKE '%keep%'"),
        ("site_content_revisions", "id='rev'"),
    ]:
        assert db.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}").fetchone()[0] == 1, table

    db.execute("INSERT INTO customer_accounts(id,email,password_hash,password_salt,full_name,phone) VALUES('c','c@example.test','h','s','Customer','1234567')")
    db.execute("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('cs','c','token-hash','2099-01-01')")
    db.execute("INSERT INTO booking_slots(id,service_slug,slot_date,starts_at,ends_at,created_by) VALUES('s','wedding','2026-12-01','10:00','11:00','owner')")
    db.execute("INSERT INTO bookings(id,customer_id,slot_id,service_slug) VALUES('b','c','s','wedding')")
    must_fail(db, "INSERT INTO bookings(id,customer_id,slot_id,service_slug) VALUES('b2','c','s','wedding')",
              "More than one pending/confirmed booking was allowed for one slot")
    must_fail(db, "INSERT INTO booking_slots(id,service_slug,slot_date,starts_at,ends_at) VALUES('bad','wedding','2026-12-02','11:00','10:00')",
              "Invalid slot interval was accepted")
    must_fail(db, "INSERT INTO customer_accounts(id,email,password_hash,password_salt,full_name,phone) VALUES('bad','C@example.test','h','s','Customer','1234567')",
              "Case-insensitive duplicate customer email was accepted")
    assert not list(db.execute("PRAGMA foreign_key_check")), "Foreign-key violations after rehearsal"

    indexes = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")}
    expected = {"idx_customer_sessions_expiry","idx_booking_slots_available","idx_bookings_one_active_per_slot",
                "idx_bookings_customer_created","idx_bookings_status_created"}
    assert expected <= indexes, expected - indexes
    print("PASS: 14-table live-schema fixture + migration 0007; core sentinel rows preserved; five tables/five indexes created; booking constraints and FK integrity verified.")
    print(f"Tables: {len(actual_tables)}; indexes: {len(indexes)}")

if __name__ == "__main__":
    main()
