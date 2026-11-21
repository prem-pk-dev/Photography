# Admin Release Work Breakdown — Current Status

Last refreshed: **2026-11-21**

## Current release snapshot

- [x] Admin login, owner setup, dashboard, and Pages Functions API bridge are merged in main (PR #81).
- [x] GitHub-backed media upload and owner-only permanent delete are merged (PR #93).
- [x] Read-only Pages API smoke script and offline input-safety tests are merged (PR #94).
- [x] Health endpoint regression test checks JSON content type, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff` (PR #95).
- [x] Production D1 migration gate documentation refreshed using the 2026-11-21 read-only schema audit (PR #96).
- [x] Old API bridge draft PR #63 closed as superseded by main and PR #94/#95.
- [x] Old Supabase Storage draft PR #87 closed as superseded by the selected GitHub media architecture. Its source branch was retained; no Supabase Storage integration was activated.
- [x] Production Pages deployment for main commit `8243a08a9ee076c1acabde32611ad5aa8996f765` completed successfully and reports `uses_functions: true`.
- [x] Preview Pages API read-only smoke workflow passed after PR #99 (run [#44918699501](https://github.com/prem-pk-dev/Photography/actions/runs/44918699501) was the earlier failed pre-fix run; the successful post-fix run was user-confirmed without a run ID).
- [x] Unauthenticated admin session smoke check is merged (PR #102): `GET /api/admin/session` without a cookie must return HTTP 401 and JSON `{ "authenticated": false }`.
- [x] Manual Preview smoke workflow including the unauthenticated admin session check passed: [run #44921986372](https://github.com/prem-pk-dev/Photography/actions/runs/44921986372). GitHub reports completed/success on branch `test/read-only-admin-session-smoke`, exact head `a0101098301f5701a85c83b025732f211d5e99e1`; the smoke job and its read-only API smoke step both passed.
- [ ] Live authenticated browser/API E2E for owner setup, login, authenticated session, logout, CMS revision/publish, and role boundaries remains unverified.
- [ ] Production D1 migration rehearsal remains blocked until an approved export is restored into a disposable database and the exact forward migration is tested for data preservation and integrity.
- [x] R2 integration remains on hold; no R2 enablement or paid subscription is planned.

## Production state — read-only audit 2026-11-21

Production D1: `golden-films-db`, ID `0241231b-6e6c-410b-a5ac-958eeb424a78`.

The read-only catalog/PRAGMA inspection confirmed the Worker-facing tables and queried columns now include:
- Categories: `title_en`, `title_hi`.
- Projects: `category_slug`, `cover_image_url`, `is_featured`, `project_date`, `demo_label`.
- Translations: `locale`.
- Media: `project_media.preview_url`, `original_key`, `alt_en`, `alt_hi`, `is_public`.
- Enquiries: `consent` is present and `email` is nullable.
- Admin: `admin_users.role`, `admin_sessions`, `admin_setup`, `auth_rate_limits`.
- CMS: `site_content`, `site_content_revisions`.

Read-only counts at the time of audit: 0 enquiries, 1 admin user, 0 projects, and 0 project-media rows. No row contents were read. D1 reported `changed_db: false` and `rows_written: 0`.

The `d1_migrations` history table is absent. No Production export has been downloaded and restored into a disposable D1 database. Therefore the exact history and data-preservation path are still unknown; do not apply baseline migrations `0001`–`0006` blindly.

Cloudflare deployment metadata confirms Production Pages Functions are active and the `DB` binding points to the Production D1 database. Secret values are redacted in metadata; do not infer that `ADMIN_SETUP_SECRET` or other secret values are valid merely because a secret binding is listed.

See [Production D1 Migration Gate](./PRODUCTION_D1_MIGRATION_GATE.md) for the full schema and migration requirements.

## Preview and runtime verification

### API and routing

- [x] Pages Functions catch-all route delegates `/api/*` to the shared Worker handler and is in main.
- [x] Production deployment metadata confirms Functions are active and the D1 binding is present.
- [x] `scripts/smoke-pages-api.mjs` is available. It performs HTTPS-only, GET-only checks for `/api/health`, `/api/ready`, `/api/admin/session`, and `/api/content?page=home`; it refuses non-HTTPS URLs and redirects.
- [x] Manual Pages API read-only smoke workflow passed against the PR #102 Preview build, including the unauthenticated admin session contract (run [#44921986372](https://github.com/prem-pk-dev/Photography/actions/runs/44921986372)).
- [ ] If a future Preview smoke test fails, diagnose Preview bindings/schema without changing Production.

### Authentication and CMS

- [x] Verify unauthenticated `GET /api/admin/session` returns HTTP 401 and JSON `{ "authenticated": false }` without a session cookie (PR #102 unit contract and successful Preview smoke run #44921986372).
- [ ] Verify owner setup rejects missing/wrong setup secret and invalid password input.
- [ ] Verify first owner setup succeeds once, repeat setup is rejected, and the owner role is assigned only through the guarded setup path.
- [ ] Verify login sets the expected Secure, HttpOnly, SameSite=Strict session cookie.
- [ ] Verify authenticated session validity, logout revocation, and that the old session no longer authenticates.
- [ ] Verify rate limiting and audit events for success/failure paths.
- [ ] Verify CMS draft/save/revision/publish behavior and owner/editor permission boundaries.
- [ ] Perform account-creation and authenticated tests only against the isolated Preview database. Never create a test owner in Production.

### Media

- [x] GitHub-backed upload path is merged; the GitHub token remains server-side.
- [x] Owner-only permanent deletion requires typed confirmation, blocks project covers and legacy URL media, and is covered by regression tests.
- [x] Disposable Preview-only Delete Test object was removed from GitHub and its Preview D1 row was independently verified absent.
- [ ] Run non-destructive upload/read/alt-text smoke tests against Preview using a disposable test project.
- [ ] Do not delete or modify existing portfolio media during verification. Use disposable Preview-only objects.
- [x] R2 work is explicitly on hold; no subscription or paid resource may be introduced.

## Production D1 migration rehearsal — BLOCKED

- [ ] Agree on a maintenance plan before any export. Prior operational guidance warns that export may temporarily affect database availability; uninterrupted Production availability remains the priority.
- [ ] Obtain an approved export and record its timestamp, checksum, and source database ID.
- [ ] Restore the export to a separate disposable D1 database.
- [ ] Capture tables, columns, indexes, foreign keys, constraints, defaults, and representative data relationships.
- [ ] Test the exact forward-only migration on the restored copy and verify every legacy row, counts, relationships, and integrity before/after.
- [ ] Run the Worker integration suite against the migrated disposable copy.
- [ ] Repeat from a fresh restore and document recovery limits.
- [ ] Obtain explicit approval before any Production D1 write/migration, secret change, or binding change.

## PR workflow

For every distinct task:
1. Create a new branch and a new PR.
2. Keep the PR Ready for review once the scope is complete and checks are running; do not leave completed work in Draft for a long time.
3. Run the relevant tests and exact-head CI checks; verify Preview when the change affects runtime behavior.
4. Merge promptly after all required checks pass and no safety gate blocks the task.
5. Start the next distinct task in a new PR.

Code-only PR merges do not authorize Production D1 writes, migrations, or secret/binding changes. Keep the Production data-safety gate separate and explicit.

## Safety rules

- Never apply `migrations/0001_initial_schema.sql` as a blanket migration to the existing Production database.
- Never use Production D1 for Preview testing.
- Never fabricate historical consent or automatically elevate legacy admin accounts to owner.
- Never paste secrets into chat, source code, logs, or documentation.
- A green CI run or successful Pages deployment alone does not prove live API/authentication behavior.
- Keep all solutions within the zero-budget constraint; no R2, paid subscription, or paid service enablement.
