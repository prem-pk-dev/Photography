# Golden Films — Launch Plan (18 November 2026)

## Release objective
Deliver a safe public portfolio launch by 18 November 2026. Do not represent database-dependent booking, enquiry persistence, admin or CMS functions as operational until their production checks pass.

## Track A — Public website (P0)
- [x] Deploy public Pages site from `main`.
- [x] Verify homepage and contact routes over HTTPS.
- [x] Show temporary phone/WhatsApp and email details consistently.
- [x] Provide direct WhatsApp, phone and email contact while enquiry storage is unavailable.
- [x] Keep booking fail-closed when `/api/ready` is not ready.
- [x] Complete Hindi contact page copy and WhatsApp enquiry labels.
- [x] Complete Hindi About and Showreel content corrections.
- [x] Correct service-page enquiry links so selected service is prefilled on Contact.
- [ ] Verify the latest deployment on the production hostname and recheck changed Hindi routes.
- [ ] Run final mobile navigation, image loading, links and responsive checks.

## Track B — Database and application services (P0 blocker for full launch)
- [ ] Obtain and verify a Production D1 export.
- [ ] Restore the export to a disposable database/isolated SQLite fixture.
- [ ] Reconcile the legacy schema against the Worker contract and test an additive migration on the restored copy.
- [ ] Verify existing categories, translations, enquiries, admin/auth/settings data and media references are preserved.
- [ ] Obtain explicit approval before any Production D1 write or migration.
- [ ] Only after approved rollout, verify `/api/ready` returns HTTP 200.

## Track C — Booking, admin and CMS (P1)
- [ ] Test customer registration/login/session/logout.
- [ ] Test slot creation, availability, booking request and admin confirmation/rejection.
- [ ] Test admin setup/login and protected routes without exposing secrets.
- [ ] Test CMS draft/publish/revision and portfolio media operations.
- [ ] Verify persistence with controlled test data.

## Track D — Content and handover (P1)
- [ ] Obtain owner-approved bio and correct public identity wording.
- [ ] Obtain genuine portfolio images and approved showreel links, or retain explicit demo labels.
- [ ] Confirm final phone, WhatsApp and email details.
- [ ] Capture final smoke-test evidence and record known limitations.

## Release decision
- **Limited public portfolio launch:** allowed only after Track A final production checks pass. Direct contact is the supported enquiry path; online booking and database-backed admin remain unavailable.
- **Full application launch:** blocked until Track B and Track C pass. Do not bypass the readiness gate or claim successful booking/enquiry persistence without end-to-end evidence.

## Safety
The configured `golden-films-db` is an existing legacy Production database. No production schema changes are authorized by this plan. Do not run DDL/DML or migration commands against Production until backup, isolated restore, migration rehearsal, data-preservation checks, rollback plan and explicit approval are complete.

## Current known production gate
- `GET /api/health`: previously verified HTTP 200.
- `GET /api/ready`: previously verified HTTP 503 due to schema incompatibility.
- Direct contact details are temporary and can be changed later.
- Portfolio/showreel assets remain labelled as demonstration content until owner-approved material is supplied.
