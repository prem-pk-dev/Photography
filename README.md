# Golden Films

A bilingual (English/Hindi) photography, videography, photo-editing and video-editing portfolio for Sunil.

## Current milestone

The responsive portfolio frontend and Cloudflare Pages Functions API bridge are in `main`. The UI includes 14 portfolio categories, services, sample-labelled demo imagery, an English/Hindi switcher, and a playable showreel. The showreel currently presents one registered AI-generated Google Gemini demo video with native playback controls and a clear disclosure; it is not represented as client work. **The website enquiry/booking form is intentionally unavailable**; visitors are directed to WhatsApp, phone, or email. Do not describe the frontend as submitting enquiries to `POST /api/enquiries` or accepting bookings until the Production D1 migration and the required runtime checks are safely completed.

The API foundation, admin authentication/CMS routes, GitHub-backed media workflow, and read-only Pages API smoke checks are implemented. Production Pages Functions and the Production `DB` binding were confirmed in deployment metadata. The showreel implementation was merged in PR #144 as `c2a979b7b13704ae9764b9be510726b93b2f9eba`; its post-merge CI and Cloudflare Pages deployment checks passed. The Cloudflare dashboard confirmed this exact commit as the `golden-films` **Production** deployment, with `https://golden-films.pages.dev` as the Production domain. The user then confirmed that the Production showreel displays one AI-generated video and that playback works. A GitHub Pages check URL is not by itself proof of Production promotion; use the Cloudflare dashboard's Production environment mapping for that distinction.

### Latest Preview and Production verification (2026-11-28)

- PR #128 added a secret-backed authenticated Preview Admin/CMS E2E workflow and was merged. On the exact PR head, the E2E assertions passed for login/session, authenticated identity and role, CMS page listing, home revision listing, logout, and rejection of the logged-out session. The standard CI suite also passed.
- A subsequent Preview-only media upload test used the existing draft `Delete Test` project and isolated Preview D1. The Admin API/UI showed the private draft media record, immutable GitHub URL, and English/Hindi alt text. The Admin UI exposed an image element and Open media link; a separate byte-level fetch of the raw image URL was not independently confirmed.
- The disposable test media and its Preview metadata were then deleted. Fresh Admin API data confirmed the test ID was absent and counts returned to the pre-test state: two pre-existing Delete Test media records and one Jaipur Wedding media record. Those older records were left untouched.
- PR #129 refreshed the release documentation and was squash-merged as `935ba885cd2ff82db42de4dabe359e39a6282b96`. Exact-head standard CI, authenticated Preview E2E, and Preview deployment checks passed. Post-merge standard CI and the Cloudflare Pages check also passed; the returned Pages URL is labelled Preview, so this does not establish Production custom-domain promotion.
- PR #130 corrected the release checkpoint documentation and was squash-merged as `ab5cc2d494154b0cafc098037939530cc0f95829`; exact-head standard CI, authenticated Preview E2E, Preview deployment, and post-merge CI/Pages checks passed.
- PR #131 added four mock-D1 tests for authenticated editor draft save, validation rejection before writes, revision restore as an unpublished draft, and malformed stored revision rejection. It was squash-merged as `fa96e0e70556dbecbe8e41f72ac195298c6c8fd4`. Exact-head standard CI (`46009864903`), authenticated Preview E2E (`46009864816`), and Preview deployment (`https://bf88ac9e.golden-films.pages.dev`) passed; post-merge CI (`46010011499`) and Pages check passed with Preview URL `https://105d60cf.golden-films.pages.dev`. These mock-D1 tests do not prove live Preview CMS mutations or Production behavior.
- PRs #133–#142 added focused regression coverage for editor/owner permissions, admin authentication and rate limiting, owner setup, CMS publishing/revisions, enquiries, user/media management, and media deletion. PR #142's exact-head CI, authenticated Preview E2E, Preview deployment, and post-merge CI passed.
- PR #144 corrected the actual `/showreel/` route and made it play one registered MP4: `https://media-assets-4sb.pages.dev/videos/photography/photography-cinematic-showcase.mp4`. It uses native controls, `preload="metadata"`, and `playsInline`, with no autoplay. English/Hindi disclosure identifies it as an AI-generated Google Gemini demo, not a client shoot or commission. Exact-head standard CI, authenticated Preview E2E, Preview deployment, and post-merge CI/Pages checks passed. The user confirmed playback in Preview and later confirmed the same one-video behavior and playback on Production.
- PR #144 was squash-merged as `c2a979b7b13704ae9764b9be510726b93b2f9eba`. Cloudflare dashboard mapping confirms Environment `Production`, Source `main`, commit `c2a979b`, deployment URL `https://23e605a9.golden-films.pages.dev`, and Production domain `https://golden-films.pages.dev`.
- These Preview tests did not modify Production D1, Production secrets/bindings, customer records, or published portfolio content. The showreel change did not modify Production database/configuration.

### PR #147 — bilingual booking-unavailable Production verification (2026-11-28)

- PR #147 was squash-merged as `eb9757bd1e28878b85a5a591292e7bffbbe5d466`. The exact `main` merge SHA passed post-merge CI and the Cloudflare Pages deployment check; the Cloudflare dashboard confirmed Environment `Production`, Source `main`, and commit `eb9757b`.
- Production `/book/` was freshly inspected in Chrome in both English and Hindi. The document titles, localized unavailable-booking copy, navigation/language links, and WhatsApp, telephone, and email destinations were verified.
- Booking remains intentionally unavailable. This change only corrects SEO metadata and localized unavailable-state copy; it does not activate booking or modify Production D1, secrets, bindings, customer records, or billing.
- PRs #145 and #146 were documentation-only updates; their exact-head checks, post-merge CI/Pages checks, and Production deployment mappings were verified before PR #147.

## Production D1 safety status

Production D1: `golden-films-db` (ID `0241231b-6e6c-410b-a5ac-958eeb424a78`).

A read-only catalog/PRAGMA audit on 2026-11-21 confirmed the queried Worker-facing tables and columns, including categories, projects, translations, project media, enquiries, admin users/sessions, CMS content/revisions, and rate-limit/audit tables. The audit reported `changed_db: false` and `rows_written: 0`; no row contents were read.

The `d1_migrations` history table was absent. No Production export has yet been downloaded and restored into a separate disposable D1 database. The exact historical migration path and data-preservation behavior therefore remain unverified. **Do not apply baseline migrations `0001`–`0006` blindly to Production.** First plan an approved export/maintenance window, restore to a disposable database, test the exact forward-only migration, and verify data preservation and integrity. Obtain explicit approval before any Production D1 write/migration, secret change, or binding change. See [Production D1 Migration Gate](docs/PRODUCTION_D1_MIGRATION_GATE.md).

## Local development

Requires Node.js 22.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Run the Worker locally only after configuring a separate test database and required environment secrets. The Postman collection defaults to `http://127.0.0.1:8787`; its valid-enquiry request writes to the configured database, so use a test database rather than Production.

## Architecture

- React + TypeScript + Vite frontend, deployed on Cloudflare Pages
- Cloudflare Pages Functions API bridge to the shared Worker handler
- Cloudflare D1 for categories, projects, translations, enquiries, admin and CMS data
- GitHub-backed media storage workflow; the GitHub token remains server-side
- Cloudflare R2 is explicitly on hold; do not enable paid or billable resources
- GitHub feature branches, pull requests, and CI checks
- Postman collection and automated regression tests for API verification

## Budget requirement

The project must remain at **₹0**. Do not enable paid plans, subscriptions, billing, or billable resources without explicit approval. If a feature cannot be delivered safely within the free tier, defer it or choose a free alternative. Avoid exhausting provider usage limits.

## Demo media

All placeholder/demo media must be clearly labelled as sample content and must not be represented as Sunil's real work. Replace remote sample images with licensed, generated, or owner-provided assets before production launch.

## Current limitations and verification gates

- Owner-provided phone, WhatsApp and email contact details are published on the Contact page; an Instagram handle has not been supplied.
- The Preview read-only Pages API smoke workflow covers `GET /api/health`, `GET /api/ready`, `GET /api/admin/session`, and `GET /api/content?page=home`; the authenticated Preview E2E separately covers login/session, CMS listing/revisions reads, and logout on its recorded exact head.
- Owner setup success/rejection paths, password validation, rate limiting/audit events, CMS draft/save/publish mutations, and owner/editor permission boundaries still need isolated Preview verification. Do not use Production for these tests.
- The disposable Preview GitHub media upload/metadata test and cleanup are complete. The Admin UI displayed the image element and immutable URL; direct raw-image byte retrieval was not independently verified. No test media record remains.
- Production D1 migration rehearsal remains blocked pending an approved export restored into a disposable database and a successful exact forward-migration test. Never use Production D1 for Preview testing.
- Password recovery, email verification, and email notifications remain unimplemented.
- No paid Cloudflare resource is enabled. R2 remains on hold.
