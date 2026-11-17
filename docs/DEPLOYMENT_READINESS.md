# Cloudflare Deployment Readiness

Last checked: 2026-11-17 (IST)

## Verified production state

- Cloudflare Pages project: `golden-films`
- Production URL: https://golden-films.pages.dev
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Public site and the contact and booking routes are deployed and respond over HTTPS.
- `GET /api/health` was verified: HTTP 200 with `{"status":"ok","service":"golden-films-api"}`.
- `GET /api/ready` was verified: HTTP 503. Production D1 does not satisfy the current Worker schema contract.
- Contact details currently shown are temporary: phone/WhatsApp `+91 89498 00427`, email `prem92006@gmail.com`.
- Portfolio and showreel visuals are explicitly demo/sample material; real client work, approved biography and real film links are still required before presenting them as a completed client portfolio.

## Launch decision

**Status: NOT READY FOR FULL PRODUCTION HANDOVER.**

The public pages are deployed, but database-backed enquiry, customer booking and admin/CMS flows are not approved for production use while `/api/ready` returns 503. Do not describe these flows as operational or accept real customer submissions until end-to-end verification succeeds.

A limited visual preview can be reviewed with the client, provided demo portfolio material is clearly identified and booking/enquiry persistence is not represented as working. Direct phone, WhatsApp and email contact details are visible on the contact page.

## Required release gates

1. Resolve the legacy D1 schema mismatch through a verified backup and isolated restore/migration rehearsal.
2. Preserve existing category IDs/slugs/order, English/Hindi translations, foreign keys, enquiry data, admin/auth/settings records and existing media references.
3. Confirm the exact production database identity and data counts immediately before any approved migration.
4. Obtain explicit approval before production D1 writes/migrations or any write-capable Worker rollout.
5. Verify `/api/ready` returns HTTP 200 and the expected ready schema.
6. Run controlled end-to-end tests for enquiry submission, customer registration/login, slot selection, booking request, admin login, booking review and CMS operations. Use test data only.
7. Verify both English and Hindi routes, mobile layouts, all navigation, contact links, form validation/error/success states, image loading and security headers.
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
