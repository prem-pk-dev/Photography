# Cloudflare Deployment Readiness

Last checked: 2026-11-24 (IST)

## Verified production state

- Cloudflare Pages project: `golden-films`
- Production URL: https://golden-films.pages.dev
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Public site and the contact and booking routes are deployed and respond over HTTPS.
- `GET /api/health` was verified: HTTP 200 with `{"status":"ok","service":"golden-films-api"}`.
- Last recorded live API smoke (2026-11-18): `GET /api/health` and `GET /api/ready` both returned HTTP 200. Readiness was `ready`, while `capabilities.customerBooking` was `false` and `disabledFeatures` included `customer_booking`.
- No fresh live HTTP probe was performed during the 2026-11-24 code releases; treat the 2026-11-18 response as the latest recorded runtime evidence, not a current-day probe.
- Current `main` merge: `98ec96a41512f1e8cb30c250d384f1086c2ca430`. Exact-commit Production Pages deployment succeeded: https://ba00c3ca.golden-films.pages.dev (deployment `ba00c3ca-6e13-43ec-a7c3-26bb36bebd87`). Pages Functions are active.
- Contact details currently shown are temporary: phone/WhatsApp `+91 89498 00427`, email `prem92006@gmail.com`.
- Portfolio and showreel visuals are explicitly demo/sample material; real client work, approved biography and real film links are still required before presenting them as a completed client portfolio.

## Launch decision

**Status: NOT READY FOR FULL PRODUCTION HANDOVER.**

The public pages are deployed. The latest recorded readiness response confirms core API readiness only; customer booking remains explicitly disabled because its five optional customer/booking tables are not present. Enquiry persistence, customer booking, authenticated Admin/CMS and role-boundary flows still require controlled end-to-end verification. Do not describe those flows as operational or accept real customer submissions until their respective tests pass.

A limited visual preview can be reviewed with the client, provided demo portfolio material is clearly identified and booking/enquiry persistence is not represented as working. Direct phone, WhatsApp and email contact details are visible on the contact page.

## Required release gates

1. Resolve the legacy D1 schema mismatch through a verified backup and isolated restore/migration rehearsal.
2. Preserve existing category IDs/slugs/order, English/Hindi translations, foreign keys, enquiry data, admin/auth/settings records and existing media references.
3. Confirm the exact production database identity and data counts immediately before any approved migration.
4. Obtain explicit approval before production D1 writes/migrations or any write-capable Worker rollout.
5. Verify `/api/ready` returns HTTP 200 with the expected core schema. Separately require `capabilities.customerBooking: true` before enabling or advertising customer booking; core readiness alone does not enable booking.
6. Run controlled end-to-end tests for enquiry submission, customer registration/login, slot selection, booking request, admin login, booking review and CMS operations. Use test data only.
7. Verify both English and Hindi routes, mobile layouts, all navigation, contact links, form validation/error/success states, image loading and security headers. `public/_headers` applies to static Pages responses; Worker responses receive their security headers from the shared Worker wrapper.
8. Replace demo/sample portfolio assets and placeholder biography/showreel content with client-approved material, or retain clear demo labels for a preview-only handover.
9. Confirm the final phone, WhatsApp and email details with the client; current details are temporary.
10. Record final smoke-test evidence and obtain client acceptance before the client launches.

## D1 safety gate — mandatory

The configured `golden-films-db` is an existing legacy database and does not match the current Worker contract. Wrangler configuration points at this production database. Do **not** run `wrangler d1 migrations apply`, execute DDL/DML, or deploy a write-capable Worker against it until all of the following are complete:

1. Export the intended database and verify the export completed.
2. Restore the export into a disposable database or equivalent isolated SQLite fixture.
3. Review and test the exact forward migration against that disposable copy.
4. Verify category IDs/slugs/order and English/Hindi translations are preserved.
5. Verify foreign keys, nullable `enquiries.email`, and all admin/auth/settings tables and data.
6. Recheck live counts and database identity immediately before any approved migration.
7. Keep a rollback plan; do not invent consent values or object-storage keys during mapping.

The read-only verifier at `scripts/verify-d1-migration.sql` is a checklist of queries, not a migration and not evidence that a restore has passed.

## Budget and credentials

- Keep the workflow within the existing ₹0 budget; use free-tier resources only.
- Never commit API tokens, database credentials, or secrets to the repository.
- Do not add paid services or create billable resources without explicit approval.


## Security-header release notes (2026-11-24)

- Static Pages security headers are configured in `public/_headers` and merged in PR #110. They apply to static asset/HTML responses, not Pages Functions.
- The Worker applies baseline security headers in its shared response wrapper. PR #112 added regression tests for API 404, static-asset fallback 503, and HTTPS-only HSTS behavior.
- PR #112 is merged and deployed. Exact-head CI, post-merge CI, Preview and Production deployment all passed. No live browser-level header observation was available from the current environment.
- These changes did not modify D1, secrets, bindings, customer/admin records, or paid resources.


## Static route SEO entrypoints (2026-11-24)

- The production build now generates route-specific HTML entrypoints for `/`, `/portfolio`, `/services`, `/about`, `/showreel`, `/contact`, plus `/book`, `/admin`, `/login`, and `/register`.
- Public routes receive their own title, description, canonical URL, Open Graph metadata, Twitter card, document language, and `index,follow` robots directive. Private routes receive `noindex,nofollow`.
- The SPA still hydrates normally from the generated entrypoints. Static metadata defaults to English; the existing client-side language state can update metadata to Hindi after hydration. This is metadata pre-rendering, not full React SSR or pre-rendered page body content.
- The generator reuses `getSeoMetadata` from `src/seo.ts` as the single metadata source and is covered by isolated filesystem tests.
