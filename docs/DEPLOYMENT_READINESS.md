# Cloudflare Deployment Readiness

Last checked: 2026-11-01

## Final backend release audit

**Release decision: BLOCKED for production writes / merge.** The current branch's automated checks pass and its Preview deployment succeeds. Production D1 schema drift remains confirmed. The earlier Preview binding/schema discrepancy was rechecked against the latest deployment and its configured D1 database; the required Preview columns are now present in that bound database. Do not interpret Preview readiness as proof that Production is compatible.

### Current deployment evidence

- Cloudflare Pages project: `golden-films`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- The latest functional backend code commit is `0af0a30e1152853dbc058d68debd164e45d2cdfa`; its Preview deployment build/deploy stages succeeded. The final audit documentation commit `d9156d011a9b655cf85e9ef26d5e47eea65e759e` is deployed successfully to Preview at `https://7a60f0a7.golden-films.pages.dev` (deployment `7a60f0a7-0c75-44c9-9397-6b835bba6caa`).
- Latest production deployment still points to the existing `main` commit `de77fe22b606ec64b2c5ba290cf7fde21b218120`; this audit did not deploy to Production.
- GitHub Actions runs #665 and #666 passed on functional backend commit `0af0a30e1152853dbc058d68debd164e45d2cdfa`; runs #669 and #670 passed on the final audit commit `290c707a251e9a518e4401876096483804b2265e`.
- CI covers typecheck, Worker API tests, migration fixture tests, fresh-schema fixture tests, frontend build, and deployed Preview health/readiness/admin-auth smoke checks.
- The latest Preview deployment metadata confirms its `DB` binding points to D1 ID `21f470cb-776a-4eb2-816e-16605139299a`. This is the same ID used for the direct schema recheck below.

### Read-only D1 schema findings (2026-11-01)

The Cloudflare D1 API returned `changed_db: false` and `rows_written: 0` for the schema inspection.

**Production D1 `golden-films-db`** has a legacy schema. Confirmed gaps versus the current Worker readiness contract include:

- `admin_users.role` is absent.
- `enquiries.consent` is absent.
- `project_translations.language` and `project_translations.alt_text` are absent.
- `site_content` and `site_content_revisions` tables are absent.
- `gf_monthly_media_usage` is absent.
- Production's `projects` and `categories` schemas are legacy versions and must be reconciled with the current Worker contract before write-capable release.

**Preview D1 — rechecked, binding/schema identity task complete:** the latest Cloudflare Pages deployment metadata confirms that Preview's `DB` binding points to D1 ID `21f470cb-776a-4eb2-816e-16605139299a`. A new read-only schema check against that exact ID confirms the required fields/tables are present: `admin_users.role`, `enquiries.consent`, `categories.slug`, `projects.slug/category_id/cover_object_key/status`, `project_translations.language/alt_text`, `site_content`, `site_content_revisions`, and `gf_monthly_media_usage.month_key/used_bytes`. The D1 API reported `changed_db: false` and `rows_written: 0` for all eight table checks. This supersedes the earlier Preview mismatch observation; it did not reproduce on the current bound database. CI run #666 previously confirmed `/api/ready` returned HTTP 200 and `status=ready` with no blockers. The exact latest Preview URL's `/api/ready` endpoint could not be independently fetched in this recheck, so rerun the live health/readiness smoke test in final release verification. This result applies only to Preview and does not resolve Production's legacy schema.

### Production backup / restore drill update (2026-11-01)

- Verified the Production D1 identity read-only: `golden-films-db`, ID `0241231b-6e6c-410b-a5ac-958eeb424a78`, version `production`.
- Cloudflare D1 export job returned `status=complete` and reported the SQL dump uploaded in one part.
- **The backup/restore task is not complete yet.** The generated download URL is temporary (one hour). The available execution environment denied fetching the R2 export URL (`403: requests to ...r2.cloudflarestorage.com are not allowed`), and the local runtime has no network DNS access. Therefore the SQL dump was not downloaded to durable storage and could not be restored into a disposable database/SQLite fixture. No Production DDL/DML was run, and no Production data was changed.
- Next safe step: download the export through an approved Cloudflare Dashboard/CLI environment with access to the temporary URL, retain the SQL dump securely, restore it to a disposable database, and compare table schemas plus per-table row counts. Do not mark the backup/restore gate complete until this succeeds.

### Supabase Storage configuration gate

The Cloudflare Pages project configuration returned a Preview storage bucket and Supabase URL, while the Production deployment configuration did not list `SUPABASE_SERVICE_ROLE_KEY`. The secret value itself is not inspected or disclosed. Before production media is enabled, configure the service-role secret through Cloudflare's secret-management UI or approved secret workflow, then verify only the readiness endpoint's boolean presence result. Never put the secret in Git or in logs.

### Required release blockers

1. ~~Start Production D1 export and verify Cloudflare reports completion.~~ **Export job completed 2026-11-01; durable download and restore remain blocked** by restricted access to the temporary R2 download URL (details above).
2. Download the SQL export to secure durable storage and restore it to a disposable database or isolated SQLite fixture.
3. Run the reviewed forward migration against the disposable copy and verify all data, keys, indexes, constraints, and foreign keys.
4. ~~Reconcile and validate the actual Preview D1 schema against the current Worker readiness contract.~~ **Completed 2026-11-01:** binding ID and required columns verified read-only; repeat live endpoint smoke checks in final verification.
5. Confirm production storage secret configuration without exposing the secret.
6. After explicit approval, perform the production migration with a verified recovery plan.
7. Re-run the deployed health/readiness and admin-auth checks against the intended deployment.
8. Perform safe synthetic enquiry and media-flow checks in an isolated environment.
9. Re-check all PR checks and review the final diff before considering merge.

The Production D1 export/restore drill and production migration have **not** been performed. No production DDL/DML, backup export, or merge was executed during this audit. The release gate remains closed until the blockers above are resolved.

## Safety rules

- Do not run `wrangler d1 migrations apply`, DDL, or DML against Production until the verified export has been restored to a disposable database and the exact migration passes there.
- Do not infer consent for historical enquiries. The reviewed migration assigns historical rows `consent=0`.
- Do not infer object-storage keys or delete/recreate existing records during schema reconciliation.
- Keep the workflow within the existing ₹0 budget; use free-tier resources only.
- Never commit API tokens, database credentials, or secrets to the repository.


### Disposable migration test — Task 3 (2026-11-01)

**Status: migration execution and targeted integrity checks passed on an isolated D1 test database.** No Production D1 writes were performed.

- Created isolated D1 database `golden-films-migration-test-20261101` (ID `da916979-7e0a-4200-99ad-76be0d00071c`).
- Applied the eight checked-in migrations from branch `feat/supabase-storage-free-tier`: `0001_initial_schema.sql`, `0002_enquiry_rate_limits.sql`, `0003_admin_auth_foundation.sql`, `0004_site_content_cms.sql`, `0005_admin_roles.sql`, `0006_worker_schema_compat.sql`, `0099_gf_monthly_media_usage.sql`, and `0100_customer_auth_foundation.sql`. Each API call returned success.
- Verified expected tables including `admin_users`, `admin_sessions`, `customer_users`, `customer_sessions`, `site_content`, `site_content_revisions`, `project_media`, and `gf_monthly_media_usage`; verified Worker compatibility columns in `categories`, `projects`, `project_translations`, and `enquiries`.
- Seed checks: 14 categories and 28 category translations; one `admin_setup` row. Project and enquiry tables are empty in this clean test database, as expected.
- Re-ran migrations that use `IF NOT EXISTS` / `INSERT OR IGNORE` (`0001`, `0002`, `0003`, `0004`, `0099`, `0100`); all succeeded without duplicate seed rows. Migrations `0005` and `0006` are intentionally fresh-schema / one-time ALTER migrations and are not treated as rerunnable.
- Targeted orphan-reference checks for project/category, media/project, project-media/project, project-translation/project, admin-session/admin-user, customer-session/customer-user, and site-content/admin-user relationships all returned 0 orphan rows.
- Cloudflare D1's query endpoint rejected `PRAGMA integrity_check` and `PRAGMA foreign_key_check` with `SQLITE_AUTH`; therefore those two native PRAGMA checks are not claimed as passed. Targeted read-only SQL checks passed instead.
- This validates the checked-in migrations on an empty disposable database. It does **not** validate a forward migration on a restored copy of Production data; that remains a separate backup/restore gate before Production changes.


### Focused live Production schema recheck — Task 3 follow-up (2026-11-01)

Read-only Cloudflare D1 API queries were run against Production database `golden-films-db` (ID `0241231b-6e6c-410b-a5ac-958eeb424a78`). All queries succeeded and inspected only `sqlite_master`; no Production DDL/DML was run.

Observed table definitions:
- `admin_users` has `last_login_at`, but no `role` column.
- `categories` already has `slug`, `title_en`, `title_hi`, `description_en`, and `description_hi`.
- `projects` already has `slug`, `category_slug`, `cover_image_url`, `status`, `is_featured`, `project_date`, and `demo_label`; its category relationship references `categories(slug)`.
- `project_translations` uses `locale` and a primary key on `(project_id, locale)`, but has no `language` or `alt_text` columns.
- `project_media` exists with Worker-facing media columns; the old `media` table does not exist in Production.
- `enquiries` has `preferred_date`, but no `consent` column.
- `site_settings` exists; `site_content`, `site_content_revisions`, and `gf_monthly_media_usage` are absent.

This corrects the earlier broad description that Production's `categories` and `projects` are simply legacy: those tables have several Worker-facing columns already. Production is still **not compatible** with the current readiness contract because the missing role, consent, translation columns, CMS tables, and quota ledger remain unresolved. Do not blindly apply `0006_worker_schema_compat.sql`: it is explicitly a fresh-schema migration and includes `ALTER TABLE` operations that may collide with the existing Production schema (for example, columns already present). A dedicated forward-only migration must be designed and tested against a verified disposable restore of the exact Production export.

**Task 3 result:** fresh-schema migrations and isolated fixture tests pass; Production forward-migration safety review remains blocked by Task 1 (the export has not been downloaded/restored and row-count/schema comparison is incomplete). Production remains untouched.


### CI verification follow-up — 2026-11-01

GitHub Actions run #680 for commit `199fb0b3f10551b64f04ca1c113a7f9d00d53b2a` completed successfully. The `build-and-test` job passed dependency installation, frontend/Worker typecheck, Worker API regression tests, forward-migration SQLite fixture test, fresh-schema contract fixture test, frontend build, Preview health/readiness smoke checks, and unauthenticated admin-route rejection checks. This confirms the branch checks pass; it does **not** replace the missing verified Production export restore. Task 3 remains blocked from final completion until Task 1 produces a durable backup and verified disposable restore for the exact Production schema/data.


### Task 4 — Production Cloudflare configuration audit (2026-11-01)

**Status: BLOCKED — read-only audit completed; production configuration is not release-ready.** This audit used the Cloudflare Pages project GET endpoint only; it did not change project settings, secrets, bindings, deployments, or database contents.

Verified project settings:
- Pages project: `golden-films`; production branch: `main`.
- Build command: `npm run build`; output directory: `dist`.
- Production configuration lists `SUPABASE_URL` and `SUPABASE_STORAGE_BUCKET=golden-films-media`.
- Production configuration does not list `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_SETUP_SECRET`.
- The production deployment configuration does not list a `DB` D1 binding. Preview has a `DB` binding to the Preview D1 ID; do not treat that as proof of Production binding readiness.
- The latest deployment remains a Preview deployment from branch `feat/supabase-storage-free-tier`; the canonical Production deployment is still on the older `main` commit.

Remaining acceptance criteria:
1. Complete Task 3's verified backup restore and forward-migration drill before enabling the Production D1 binding or applying schema changes.
2. Configure `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_SETUP_SECRET` using Cloudflare's secret-management UI or an approved secret workflow. Never store their values in Git or logs; verify only presence booleans.
3. Reconcile Production's D1 schema and the Worker contract, then configure the intended Production `DB` binding under an approved release plan.
4. Run the live Production readiness, health, and unauthenticated admin-route checks; verify expected status codes without exposing secret values.
5. Run safe synthetic enquiry/media tests in an isolated environment and re-check CI before release.

No Production configuration changes were made because the missing secrets cannot be safely invented or recovered, and the D1 binding/schema change depends on the incomplete Task 3 backup/restore gate. Task 4 is not marked complete.


### Task 3 / Task 4 continuation — 2026-11-01

**Outcome: safe verification attempted; both tasks remain blocked on external prerequisites.** No Production D1 writes, Pages setting changes, secret changes, or deployments were made.

- Attempted live GET checks for `/api/health` and `/api/ready` on both `https://golden-films.pages.dev` and the canonical Production deployment `https://37df287e.golden-films.pages.dev`. The available execution environment returned `403: requests to <host> are not allowed` for all four requests. These are environment-policy denials, not the website's HTTP responses; live Production health/readiness therefore remains unverified. Do not interpret the 403 as an application failure or success.
- Task 3 still requires a durable copy of the completed D1 export, restore into a disposable database/fixture, and forward-migration + data/constraint verification on that restored copy. The earlier temporary R2 export URL was inaccessible from this execution environment. Starting another export would again create a temporary URL and may block Production D1 while the export runs; it would not solve the download restriction, so it was not restarted.
- Task 4 still requires configuring the missing Production secrets through an approved Cloudflare secret workflow, reconciling the Production D1 schema, adding the Production `DB` binding only after the Task 3 restore/migration gate, and running live checks from an approved environment that can reach the Pages hostname.
- **Next action needed outside this restricted execution environment:** use the Cloudflare Dashboard or an approved CLI/network environment to securely download the existing D1 SQL export (or create a new export only during an approved maintenance window), restore it to an isolated database, and complete the migration drill. Configure secrets directly in Cloudflare's secret UI; never paste secret values into chat or Git. Then perform the approved Production release checks.
