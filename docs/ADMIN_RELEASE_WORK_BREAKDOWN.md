# Admin Release Work Breakdown — Current Status

Last refreshed: **2026-11-27**

## Current release snapshot

- [x] Admin login, owner setup, dashboard, and Pages Functions API bridge are merged in `main`.
- [x] GitHub-backed media upload and owner-only permanent delete are merged. GitHub token remains server-side.
- [x] Read-only Pages API smoke script and offline input-safety tests are merged.
- [x] Health endpoint regression test checks JSON content type, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
- [x] PR #128 authenticated Preview Admin/CMS E2E workflow is merged; post-merge main CI passed on `41b16941ef2b1e3852877287aa505976843fe8c9`.
- [x] Authenticated Preview E2E passed on exact PR head `48bb63f9e26ceb176bb2f359cc0c6f8c1b8aa3b6`: login/session, authenticated identity and role, CMS listing, home revision listing, logout, and post-logout session rejection.
- [x] Exact PR #128 Preview deployment was confirmed successful for its head; post-merge main CI completed successfully. A later Pages deployment check reported success for the merge SHA with a Preview URL; Production custom-domain promotion was not independently established by that check.
- [x] Preview-only GitHub media upload test and cleanup completed on 2026-11-27; details below.
- [ ] Owner setup success/rejection paths, password validation, rate limiting/audit events, CMS write/revision/publish mutations, and owner/editor permission boundaries still need isolated Preview verification.
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
- [x] `scripts/smoke-pages-api.mjs` performs HTTPS-only, GET-only checks for `/api/health`, `/api/ready`, `/api/admin/session`, and `/api/content?page=home`; it refuses non-HTTPS URLs and redirects.
- [x] Manual Preview API smoke workflow passed, including the unauthenticated admin session contract (HTTP 401 and `{ "authenticated": false }`).
- [ ] Re-run/diagnose Preview API readiness if a future deployment changes bindings or schema; do not change Production to repair Preview.

### Authentication and CMS

- [x] Unauthenticated `GET /api/admin/session` returns HTTP 401 and JSON `{ "authenticated": false }` without a session cookie (unit contract and successful Preview smoke).
- [x] Authenticated Preview E2E verifies login, Secure session behavior at the test contract level, authenticated session identity/role, CMS page listing, home revision listing, logout, and rejection of the revoked session.
- [ ] Verify owner setup rejects missing/wrong setup secret and invalid password input.
- [ ] Verify first owner setup succeeds once, repeat setup is rejected, and owner role is assigned only through the guarded setup path. Perform only against a fresh isolated Preview database, never Production.
- [ ] Verify rate limiting and audit events for success/failure paths.
- [ ] Verify CMS draft/save/revision/publish mutations and owner/editor permission boundaries.
- [ ] Perform account-creation and authenticated mutation tests only against an isolated Preview database. Never create a test owner in Production.

### Media

- [x] GitHub-backed upload path is merged; the GitHub token remains server-side.
- [x] Owner-only permanent deletion requires typed confirmation, blocks project covers and legacy URL media, and is covered by regression tests.
- [x] Preview upload test: owner uploaded one disposable JPG as a private draft to the existing `Delete Test` project, with English alt text `A sample test photograph` and Hindi alt text `एक नमूना परीक्षण तस्वीर`. Publish and cover options remained unchecked.
- [x] Preview Admin API/UI showed the new media ID, immutable GitHub raw URL, bilingual alt text, private-draft status, image element, and Open media link. A separate byte-level fetch of the raw image URL was not independently confirmed.
- [x] Cleanup: owner deleted only the disposable test media. Fresh Preview Admin API response confirmed its media ID was absent and counts returned to baseline: 2 pre-existing media items under Delete Test and 1 under Jaipur Wedding (3 total).
- [x] The two pre-existing Delete Test media records and Jaipur Wedding media were left untouched; the Delete Test project itself remains present.
- [x] R2 work is explicitly on hold; no subscription or paid resource was introduced.

## Production D1 migration rehearsal — BLOCKED

- [ ] Agree on a maintenance plan before any export. Prior operational guidance warns that export may temporarily affect database availability; uninterrupted Production availability remains the priority.
- [ ] Obtain an approved export and record its timestamp, checksum, and source database ID.
- [ ] Restore the export to a separate disposable D1 database.
- [ ] Capture tables, columns, indexes, foreign keys, constraints, defaults, and representative data relationships.
- [ ] Test the exact forward-only migration on the restored copy and verify every legacy row, counts, relationships, and integrity before/after.
- [ ] Run the Worker integration suite against the migrated disposable copy.
- [ ] Repeat from a fresh restore and document recovery limits.
- [ ] Obtain explicit approval before any Production D1 write/migration, secret change, or binding change.

## Strict branch and PR workflow

For every distinct task, follow the user's sequential workflow:

1. Before starting, check open PRs and branches.
2. If a PR is open, finish that exact PR first. Do not create another branch or PR while it remains open.
3. Work on one distinct task in one branch and one PR only. Do not accumulate multiple open or Draft PRs.
4. Complete implementation and relevant tests in the active workstream before marking the PR Ready for review.
5. Require exact-head CI and relevant Preview verification before merge. Merge only after all applicable gates pass.
6. After merge, verify `main` points to the merge SHA, post-merge CI passes, and exact-commit Production deployment succeeds where applicable. Do not claim Production deployment from a Preview URL/check alone.
7. If branch cleanup is needed, tell the user the exact branch name and link. The user deletes it manually; independently verify cleanup before starting the next branch/PR.
8. If blocked by missing owner input, approved export, credentials, or QA access, record the blocker and wait. Do not open a placeholder/speculative PR.

Code-only PR merges do not authorize Production D1 writes, migrations, or secret/binding changes.

## Safety rules

- Keep the project at **₹0**. Never enable paid plans, subscriptions, billing, or billable resources without explicit approval.
- Never apply `migrations/0001_initial_schema.sql` as a blanket migration to the existing Production database.
- Never use Production D1 for Preview testing.
- Never fabricate historical consent or automatically elevate legacy admin accounts to owner.
- Never paste passwords, API tokens, secrets, or private data into chat, source code, logs, or documentation.
- A green CI run or successful Pages deployment alone does not prove live API/authentication behavior.
- Do not activate customer booking until Production D1 schema safety is established and separately approved.
