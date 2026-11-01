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
