# Cloudflare Deployment Readiness

Last checked: 2026-11-01

## Final backend release audit

**Release decision: BLOCKED for production writes / merge.** The current branch's automated checks pass and its Preview deployment succeeds, but direct read-only inspection of the configured D1 databases confirms schema drift. Do not interpret CI success as proof that the production database is compatible.

### Current deployment evidence

- Cloudflare Pages project: `golden-films`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Latest Preview deployment for branch `feat/supabase-storage-free-tier`: commit `0af0a30e1152853dbc058d68debd164e45d2cdfa`; build and deploy stages succeeded.
- Latest production deployment still points to the existing `main` commit `de77fe22b606ec64b2c5ba290cf7fde21b218120`; this audit did not deploy to Production.
- GitHub Actions runs #665 and #666 passed on commit `0af0a30e1152853dbc058d68debd164e45d2cdfa`.
- CI covers typecheck, Worker API tests, migration fixture tests, fresh-schema fixture tests, frontend build, and deployed Preview health/readiness/admin-auth smoke checks.

### Read-only D1 schema findings (2026-11-01)

The Cloudflare D1 API returned `changed_db: false` and `rows_written: 0` for the schema inspection.

**Production D1 `golden-films-db`** has a legacy schema. Confirmed gaps versus the current Worker readiness contract include:

- `admin_users.role` is absent.
- `enquiries.consent` is absent.
- `project_translations.language` and `project_translations.alt_text` are absent.
- `site_content` and `site_content_revisions` tables are absent.
- `gf_monthly_media_usage` is absent.
- Production's `projects` and `categories` schemas are legacy versions and must be reconciled with the current Worker contract before write-capable release.

**Preview D1** also does not match the current Worker readiness contract in the direct D1 schema response: its `categories` table lacks the expected `slug` column, `projects` uses a different required-column shape, `project_translations` uses `language` as its key but has a nullable `locale`, and the database's table set differs from the Worker contract. This conflicts with CI run #666, whose deployed Preview `/api/ready` smoke check returned HTTP 200 and `status=ready` with no blockers. Treat this as an unresolved binding/schema identity discrepancy: verify which D1 database the deployed Preview Worker actually queries before considering Preview verified. Do not suppress this mismatch or infer that a green endpoint smoke test means the directly inspected D1 schema is compatible.

### Supabase Storage configuration gate

The Cloudflare Pages project configuration returned a Preview storage bucket and Supabase URL, while the Production deployment configuration did not list `SUPABASE_SERVICE_ROLE_KEY`. The secret value itself is not inspected or disclosed. Before production media is enabled, configure the service-role secret through Cloudflare's secret-management UI or approved secret workflow, then verify only the readiness endpoint's boolean presence result. Never put the secret in Git or in logs.

### Required release blockers

1. Export Production D1 and verify the export completed.
2. Restore that export to a disposable database or isolated SQLite fixture.
3. Run the reviewed forward migration against the disposable copy and verify all data, keys, indexes, constraints, and foreign keys.
4. Reconcile and validate the actual Preview D1 schema against the current Worker readiness contract.
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
