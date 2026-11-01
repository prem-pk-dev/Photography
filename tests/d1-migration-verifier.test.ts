import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../scripts/verify-d1-migration.sql", import.meta.url), "utf8");
const audit = await readFile(new URL("../scripts/audit-d1-schema.sql", import.meta.url), "utf8");
const statements = sql
  .replace(/--[^\n]*/g, "")
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

test("D1 migration verifier contains only read-only SELECT and PRAGMA statements", () => {
  assert.ok(statements.length >= 12, "expected a useful set of verification statements");
  for (const statement of statements) {
    assert.match(statement, /^(SELECT|PRAGMA)\b/i, `unexpected non-read-only statement: ${statement.slice(0, 80)}`);
  }
  assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|ATTACH|DETACH)\b/im);
});

test("migration verifier compares the actual live Golden Films tables", () => {
  for (const table of ["categories", "projects", "project_translations", "project_media", "enquiries", "admin_users", "admin_sessions", "audit_logs"]) {
    assert.match(sql, new RegExp(`FROM ${table}\\b`, "i"), `missing row-count or data check for ${table}`);
  }
  assert.match(sql, /p\.category_slug/i);
  assert.match(sql, /pm\.project_id/i);
  assert.match(sql, /PRAGMA foreign_key_check/i);
});

test("migration verifier checks additive consent, role and CMS schema without writing", () => {
  assert.match(sql, /consent NOT IN \(0,1\)/i);
  assert.match(sql, /role NOT IN \('owner','editor'\)/i);
  assert.match(sql, /PRAGMA table_info\('site_content'\)/i);
  assert.match(sql, /PRAGMA table_info\('site_content_revisions'\)/i);
  assert.match(sql, /email is still NOT NULL/i);
});

test("schema audit matches live table and column names", () => {
  assert.match(audit, /pragma_table_info\(e\.table_name\)/i);
  for (const table of ["categories", "projects", "project_translations", "project_media", "enquiries", "enquiry_rate_limits", "admin_users", "admin_sessions", "admin_setup", "auth_rate_limits", "audit_logs", "site_content", "site_content_revisions"]) {
    assert.match(audit, new RegExp(`\\["${table}","`, "i"), `missing live schema table ${table}`);
  }
  assert.match(audit, /\["enquiries","email",1\]/i);
  assert.match(audit, /INCOMPATIBLE_NOT_NULL/i);
  assert.doesNotMatch(audit, /category_translations|cover_object_key|is_public_preview/);
});

test("schema audit is read-only and reports missing required columns", () => {
  assert.match(audit, /^\s*--[\s\S]*WITH expected/i);
  assert.match(audit, /WHEN NOT EXISTS \([\s\S]*THEN 'MISSING'/i);
  assert.doesNotMatch(audit, /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|ATTACH|DETACH)\b/im);
});


const forwardMigration = await readFile(
  new URL("../docs/forward-migrations/2026-10-29-live-schema-forward.sql", import.meta.url),
  "utf8",
);
const migrationFixture = await readFile(
  new URL("../scripts/test-forward-migration.py", import.meta.url),
  "utf8",
);
const workflow = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

test("production D1 migration is gated on a verified export and disposable restore", () => {
  assert.match(
    forwardMigration,
    /DO NOT run against production until a verified D1 export has been restored to\s*-- a disposable database/i,
    "migration must explicitly block production use before backup restore validation",
  );
  assert.match(
    forwardMigration,
    /Historical enquiries receive consent=0/i,
    "migration must not infer historical consent",
  );
  assert.match(
    migrationFixture,
    /preserve every captured legacy column value/i,
    "fixture must compare actual legacy values, not only row counts",
  );
  assert.match(
    workflow,
    /python3 scripts\/test-forward-migration\.py/,
    "CI must run the data-preservation migration fixture",
  );
});

test("database recovery and migration checks are non-destructive by default", () => {
  for (const [label, source] of [
    ["live schema audit", audit],
    ["migration verifier", sql],
  ]) {
    assert.doesNotMatch(
      source,
      /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|ATTACH|DETACH)\b/im,
      `${label} must remain read-only`,
    );
  }
  assert.match(
    migrationFixture,
    /TemporaryDirectory\(\)/,
    "migration rehearsal must use a disposable temporary SQLite database",
  );
  assert.match(
    migrationFixture,
    /PRAGMA foreign_key_check/i,
    "migration rehearsal must check referential integrity before acceptance",
  );
});
