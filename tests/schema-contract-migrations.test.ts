import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationFiles = [
  "0001_initial_schema.sql",
  "0002_enquiry_rate_limits.sql",
  "0003_admin_auth_foundation.sql",
  "0004_site_content_cms.sql",
  "0005_admin_roles.sql",
  "0006_worker_schema_compat.sql",
  "0100_customer_auth_foundation.sql",
  "0101_gf_media_cleanup_jobs.sql",
];

const migrations = migrationFiles
  .map((file) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"))
  .join("\n");

const workerContract: Record<string, string[]> = {
  categories: ["id", "slug", "sort_order", "title_en", "title_hi"],
  projects: ["id", "slug", "category_slug", "cover_image_url", "status", "is_featured", "project_date", "updated_at", "demo_label"],
  project_translations: ["project_id", "locale", "title", "description"],
  project_media: ["id", "project_id", "media_type", "preview_url", "original_key", "alt_en", "alt_hi", "sort_order", "is_public"],
  enquiries: ["id", "name", "email", "phone", "service", "preferred_date", "budget_range", "message", "consent", "status", "created_at", "updated_at"],
  enquiry_rate_limits: ["ip_hash", "window_start", "request_count"],
  admin_users: ["id", "email", "password_hash", "password_salt", "role", "is_active"],
  admin_sessions: ["id", "admin_user_id", "token_hash", "expires_at"],
  customer_users: ["id", "full_name", "email", "phone", "password_hash", "password_salt", "is_active", "created_at", "updated_at", "last_login_at"],
  customer_sessions: ["id", "customer_user_id", "token_hash", "expires_at", "created_at", "last_seen_at"],
  admin_setup: ["id", "completed_at"],
  auth_rate_limits: ["rate_key", "window_started_at", "request_count"],
  audit_logs: ["id", "admin_user_id", "action", "target_type", "target_id", "created_at"],
  site_content: ["page_slug", "draft_json", "published_json", "status", "updated_at"],
  site_content_revisions: ["id", "page_slug", "content_json", "revision_status", "created_at"],
  gf_media_cleanup_jobs: ["id", "media_id", "project_id", "storage_key", "status", "attempt_count", "last_error_code", "created_at", "updated_at", "completed_at"],
};

function tableBody(table: string): string | null {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migrations.match(new RegExp(
    `CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+["\x60]?${escaped}["\x60]?\\s*\\(([\\s\\S]*?)\\); `.trim(),
    "i",
  ));
  return match?.[1] ?? null;
}

function columnExists(table: string, column: string): boolean {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedColumn = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = tableBody(table);
  const inCreate = body !== null && new RegExp(
    `(?:^|[,\\n])\\s*["\x60]?${escapedColumn}["\x60]?\\s+(?:TEXT|INTEGER|REAL|BLOB|NUMERIC|VARCHAR|BOOLEAN)\\b`,
    "i",
  ).test(body);
  const inAlter = new RegExp(
    `ALTER\\s+TABLE\\s+["\x60]?${escapedTable}["\x60]?\\s+ADD\\s+COLUMN\\s+["\x60]?${escapedColumn}["\x60]?\\b`,
    "i",
  ).test(migrations);
  return inCreate || inAlter;
}

test("repository migration sequence defines every Worker readiness table and column", () => {
  const missing: string[] = [];
  for (const [table, columns] of Object.entries(workerContract)) {
    if (!tableBody(table)) missing.push(`${table} (table)`);
    for (const column of columns) {
      if (!columnExists(table, column)) missing.push(`${table}.${column}`);
    }
  }
  assert.deepEqual(missing, [], `Worker schema contract missing from migrations: ${missing.join(", ")}`);
});

test("compatibility migration preserves key relationship and least-privilege guards", () => {
  assert.match(migrations, /CREATE\s+UNIQUE\s+INDEX[^;]*project_translations_project_locale/i);
  assert.match(migrations, /REFERENCES\s+projects\s*\(id\)\s+ON\s+DELETE\s+CASCADE/i);
  assert.match(migrations, /role\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+['"]editor['"]/i);
  assert.doesNotMatch(migrations, /UPDATE\s+enquiries\s+SET\s+consent\s*=\s*1\b/i);
});


const liveForwardMigration = readFileSync(
  new URL("../docs/forward-migrations/2026-10-29-live-schema-forward.sql", import.meta.url),
  "utf8",
);

test("live forward migration preserves translations and supports Worker language/locale upserts", () => {
  assert.match(liveForwardMigration, /CREATE\s+TABLE\s+project_translations_new/i);
  assert.match(
    liveForwardMigration,
    /INSERT\s+INTO\s+project_translations_new\s*\(project_id,\s*language,\s*title,\s*description,\s*alt_text,\s*locale\)\s*SELECT\s+project_id,\s*locale,\s*title,\s*description,\s*'',\s*locale\s+FROM\s+project_translations/is,
  );
  assert.match(
    liveForwardMigration,
    /CREATE\s+UNIQUE\s+INDEX\s+idx_project_translations_project_locale\s+ON\s+project_translations\s*\(project_id,\s*locale\)/i,
  );
  assert.match(liveForwardMigration, /DROP\s+TABLE\s+project_translations/i);
  assert.match(liveForwardMigration, /ALTER\s+TABLE\s+project_translations_new\s+RENAME\s+TO\s+project_translations/i);
});


test("media cleanup ledger migration enforces retry state and safe storage keys", () => {
  const cleanupMigration = readFileSync(
    new URL("../migrations/0101_gf_media_cleanup_jobs.sql", import.meta.url),
    "utf8",
  );
  assert.match(cleanupMigration, /storage_key TEXT NOT NULL CHECK \(length\(trim\(storage_key\)\) > 0\)/i);
  assert.match(cleanupMigration, /status TEXT NOT NULL DEFAULT 'pending'[\s\S]*CHECK \(status IN \('pending', 'failed', 'complete'\)\)/i);
  assert.match(cleanupMigration, /attempt_count INTEGER NOT NULL DEFAULT 0 CHECK \(attempt_count >= 0\)/i);
  assert.match(cleanupMigration, /length\(last_error_code\) <= 80/i);
  assert.match(cleanupMigration, /idx_gf_media_cleanup_jobs_retry/i);
  assert.match(cleanupMigration, /idx_gf_media_cleanup_jobs_media/i);
  assert.doesNotMatch(cleanupMigration, /^\\s*(UPDATE|DELETE|DROP)\\b/im);
});
