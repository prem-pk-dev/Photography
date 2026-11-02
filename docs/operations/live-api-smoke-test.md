# Live API smoke-test runbook

Date: 2026-10-31
Branch: `feat/supabase-storage-free-tier`

Purpose: provide a low-risk, read-only first pass for verifying the deployed Golden Films API. A successful CI run does not prove the deployed Pages URL points to the same commit or that production secrets are configured.

## 1. Confirm the target

Before testing, verify in Cloudflare Pages:
- the production project name and custom domain;
- the most recent successful production deployment commit;
- that the URL below is the actual assigned production URL, not a guessed preview URL.

Replace `https://YOUR-PRODUCTION-DOMAIN` below with the confirmed domain.

## 2. Read-only checks

Run from a trusted terminal:

```sh
BASE_URL='https://YOUR-PRODUCTION-DOMAIN'
curl --fail-with-body --silent --show-error --max-time 15 -D /tmp/gf-health.headers "$BASE_URL/api/health" -o /tmp/gf-health.json
curl --fail-with-body --silent --show-error --max-time 15 -D /tmp/gf-ready.headers "$BASE_URL/api/ready" -o /tmp/gf-ready.json
cat /tmp/gf-health.headers
cat /tmp/gf-health.json
cat /tmp/gf-ready.headers
cat /tmp/gf-ready.json
```

Do not publish raw logs if they contain cookies, tokens, email addresses, or internal infrastructure identifiers. The readiness endpoint must never return secret values.

## 3. Interpret readiness

- HTTP 200 alone is not enough. Inspect the JSON body and its `blockers` array.
- `mediaStatus: "blocked"` or `supabase_storage_not_configured` means media uploads must not be treated as launch-ready.
- Missing `ADMIN_SETUP_SECRET` means first-time admin setup is blocked.
- `admin_setup_already_completed` is informational for an already-initialized site; do not rerun setup.
- A compatible schema status is not proof that the configured database is the intended production database.

Record only: timestamp, confirmed deployment commit, HTTP status codes, boolean readiness fields, and blocker names.

## 4. Authentication negative checks

These requests should be rejected without changing data:

```sh
curl --silent --show-error --max-time 15 -i "$BASE_URL/api/admin/content"
curl --silent --show-error --max-time 15 -i "$BASE_URL/api/admin/content/revisions?page=home"
```

Expected outcome: HTTP 401 with an unauthorized error. If either request returns protected content, stop release activity and investigate.

## 5. Not covered by this read-only runbook

Do not test live enquiry creation, media upload/delete, admin setup, database migrations, or publishing against production without an approved change window and a controlled test plan. Use a disposable preview environment for write-path tests and clean up test data afterward.

## Current known limitation

The prior verification attempt could not access the candidate `golden-films.pages.dev` URL from the available environment. This is an access limitation, not proof that the deployment is down. Confirm the actual Pages URL and deployment commit in the Cloudflare dashboard before recording live verification as passed.

## 6. Preview-first verification (recommended before any write-path test)

Use a successful **Preview** deployment from the feature branch, not the production domain. Confirm the deployment commit and that its `DB` binding points to the designated disposable Preview D1 database before running these read-only checks.

```sh
BASE_URL='https://CONFIRMED-PREVIEW-DEPLOYMENT.pages.dev'
curl --fail-with-body --silent --show-error --max-time 15 -D /tmp/gf-preview-health.headers "$BASE_URL/api/health" -o /tmp/gf-preview-health.json
curl --fail-with-body --silent --show-error --max-time 15 -D /tmp/gf-preview-ready.headers "$BASE_URL/api/ready" -o /tmp/gf-preview-ready.json
curl --silent --show-error --max-time 15 -i "$BASE_URL/api/admin/content"
curl --silent --show-error --max-time 15 -i "$BASE_URL/api/admin/content/revisions?page=home"
```

Expected for the unauthenticated admin requests: HTTP 401 with an unauthorized response. For `/api/ready`, record only HTTP status, boolean readiness fields, and blocker names; do not share cookies, tokens, secret values, or unredacted logs. A reported `supabase_storage_not_configured` blocker means the Storage integration is not yet verified, even if secret configuration was completed in the dashboard.

Do not use these commands to test uploads, enquiry creation, admin setup, publishing, deletion, or database writes. Those require a separate controlled Preview test plan and cleanup. Do not copy the Preview database binding or secrets into Production as part of smoke testing.


## 7. Preview D1 read-only schema verification — 2026-11-01

The Cloudflare D1 API was used to inspect the designated Preview database bound to this feature branch. The database queries were read-only; no rows were written.

- Latest confirmed successful Preview deployment at verification time: commit `dcf8df135a1af05efd8262bd7508418d0cc50a93`, deployment ID `a28e1812-b2bb-44e8-ad22-d6ec7c560f38`.
- Required Worker-contract columns were present in the inspected Preview tables: categories, projects, project_translations, project_media, enquiries, enquiry_rate_limits, admin_users, admin_sessions, admin_setup, auth_rate_limits, audit_logs, site_content, site_content_revisions, and gf_monthly_media_usage.
- `enquiries.email` is nullable, matching the Worker contract for enquiries that may be submitted with a phone number instead.
- `PRAGMA foreign_key_check` returned zero violations.
- Observed row counts: categories 14; admin_users 1; admin_sessions 3; admin_setup 1; site_content 5; projects 0; project_media 0; media 0; enquiries 0; site_content_revisions 0; gf_monthly_media_usage 0.

**Interpretation:** this verifies the inspected Preview schema's required columns, email nullability, and foreign-key consistency only. It does not prove all unique conflict targets, application query compatibility, deployed API readiness, Supabase Storage connectivity, media upload, enquiry workflow, or Production schema compatibility. The zero project/media/enquiry counts mean there is no existing test data to validate those workflows from row inspection alone.

Direct runtime access to the Preview `/api/health` and `/api/ready` URLs was still unavailable through the verification environment. Do not mark live API readiness as passed until those endpoints return a response and the sanitized status/body fields are reviewed.
