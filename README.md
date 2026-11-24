# Golden Films

A bilingual (English/Hindi) photography, videography, photo-editing and video-editing portfolio for Sunil.

## Current milestone

The responsive portfolio frontend and Cloudflare Pages Functions API bridge are in the main branch. The UI includes 14 portfolio categories, services, sample-labelled demo imagery, an English/Hindi switcher, and an enquiry form wired to `POST /api/enquiries`.

The API foundation, admin authentication/CMS routes, GitHub-backed media workflow, and read-only Pages API smoke checks are implemented in the repository. Production Pages deployment metadata confirms that Pages Functions are active and the `DB` binding points to the existing `golden-films-db` D1 database. A manual, GET-only Pages API smoke workflow against Preview was subsequently reported successful by the repository owner (green GitHub Actions check, 2026-11-21). This Preview result must not be interpreted as proof that authenticated admin/CMS flows or Production writes have been validated.

## Production D1 safety status

Production D1: `golden-films-db` (ID `0241231b-6e6c-410b-a5ac-958eeb424a78`).

A read-only catalog/PRAGMA audit on 2026-11-21 confirmed the queried Worker-facing tables and columns, including categories, projects, translations, project media, enquiries, admin users/sessions, CMS content/revisions, and rate-limit/audit tables. The audit reported `changed_db: false` and `rows_written: 0`; no row contents were read.

The `d1_migrations` history table was absent. No Production export has yet been downloaded and restored into a separate disposable D1 database. The exact historical migration path and data-preservation behavior therefore remain unverified. **Do not apply baseline migrations `0001`–`0006` blindly to Production.** First plan an approved export/maintenance window, restore to a disposable database, test the exact forward-only migration, and verify data preservation and integrity. Obtain explicit approval before any Production D1 write/migration, secret change, or binding change.

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
- The Preview Pages API read-only smoke workflow has passed according to the owner. The script checks `GET /api/health`, `GET /api/ready`, and `GET /api/content?page=home`; it refuses non-HTTPS URLs and redirects.
- Live authenticated browser/API E2E remains unverified: owner setup, login/session/logout, rate limiting/audit events, CMS revisions/publish, and owner/editor permission boundaries still need isolated Preview verification.
- Non-destructive GitHub-backed media upload/read/alt-text verification against a disposable Preview project remains pending. Do not modify existing portfolio media during testing.
- Production D1 migration rehearsal remains blocked pending an approved export restored into a disposable database and a successful exact forward-migration test. Never use Production D1 for Preview testing.
- Password recovery, email verification, and email notifications remain unimplemented.
- No paid Cloudflare resource is enabled. R2 remains on hold.
