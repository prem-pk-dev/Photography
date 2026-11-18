# Golden Films — Launch Plan (18 November 2026)

## Release objective
Deliver a safe public portfolio launch by 18 November 2026. Do not represent database-dependent booking, enquiry persistence, admin or CMS functions as operational until their production checks pass.

## Track A — Public website (P0)
- [x] Deploy public Pages site from `main`; latest known deployment for commit `ead304c` completed successfully.
- [x] Verify homepage and contact routes over HTTPS.
- [x] Show temporary phone/WhatsApp and email details consistently.
- [x] Provide direct WhatsApp, phone and email contact while enquiry storage is unavailable.
- [x] Keep customer booking fail-closed while the readiness capability reports `customerBooking: false`.
- [x] Complete Hindi contact page copy and WhatsApp enquiry labels.
- [x] Complete Hindi About and Showreel content corrections.
- [x] Correct service-page enquiry links so selected service is prefilled on Contact.
- [x] Recheck Hindi Portfolio, Services, Booking, Login and Admin route content on production.
- [ ] Verify mobile navigation, image loading, tap targets and responsive layout on a real mobile device.
- [ ] Recheck production hostname after any further application-code deployment.

## Track B — Database and application services (P0 blocker for full launch)
- [x] Generate a D1 SQL export using Cloudflare D1 export API. Export completed at bookmark `000000a8-00000000-00005127-3bafaf20dcd01b351e7f0f3354e2b546`; database metadata reports 14 application tables and 200,704 bytes.
- [x] Read the live production SQLite catalog and PRAGMA column definitions without modifying data.
- [x] Confirm the current production schema already contains the Worker-facing categories, projects, project_translations, project_media, enquiries, enquiry_rate_limits, admin_users (including role), admin_sessions, admin_setup, auth_rate_limits, audit_logs, site_content and site_content_revisions contracts.
- [x] Identify the five missing Worker readiness tables: `customer_accounts`, `customer_sessions`, `booking_slots`, `bookings`, `booking_rate_limits`.
- [ ] Download and retain the SQL export as a durable backup, then restore it to an isolated disposable D1/SQLite database. A fresh export completed and its signed URL was issued; available download/extraction paths did not provide a byte-exact retained SQL file, so backup integrity and actual restore remain unverified. The export contains authentication/session data; keep any retrieved copy private and never commit it to Git.
- [x] Run an isolated in-memory SQLite rehearsal of `0007_customer_booking_foundation.sql` against a fixture matching the inspected live `admin_users` contract; verified all five tables, five indexes, existing admin-row/role preservation, foreign keys, active-slot uniqueness, rejected-booking retry, case-insensitive email uniqueness and CHECK constraints.
- [x] Repeat the rehearsal against a complete 14-application-table SQLite fixture built from Production `sqlite_master` DDL and indexes; seed representative category, owner admin, enquiry, CMS draft and revision rows; apply `0007`; verify row preservation, all five new tables, booking uniqueness and `PRAGMA foreign_key_check` with zero violations. This remains a schema-fixture rehearsal, not a restore of the actual export.
- [ ] Rehearse migration `0007_customer_booking_foundation.sql` against the actual restored export, including full-schema compatibility, foreign-key, index, row-preservation and Worker contract checks.
- [ ] Obtain explicit approval before any Production D1 write or migration.
- [x] Deploy and verify core `/api/ready` HTTP 200 with `customerBooking: false` and explicit `customer_booking` disabled capability; booking remains fail-closed.
- [ ] After approved migration, verify `customerBooking: true` and run booking/customer end-to-end tests.

## Track C — Booking, admin and CMS (P1)
- [ ] Test customer registration/login/session/logout.
- [ ] Test slot creation, availability, booking request and admin confirmation/rejection.
- [ ] Test admin login and protected routes without exposing secrets.
- [ ] Test CMS draft/publish/revision and portfolio media operations.
- [ ] Verify persistence with controlled test data.
- Note: production catalog includes admin setup and an owner-role admin record; no credentials or password material are recorded in this plan.

## Track D — Content and handover (P1)
- [ ] Obtain owner-approved bio and correct public identity wording.
- [ ] Obtain genuine portfolio images and approved showreel links, or retain explicit demo labels.
- [x] Temporary phone, WhatsApp and email are displayed consistently; owner may replace them later.
- [ ] Capture final smoke-test evidence and record known limitations.

## Release decision
- **Limited public portfolio launch:** public content and direct contact are available; online booking is explicitly unavailable. Complete the real-device checks before declaring the public launch fully verified.
- **Full application launch:** blocked until a durable export is restored and verified, the five customer/booking tables are added through a rehearsed and approved migration, `/api/ready` returns HTTP 200, and end-to-end tests pass.

## Safety
The configured `golden-films-db` is the live Production database. This session has only performed read-only catalog/PRAGMA queries and initiated/completed a D1 SQL export; no DDL or DML migration was run. Do not run migration commands against Production until the export is downloaded and restored, migration rehearsal and data-preservation checks pass, a rollback plan is ready, and the owner explicitly approves the Production change.


## Live API readiness verification (18 November 2026, 07:44 IST)
- Production `GET /api/health` returned HTTP 200 with `status: ok`.
- Production `GET /api/ready` returned HTTP 200 with `status: ok`, `readiness: ready`, and `capabilities.customerBooking: false`; `disabledFeatures` explicitly contains `customer_booking`.
- The same readiness response was confirmed on the immutable deployment URL for deployment `66bb343c-84e6-4ddc-b61e-c17554915e18`.
- Pages build stage completed successfully. The configured build command is `npm run build`, which runs typecheck before Vite build. The repository's Node test suite was not executed by this Pages build.
- Production D1 remains unchanged; no migration was run. The five booking/customer tables are still missing, so booking remains unavailable.

## Progress accounting
- Limited public launch checklist: 9/11 items (82%).
- Full project checklist: 17/31 items (55%); the core API readiness endpoint is now HTTP 200, but customer booking remains explicitly disabled until its schema is safely migrated.

## Current production gate
- `GET /api/health`: previously verified HTTP 200.
- `GET /api/ready`: HTTP 200 with `{status: ok, readiness: ready, schema: legacy-compatible, capabilities.customerBooking: false, disabledFeatures: [customer_booking]}`. This means core API dependencies are ready; it does not mean customer booking is ready.
- The SQL export completed, but a generated export job is not by itself proof of a durable, restorable backup.
- Latest code commit `b7d691a199e7a37020d850dd04173d37d2214d9b` deployed successfully to Pages production as deployment `66bb343c-84e6-4ddc-b61e-c17554915e18`. Build stage passed; test suite was not run by the Pages build.
- Migration `0007` passed both a bounded admin fixture and a complete live-schema DDL fixture rehearsal; neither is an actual restore of the exported SQL, and neither authorizes Production execution.
- Backup SQL contains authentication/session material. Store any retained export privately with restricted access; do not upload it to the public repository or include credentials/session values in handover notes.
- Portfolio/showreel assets remain labelled as demonstration content until owner-approved material is supplied.
