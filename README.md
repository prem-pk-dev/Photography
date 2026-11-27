# Golden Films

A bilingual (English/Hindi) photography, videography, photo-editing and video-editing portfolio for Sunil.

## Current milestone

The responsive portfolio frontend and Cloudflare Pages Functions API bridge are in `main`. The UI includes 14 portfolio categories, services, sample-labelled demo imagery, an English/Hindi switcher, and an enquiry form wired to `POST /api/enquiries`.

The API foundation, admin authentication/CMS routes, GitHub-backed media workflow, and read-only Pages API smoke checks are implemented. Production Pages Functions and the Production `DB` binding were confirmed in deployment metadata. The latest merged `main` commit verified on 2026-11-27 is `fa96e0e70556dbecbe8e41f72ac195298c6c8fd4` (PR #131); its post-merge CI passed. The Cloudflare Pages check for that exact commit passed and returned `https://105d60cf.golden-films.pages.dev`, explicitly labelled as a Preview URL. Production custom-domain promotion was not independently established by that check.

### Latest Preview verification (2026-11-27)

- PR #128 added a secret-backed authenticated Preview Admin/CMS E2E workflow and was merged. On the exact PR head, the E2E assertions passed for login/session, authenticated identity and role, CMS page listing, home revision listing, logout, and rejection of the logged-out session. The standard CI suite also passed.
- A subsequent Preview-only media upload test used the existing draft `Delete Test` project and isolated Preview D1. The Admin API/UI showed the private draft media record, immutable GitHub URL, and English/Hindi alt text. The Admin UI exposed an image element and Open media link; a separate byte-level fetch of the raw image URL was not independently confirmed.
- The disposable test media and its Preview metadata were then deleted. Fresh Admin API data confirmed the test ID was absent and counts returned to the pre-test state: two pre-existing Delete Test media records and one Jaipur Wedding media record. Those older records were left untouched.
- PR #129 refreshed the release documentation and was squash-merged as `935ba885cd2ff82db42de4dabe359e39a6282b96`. Exact-head standard CI, authenticated Preview E2E, and Preview deployment checks passed. Post-merge standard CI and the Cloudflare Pages check also passed; the returned Pages URL is labelled Preview, so this does not establish Production custom-domain promotion.
- PR #130 corrected the release checkpoint documentation and was squash-merged as `ab5cc2d494154b0cafc098037939530cc0f95829`; exact-head standard CI, authenticated Preview E2E, Preview deployment, and post-merge CI/Pages checks passed.
- PR #131 added four mock-D1 tests for authenticated editor draft save, validation rejection before writes, revision restore as an unpublished draft, and malformed stored revision rejection. It was squash-merged as `fa96e0e70556dbecbe8e41f72ac195298c6c8fd4`. Exact-head standard CI (`46009864903`), authenticated Preview E2E (`46009864816`), and Preview deployment (`https://bf88ac9e.golden-films.pages.dev`) passed; post-merge CI (`46010011499`) and Pages check passed with Preview URL `https://105d60cf.golden-films.pages.dev`. These mock-D1 tests do not prove live Preview CMS mutations or Production behavior.
- These Preview tests did not modify Production D1, Production secrets/bindings, customer records, or published portfolio content.

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
