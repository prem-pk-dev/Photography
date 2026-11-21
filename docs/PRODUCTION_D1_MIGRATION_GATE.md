# Production D1 Migration Gate — Golden Films

**Status: BLOCKED — Production D1 writes and migrations are not authorized.**

Last read-only audit: **2026-11-21**. This document distinguishes current live-schema evidence from migration-history and backup evidence that is still missing.

## Current verified Production state

Target: Cloudflare D1 database `golden-films-db`, ID `0241231b-6e6c-410b-a5ac-958eeb424a78`.

A direct Cloudflare Pages deployment inspection confirmed:
- Production Pages Functions are active (`uses_functions: true`).
- The Pages `DB` binding points to the Production D1 database above.
- `ADMIN_SETUP_SECRET` and `MEDIA_GITHUB_TOKEN` are listed as server-side secret bindings. Cloudflare configuration metadata redacts their values; their actual values and validity are **not** established by this inspection.

A read-only D1 catalog/PRAGMA audit on 2026-11-21 confirmed the following application tables exist:
- `categories`, `projects`, `project_translations`, `project_media`
- `enquiries`, `enquiry_rate_limits`
- `admin_users`, `admin_sessions`, `admin_setup`, `auth_rate_limits`
- `audit_logs`, `site_content`, `site_content_revisions`, `site_settings`

The current queried columns include:
- `categories.title_en/title_hi`
- `projects.category_slug/cover_image_url/is_featured/project_date/demo_label`
- `project_translations.locale`
- `project_media.preview_url/original_key/alt_en/alt_hi/is_public`
- `enquiries.consent`
- `admin_users.role`
- CMS tables `site_content` and `site_content_revisions`

This supersedes the **2026-10-29** audit notes below that reported missing `enquiries.consent`, `admin_users.role`, and CMS tables. Those columns/tables are now present in the live schema. The reason or exact change history that introduced them is not established by the available migration history.

The following read-only row counts were returned on 2026-11-21:
- `enquiries`: 0
- `admin_users`: 1
- `projects`: 0
- `project_media`: 0

No row contents, credentials, or customer records were read. The D1 query metadata reported `changed_db: false` and `rows_written: 0` for the audit queries.

**Still unknown:** there is no `d1_migrations` table, so the exact migration history cannot be reconstructed from D1. No Production export has been downloaded and restored into a disposable D1 database. The audit did not prove preservation of historical rows through a migration, nor did it call the live `/api/ready` endpoint.

## Why the migration gate remains blocked

- The current live schema is substantially aligned with the Worker contract for the tables inspected, but that does not establish which migrations were applied or whether every constraint, index, trigger, and foreign key matches the repository's migration files.
- `migrations/0001_initial_schema.sql` is not a safe blanket migration for this existing database. It defines a different baseline model, including `category_translations`, `category_id`, `cover_object_key`, and `media`, whereas the live Worker contract uses `categories.title_en/title_hi`, `category_slug`, `cover_image_url`, and `project_media`.
- A schema-only inspection cannot prove that an export can be restored or that a forward migration preserves all existing data.
- Cloudflare secret metadata redacts values. Presence in configuration metadata does not prove that a secret value is correct or that the corresponding feature works.
- A successful Pages build/deployment does not prove that every live API path or database write is correct.

## Mandatory preflight before any future Production D1 change

1. Reconfirm the account, database ID, Pages Production project, `DB` binding, and current deployment immediately before the change.
2. Do not start a D1 export without a deliberately planned maintenance window. The prior operational guidance warns that export can temporarily make the database unavailable; uninterrupted availability remains the priority.
3. Obtain an approved, recoverable export/backup; record its timestamp, checksum, and exact source database ID.
4. Restore that exact export into a **separate disposable D1 database**. Never use an in-place Production Time Travel restore as a test.
5. Capture `sqlite_master`, `PRAGMA table_info`, indexes, foreign keys, and relevant constraints from the restored copy.
6. Compare the restored schema against every SQL query and conditional write in `worker/index.ts`, not just the tables listed above.
7. Choose one canonical schema contract. Do not apply `0001`–`0006` blindly or infer historical migration state.
8. Apply the exact candidate forward-only migration to the disposable restore. Verify row counts, every legacy row value, relationships, indexes, foreign keys, defaults, nullability, and integrity before/after.
9. Run Worker tests against that migrated disposable database: readiness, public content, enquiry submission, owner setup (including repeat rejection), login/session/logout, role boundaries, content save/revision/publish, rate limits, and unauthenticated access rejection.
10. Repeat the restore-and-migrate test from a fresh copy and document exact commands, expected outputs, and recovery limits.
11. Verify Preview with its real bindings using read-only checks first; do not treat synthetic fixtures as live-database evidence.
12. Obtain explicit user approval **before any Production D1 write/migration, Production secret change, or Production binding change**.

Safe code-only PRs may still be merged after their own CI and Preview gates pass. That approval rule is specifically for Production data/configuration mutations; it does not block unrelated, verified code-only PRs.

## Release gates

- [ ] Verified Production export/backup restored into an isolated D1 database.
- [ ] Exact forward migration reviewed and tested against that restored copy.
- [ ] All existing rows, relationships, constraints, indexes, and defaults preserved or intentionally accounted for.
- [ ] Worker integration tests pass against the migrated disposable copy.
- [ ] Preview API readiness and required workflows verified with real bindings.
- [x] Production Pages Functions and `DB` binding confirmed in Cloudflare deployment metadata.
- [ ] Actual Production secret values validated through a safe server-side check; values must never be printed or shared.
- [ ] Explicit approval received before any Production D1 write/migration or secret/binding mutation.

## Historical audit notes (2026-10-29)

The earlier read-only audit reported:
- no `d1_migrations` table;
- `enquiries.consent` missing;
- `admin_users.role` missing;
- `site_content` and `site_content_revisions` missing;
- `enquiries.email` declared NOT NULL at that time.

The 2026-11-21 audit supersedes the missing-column/table findings for the live schema: consent, role, both CMS tables, and nullable `enquiries.email` are now present. The absence of `d1_migrations` remains. Do not infer how the schema changed.

## Worker versus baseline migration contract

The baseline migration model still differs from the current Worker contract:
- Worker category queries expect `categories.title_en` and `categories.title_hi`; baseline `0001` defines `category_translations(name, language)`.
- Worker project queries/writes expect `category_slug`, `cover_image_url`, `is_featured`, `project_date`, and `demo_label`; baseline `0001` defines `category_id`, `cover_object_key`, `featured`, and `event_date`.
- Worker project translations use `locale`; baseline `0001` defines `language`.
- Worker media uses `project_media` and `preview_url/original_key/alt_en/alt_hi/is_public`; baseline `0001` creates `media` with a different contract.
- Worker expects both `enquiry_rate_limits` and `auth_rate_limits`; they serve different purposes and must both be present.

These differences are why the baseline migration must not be applied blindly, even though the latest live schema audit now shows the Worker-facing columns are present.

## Least-privilege role migration guard

- Existing legacy admins must default to `editor`, not `owner`, when a role column is introduced.
- The initial-owner setup route may explicitly create `role='owner'` only when no admin account exists and setup is incomplete.
- Never promote an existing account automatically during migration. Any owner promotion must be deliberate and audited.
- The forward-migration fixture checks the default role and migrated legacy-account role are both `editor`.

## Current decision (2026-11-21)

- PR #81 (admin login, owner setup, dashboard, and Pages API bridge) was merged on 2026-10-30.
- PR #93 (GitHub-backed media upload and owner-only permanent delete) was merged on 2026-11-21.
- PR #94 (read-only Pages API smoke script) and PR #95 (health response header regression test) were merged on 2026-11-21.
- PR #63 was closed as superseded: the Pages API bridge and its relevant code are already in main; the smoke script and health-header coverage were delivered in later PRs.
- PR #87 was closed as superseded because Photography uses the GitHub-backed `PHOTOGRAPHY-MEDIA` path, not the old Supabase Storage implementation.
- No Production D1 migration, row write, owner creation, secret change, or binding change was performed by the 2026-11-21 read-only audit or these code-only PRs.
- Keep the Production D1 write/migration gate closed until the verified export/restore and explicit approval requirements above are met.
