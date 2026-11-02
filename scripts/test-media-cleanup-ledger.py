#!/usr/bin/env python3
"""Validate the media-cleanup ledger migration on a disposable SQLite database.

This is a synthetic schema/constraint test only. It does not connect to Cloudflare
D1 or Supabase and is not production-backup or live-storage verification.
"""
from pathlib import Path
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0101_gf_media_cleanup_jobs.sql"

with tempfile.TemporaryDirectory() as tmp:
    db_path = Path(tmp) / "cleanup-ledger.sqlite"
    db = sqlite3.connect(db_path)
    db.execute("CREATE TABLE unrelated_legacy_rows (id TEXT PRIMARY KEY, value TEXT NOT NULL)")
    db.execute("INSERT INTO unrelated_legacy_rows VALUES (?, ?)", ("preserve-me", "unchanged"))
    db.commit()

    migration = MIGRATION.read_text(encoding="utf-8")
    db.executescript(migration)
    # Re-running the additive migration must be safe and idempotent.
    db.executescript(migration)

    row = db.execute(
        "SELECT id, value FROM unrelated_legacy_rows WHERE id = ?", ("preserve-me",)
    ).fetchone()
    assert row == ("preserve-me", "unchanged"), f"legacy row changed: {row}"

    columns = {r[1] for r in db.execute("PRAGMA table_info(gf_media_cleanup_jobs)")}
    expected = {
        "id", "media_id", "project_id", "storage_key", "status", "attempt_count",
        "last_error_code", "created_at", "updated_at", "completed_at",
    }
    assert expected <= columns, f"missing columns: {sorted(expected - columns)}"

    indexes = {r[1] for r in db.execute("PRAGMA index_list(gf_media_cleanup_jobs)")}
    assert "idx_gf_media_cleanup_jobs_retry" in indexes
    assert "idx_gf_media_cleanup_jobs_media" in indexes

    db.execute(
        """INSERT INTO gf_media_cleanup_jobs
           (id, media_id, project_id, storage_key) VALUES (?, ?, ?, ?)""",
        ("job-1", "media-1", "project-1", "projects/project-1/image.jpg"),
    )
    valid = db.execute(
        "SELECT status, attempt_count FROM gf_media_cleanup_jobs WHERE id = 'job-1'"
    ).fetchone()
    assert valid == ("pending", 0), f"unexpected defaults: {valid}"

    invalid_cases = [
        ("empty-key", "media-2", "project-1", "   ", "pending", 0, None),
        ("bad-status", "media-3", "project-1", "valid/key.jpg", "running", 0, None),
        ("negative-attempts", "media-4", "project-1", "valid/key.jpg", "pending", -1, None),
        ("long-error", "media-5", "project-1", "valid/key.jpg", "failed", 1, "x" * 81),
    ]
    for jid, mid, pid, key, status, attempts, error in invalid_cases:
        db.execute("SAVEPOINT invalid_case")
        try:
            db.execute(
                """INSERT INTO gf_media_cleanup_jobs
                   (id, media_id, project_id, storage_key, status, attempt_count, last_error_code)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (jid, mid, pid, key, status, attempts, error),
            )
        except sqlite3.IntegrityError:
            db.execute("ROLLBACK TO invalid_case")
            db.execute("RELEASE invalid_case")
        else:
            db.execute("ROLLBACK TO invalid_case")
            db.execute("RELEASE invalid_case")
            raise AssertionError(f"constraint failed to reject invalid case: {jid}")

    db.execute(
        """UPDATE gf_media_cleanup_jobs
           SET status='failed', attempt_count=1, last_error_code='storage_unavailable'
           WHERE id='job-1'"""
    )
    assert db.execute(
        "SELECT status, attempt_count FROM gf_media_cleanup_jobs WHERE id='job-1'"
    ).fetchone() == ("failed", 1)

    db.execute(
        """UPDATE gf_media_cleanup_jobs
           SET status='complete', completed_at=datetime('now'), updated_at=datetime('now')
           WHERE id='job-1'"""
    )
    assert db.execute(
        "SELECT status, completed_at IS NOT NULL FROM gf_media_cleanup_jobs WHERE id='job-1'"
    ).fetchone() == ("complete", 1)

    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    db.close()

print("Media cleanup ledger SQLite fixture passed: idempotency, schema, indexes, constraints, state transitions, and legacy-row preservation.")
