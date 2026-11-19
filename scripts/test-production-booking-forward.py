#!/usr/bin/env python3
"""Test the production-specific booking migration on a disposable SQLite copy.

CI uses a minimal production-compatible schema fixture. Operators can additionally
pass a private D1 export with --backup; never commit that export to the repository.
"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "docs/forward-migrations/2026-11-18-customer-booking-forward.sql"


def fixture_db() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE admin_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('owner','editor'))
      );
      INSERT INTO admin_users(id,email,password_hash,password_salt,role)
      VALUES('admin-fixture','fixture@example.test','hash-fixture','salt-fixture','owner');

      CREATE TABLE enquiries (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT,
        phone TEXT NOT NULL DEFAULT '', service TEXT NOT NULL,
        preferred_date TEXT, budget_range TEXT, message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','read','archived')),
        created_at TEXT NOT NULL DEFAULT(datetime('now')),
        updated_at TEXT NOT NULL DEFAULT(datetime('now')),
        consent INTEGER NOT NULL DEFAULT 0 CHECK(consent IN (0,1))
      );
      INSERT INTO enquiries(id,name,email,phone,service,message,consent)
      VALUES('enquiry-fixture','Fixture Client',NULL,'9999999999','wedding','Keep me',1);

      CREATE TABLE site_content(page_slug TEXT PRIMARY KEY, draft_json TEXT NOT NULL DEFAULT '{}');
      INSERT INTO site_content(page_slug,draft_json) VALUES('home','{"fixture":true}');
      CREATE TABLE site_content_revisions(id TEXT PRIMARY KEY, page_slug TEXT NOT NULL);
      INSERT INTO site_content_revisions(id,page_slug) VALUES('revision-fixture','home');
      CREATE TABLE categories(id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE);
      INSERT INTO categories VALUES('category-fixture','wedding-photography');
    """)
    return db


def snapshot(db: sqlite3.Connection) -> dict[str, list[tuple]]:
    tables = ("admin_users", "enquiries", "site_content", "site_content_revisions", "categories")
    return {
        table: [tuple(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY rowid")]
        for table in tables
    }


def verify(db: sqlite3.Connection) -> None:
    before = snapshot(db)
    db.executescript(MIGRATION.read_text(encoding="utf-8"))
    after = snapshot(db)
    assert after == before, "Existing production rows or columns changed"

    expected = {
        "customer_accounts", "customer_sessions", "booking_slots",
        "bookings", "booking_rate_limits"
    }
    actual = {r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    assert expected <= actual, f"Missing booking tables: {sorted(expected - actual)}"

    required_indexes = {
        "idx_customer_sessions_expiry", "idx_booking_slots_available",
        "idx_bookings_one_active_per_slot", "idx_bookings_customer_created",
        "idx_bookings_status_created"
    }
    indexes = {r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='index'"
    )}
    assert required_indexes <= indexes, f"Missing indexes: {sorted(required_indexes - indexes)}"

    db.execute("""INSERT INTO customer_accounts
      (id,email,password_hash,password_salt,full_name,phone)
      VALUES('customer-fixture','customer@example.test','hash','salt','Test Customer','9876543210')""")
    db.execute("""INSERT INTO booking_slots
      (id,service_slug,slot_date,starts_at,ends_at,created_by)
      VALUES('slot-fixture','wedding-photography','2026-12-10','10:00','11:00','admin-fixture')""")
    db.execute("""INSERT INTO bookings(id,customer_id,slot_id,service_slug)
      VALUES('booking-fixture','customer-fixture','slot-fixture','wedding-photography')""")

    try:
        db.execute("""INSERT INTO bookings(id,customer_id,slot_id,service_slug)
          VALUES('booking-duplicate','customer-fixture','slot-fixture','wedding-photography')""")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Unique active-booking-per-slot constraint did not reject duplicate")

    db.execute("UPDATE bookings SET status='rejected' WHERE id='booking-fixture'")
    db.execute("""INSERT INTO bookings(id,customer_id,slot_id,service_slug)
      VALUES('booking-retry','customer-fixture','slot-fixture','wedding-photography')""")

    assert not list(db.execute("PRAGMA foreign_key_check")), "Foreign-key violations found"
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    print("PASS: additive migration, legacy-row preservation, five tables, indexes, booking constraints, FK and integrity checks")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", type=Path, help="Private SQL export path; do not commit it")
    args = parser.parse_args()
    if not MIGRATION.is_file():
        raise SystemExit(f"Migration not found: {MIGRATION}")
    if args.backup:
        sql = args.backup.read_text(encoding="utf-8")
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(sql)
        print(f"Loaded private backup: {args.backup.name}")
    else:
        db = fixture_db()
        print("Loaded CI production-compatible fixture")
    verify(db)


if __name__ == "__main__":
    main()
