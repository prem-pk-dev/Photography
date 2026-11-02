# Production D1 backup and disposable-restore preflight

Status: **procedure prepared; backup/restore not yet performed**.
Target database: `golden-films-db` (`0241231b-6e6c-410b-a5ac-958eeb424a78`).
Never run a migration or write query against the target during this preflight.

## Why this gate exists

The production database has a legacy schema that differs from the Worker contract. The forward migration is only a candidate until a real export has been restored and tested. The synthetic SQLite fixture in `scripts/test-forward-migration.py` is useful but is not proof that a production export can be restored.

## Required operator steps

1. **Schedule a maintenance window first.** Cloudflare D1 export may temporarily affect database availability. Do not start an export until the site owner has approved the window and the current traffic impact is understood.
2. In Cloudflare Dashboard, open the intended D1 database by both name and ID. Confirm it is `golden-films-db` / `0241231b-6e6c-410b-a5ac-958eeb424a78`. Do not rely on a display name alone.
3. Use Cloudflare's supported D1 export/download workflow to export the database. Save the raw export outside the repository in access-controlled storage. Do not upload it to GitHub, Notion, chat, or a public bucket: it can contain customer enquiries and authentication-related data.
4. Record the export timestamp, database ID, file size, and SHA-256 digest in a private operational record. Do not record credentials or the export contents in that record.
5. Verify that the export is non-empty and its digest is stable. Keep the original export unchanged as the recovery artifact.
6. Create or select a **disposable, non-production D1 database**. Verify its database ID separately. Never point the restore command at the production ID.
7. Restore/import the export into that disposable database using Cloudflare's currently documented D1 import/execute workflow. If the export format cannot be restored cleanly, stop and investigate; do not edit the only copy of the export.
8. On the disposable copy only, capture schema and row-count evidence before any candidate migration. Run `scripts/audit-d1-schema.sql` and save its output privately.
9. Apply the candidate `docs/forward-migrations/2026-10-29-live-schema-forward.sql` to the disposable copy only. Then run `scripts/verify-d1-migration.sql`, compare the before/after row counts and identity data, check all foreign keys, and run the Worker API regression suite against a test environment.
10. Confirm the intended nullable-email behavior, historical consent default of `0`, admin role defaults, CMS tables, monthly quota table, required unique conflict targets, and Worker readiness. Record pass/fail for every gate.
11. If any unexpected row-count difference, missing column/index, broken reference, import warning, or test failure occurs, stop. Preserve the disposable database and logs for diagnosis. Do not proceed to production.
12. Production migration requires a separate reviewed change, verified recovery artifact, passing disposable-restore evidence, approved maintenance window, and explicit go/no-go decision. This document does not authorize production writes.

## Acceptance checklist

- [ ] Correct production database identity confirmed (name and ID)
- [ ] Maintenance window approved before export
- [ ] Raw export downloaded successfully and kept private
- [ ] Export file size and SHA-256 recorded; original export unchanged
- [ ] Disposable database identity verified as non-production
- [ ] Restore/import completed without warnings or errors
- [ ] Pre-migration schema audit and row counts saved
- [ ] Candidate migration applied only to disposable database
- [ ] Post-migration verification SQL passed
- [ ] Data preservation and foreign-key checks passed
- [ ] Worker regression tests and readiness checks passed
- [ ] Independent review and explicit production go/no-go recorded

## Current result (updated 2026-11-01)

- Production D1 identity was re-confirmed by API: `golden-films-db` / `0241231b-6e6c-410b-a5ac-958eeb424a78`; 12 tables, reported size 163,840 bytes.
- A fresh Cloudflare D1 SQL export job completed at bookmark `00000046-00000000-00005116-f02a54bfc1872ec9b09121b3373d0fbc`. Cloudflare returned a temporary signed URL, but download attempts from the available execution environment returned HTTP 403. The SQL file was therefore **not downloaded or independently verified**, and the export is not yet a usable recovery artifact.
- A separate disposable D1 database, `golden-films-forward-migration-test-20261101` (`b276f110-c3a4-448a-8950-824497b43438`), was created and seeded with a **synthetic legacy-schema fixture** (one sample admin, category, project, two translations and enquiry; no production rows). The exact candidate forward migration ran successfully on this fixture.
- Post-migration fixture checks passed: translation row count preserved (2), enquiry count preserved (1), admin count preserved (1); nullable `enquiries.email`; `consent INTEGER NOT NULL DEFAULT 0`; `admin_users.role TEXT NOT NULL DEFAULT 'editor'`; CMS and monthly quota tables present; translation conflict-target unique index present; project/translation/media orphan checks returned zero; translation locale/language and admin-role domain checks returned zero violations; `pragma_foreign_key_check` returned zero rows.
- This is useful compatibility evidence, **not a verified restore of the actual Production export**. Production schema/data have not been changed. Task 3 remains blocked until the actual export is downloaded and restored into a disposable D1 database, then the migration and checks are run against that restored copy.


## Current result (updated 2026-11-02, latest maintenance-window run)

- Owner explicitly approved starting the maintenance-window export in chat on 2026-11-02.
- Cloudflare D1 export for `golden-films-db` completed successfully at bookmark `00000060-00000000-00005117-9836ef61dc03d15521537e15d5aa6079`; export filename: `0241231b-6e6c-410b-a5ac-958eeb424a78-00000060-00000000-00005117-9836ef61dc03d15521537e15d5aa6079.sql`.
- The available execution environment attempted to fetch the temporary signed download URL but outbound network policy returned HTTP 403 (host not permitted). The SQL bytes were not downloaded; no SHA-256 or file-size validation is available. Do not claim a usable verified backup artifact.
- After the export completed, a read-only Production query succeeded and returned 13 tables; the database metadata remained readable. No migration, import, or production data write was performed.
- Next safe route: obtain the export bytes through an approved Cloudflare-native workflow that does not require the mobile-only owner to manually download/upload SQL. Until such a route is available, the actual-export restore and production compatibility gate remain blocked. Do not request repeated manual SQL downloads from the owner.


## Follow-up verification (2026-11-02)

- Read-only Cloudflare Pages project configuration rechecked: project `golden-films`, production branch `main`.
- Production Pages configuration currently lists no D1 bindings and no plain-text variable names. Preview lists a `DB` binding to disposable database ID `21f470cb-776a-4eb2-816e-16605139299a`; this is the preview test DB, not Production.
- Read-only catalog queries succeeded against three disposable databases:
  - `golden-films-forward-migration-test-20261101`: 16 tables.
  - `golden-films-migration-test-20261101`: 19 tables.
  - `golden-films-preview-test`: 20 tables.
- A direct `PRAGMA integrity_check` request was rejected by D1 with `SQLITE_AUTH`; no integrity-check pass is claimed from that command. Use supported SQL checks (including `PRAGMA foreign_key_check` only if the API permits it) and the repository's verifier script in an authorized test runner.
- Browser/network probes of Production and Preview `/api/health` and `/api/ready` could not be completed by the available verification tools. Runtime health remains unverified, not proven broken.
- No Pages configuration, secrets, or Production data were changed. Keep both PRs in Draft until export restore, API runtime checks, and rollout gates are completed.


## CI status recheck (2026-11-02)

- The API bridge PR head commit `aeb5e12d1e7185a3c3dafb2c5205ce0817c6154b` has a completed GitHub Actions run (`Golden Films checks`, run `40903640324`) with conclusion `success`. The job completed typecheck, Worker API regression tests, the synthetic forward-migration SQLite fixture test, and frontend build.
- The latest Supabase/media branch documentation commit `1e8ee022470bbf739c54e085ca62ea623d69536c` has no PR-triggered workflow run returned by the current workflow-run query, and the combined status endpoint returned no statuses. Do not treat this as a passing CI result for that exact commit.
- These CI results do not clear the real-export restore gate, verify Pages runtime bindings, or prove Supabase secrets are configured. Both PRs remain Draft; no Production settings or data were changed.


## Latest deployment/configuration recheck (2026-11-02)

- Cloudflare Pages deployment list confirms Preview deployment `084bc705.golden-films.pages.dev` is `success` for commit `9d843be096cb68394e49fac4e28510b817666c68` on `feat/supabase-storage-free-tier`.
- Re-read Pages project configuration: production branch is `main`; production D1 binding is absent; preview `DB` binding points to disposable database `21f470cb-776a-4eb2-816e-16605139299a`. The API response showed no plain-text vars in either environment; this does not prove whether encrypted secrets exist.
- The current media branch uses `DB`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, and `ADMIN_SETUP_SECRET` at runtime. No secret values were read or modified. Admin/API and media runtime behavior remains unverified until the correct preview environment bindings/secrets and database schema are validated.
- No configuration changes, production writes, migrations, or PR merges were performed.


## Preview D1 schema smoke checks (2026-11-02)

Read-only queries against Preview's configured disposable D1 database `golden-films-preview-test` (`21f470cb-776a-4eb2-816e-16605139299a`) returned:

- 19 application tables (excluding Cloudflare internal tables), including `site_content`, `site_content_revisions`, and `gf_monthly_media_usage`.
- `enquiries.email` is nullable; `enquiries.consent` exists and is NOT NULL, but its default is absent in this fixture. Do not infer it matches the candidate migration without checking exact defaults.
- `admin_users.role` exists and is NOT NULL, but its default is `'owner'` in this fixture. This differs from the candidate migration's least-privilege default `'editor'`; do not use this fixture as evidence that migration behavior or initial-account privilege defaults match the candidate migration.
- `pragma_foreign_key_check` returned zero rows on this disposable Preview DB. This is a read-only check only, not a full `integrity_check` and not a Production check.
- Counts currently read as 1 admin user and 0 projects, 0 project_media rows, 0 enquiries. These are Preview fixture data only.
- A combined column-check query exceeded SQLite's compound SELECT limit, so it was split into individual read-only queries. No rows were written.

This check surfaced schema drift in the Preview fixture; align/reseed it through a reviewed disposable-only migration workflow before relying on it for runtime verification. No production data/configuration was changed.
