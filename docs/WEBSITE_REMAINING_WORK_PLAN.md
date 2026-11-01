# Golden Films — Complete Pending Work Inventory and Execution Plan

Date: 2026-11-01
Repository: `pkdiv6548/Photography`
Working branch: `feat/supabase-storage-free-tier`
Planning rule: finish tasks in dependency order; every task needs evidence before it is marked complete. CI success, a successful Pages build, or a table-presence check alone is not end-to-end completion.

## Summary

- **Total tracked pending/verification tasks: 26**
- **Priority P0 release blockers: 10** (Tasks 1–10)
- **Priority P1 core feature verification: 8** (Tasks 11–18)
- **Priority P2 quality and launch readiness: 6** (Tasks 19–24)
- **Priority P3 optional/deferred capabilities: 2** (Tasks 25–26)
- **End-to-end verified at plan creation: 0/26.** This is not a claim that no implementation exists: CI tests, source code, a Preview schema inspection, and runbooks already exist. The count means the listed acceptance criteria have not all been proven in the target runtime.

## Inventory and task-by-task acceptance criteria

Status labels: **PARTIAL** = code, tests, docs, or read-only evidence exists but acceptance is incomplete; **BLOCKED** = needs external access, an approved maintenance window, a hold to be lifted, or another dependency; **PENDING** = not yet verified or implemented.

### P0 — Release blockers (10 tasks)

1. **Verify latest Preview CI and deployment** — PARTIAL  
   Confirm CI success for the current feature-branch head and that Cloudflare's latest Preview deployment points to that exact commit. Record commit, deployment ID, and build status. Do not treat this as API verification.

2. **Run read-only Preview API health/readiness checks** — BLOCKED  
   From a permitted browser/network, inspect `GET /api/health` and `GET /api/ready`. Record status codes and sanitized boolean/blocker fields only. Current verification environment has been unable to reach Pages endpoints; this is not proof that the site is down.

3. **Verify Pages Functions/Worker API route bridge** — PENDING  
   Confirm required `/api/*` routes reach the intended Worker handler in Preview. Check health, readiness, and known route mapping without writing data. A static site loading is not sufficient.

4. **Verify Preview environment bindings and secret activation** — BLOCKED  
   Confirm Preview `DB` points to the designated test D1 database and the expected server-side Supabase settings are active. Never reveal secret values. Existing notes conflict on whether `SUPABASE_SERVICE_ROLE_KEY` is active; runtime confirmation is required. The prior hold on secret changes means inspect only until that hold is clearly lifted; do not rotate or change secrets as part of this plan.

5. **Complete canonical Worker-to-D1 schema contract audit** — PARTIAL  
   Preview currently has all required columns checked for categories, projects, translations, media, enquiries, auth, audit, CMS, and quota tables; `enquiries.email` is nullable and `PRAGMA foreign_key_check` returned no rows. Still verify required unique/primary-key conflict targets, relevant constraints, and every SQL query/column used by the Worker. Preview evidence is not Production evidence.

6. **Production D1 backup/export and checksum** — BLOCKED  
   Confirm the correct Production database identity and arrange a safe maintenance window. Export privately, verify export completion, record timestamp and SHA-256, and protect the artifact. No export/restore has yet been verified. Do not begin an export if it could disrupt service without an approved window.

7. **Restore Production export into disposable D1** — BLOCKED  
   Restore the verified export into an isolated non-production database. Compare schema catalog, table definitions, indexes, foreign keys, and pre-restore row counts. Never use Production itself as the rehearsal environment.

8. **Test forward migration against restored disposable copy** — BLOCKED  
   Reconcile legacy schema with Worker contract and test the candidate forward-only migration against the restored copy. Preserve category/project/media relationships and all existing data; do not fabricate consent or grant owner roles to legacy users. Repeat the restore/migration test from a clean copy.

9. **Production deployment configuration review** — BLOCKED  
   Confirm the actual Production Pages deployment, custom domain, production branch, Worker route binding, D1 binding identity, and environment settings. Current repository notes indicate Production D1 binding and some server-side secrets are missing/unconfirmed. Do not alter Production during this review.

10. **Production change approval and rollback gate** — BLOCKED  
    After tasks 6–9 pass, produce a change plan with exact migration, backup reference, rollback/recovery limits, validation commands, and go/no-go checklist. Production migration, secret/binding changes, deployment promotion, and PR merge require their applicable explicit approval. Keep relevant PRs Draft and unmerged until gates pass.

### P1 — Core feature verification (8 tasks)

11. **Admin owner setup, login, session, and logout E2E** — PENDING  
    In Preview, verify one-time setup only if the environment is not already initialized; otherwise do not rerun setup. Test valid/invalid login, session expiry, logout, rate limiting, and rejection of a second setup. Never create or promote a Production owner as a test.

12. **Admin authorization and role boundaries** — PARTIAL  
    Automated tests exist. Verify live unauthorized requests return 401/403 and confirm owner/editor boundaries for protected routes. No protected content or secrets may be returned to unauthenticated requests.

13. **CMS content editing, revisions, and publish/unpublish** — PENDING  
    Test draft save, revision creation/listing, publish/unpublish, and public rendering in isolated Preview. Restore the original content or remove test-only content after verification. Current five Preview CMS rows have empty JSON payloads, so content completeness is not established.

14. **Portfolio projects and category management** — PENDING  
    Test create/edit/delete-or-archive, publish/unpublish, featured selection, category assignment, sort order, and project detail reads in Preview. Current Preview has 14 categories but zero projects; test fixtures are needed. Verify Hindi/English titles and descriptions.

15. **Supabase Storage connection and private-bucket verification** — BLOCKED  
    Verify correct project/bucket identity and private access using sanitized configuration and an authorized test environment. Service-role secret changes remain subject to the existing hold. Do not expose keys or use a Production upload for testing.

16. **Media upload, validation, visibility, and quota E2E** — BLOCKED  
    After task 15 is authorized and ready, test JPEG/PNG/WebP/GIF and MP4/WebM within the 20 MiB per-file cap, reject invalid MIME/signature and oversized payloads, confirm shared 100 MiB UTC-month quota across admins, and confirm failed uploads release reservations. Use disposable Preview data only.

17. **Media privacy and cleanup** — PARTIAL  
    Automated regression tests cover unauthenticated upload/replace/hide protections and public-read checks. Verify a published media item can be read through the Worker, draft/unpublished media is not publicly served, and cleanup removes the test Storage object and related metadata. The current `hide` route is a privacy flag, not deletion; do not count it as deletion.

18. **Enquiry submit, persistence, admin review, and status update** — PENDING  
    Test valid/invalid submission, required-field rules including phone-only/email-optional compatibility, rate limiting, database persistence, private admin inbox, status changes, and spam/error behavior using synthetic Preview data. Delete/archive test enquiries after validation. No real customer messages.

### P2 — Quality and launch readiness (6 tasks)

19. **Bilingual experience and all 14 categories** — PARTIAL  
    Verify English/Hindi switching, remembered language where implemented, category navigation, titles/descriptions, fallback behavior, and layout on representative pages. Do not label demo assets as Sunil's actual work.

20. **Responsive and cross-browser page regression** — PENDING  
    Check homepage, portfolio/category/detail, services, about, showreel, contact, privacy/terms, login/admin screens, and 404 on desktop, tablet, and mobile. Frontend redesign remains on hold; this is regression verification only unless the user resumes UI work.

21. **Contact details, demo assets, and content readiness** — BLOCKED  
    Confirm real phone/WhatsApp/email/social links from the owner, replace or clearly mark sample assets, and verify every page's text/media. The current plan says real contact details have not yet been supplied. Do not invent contact details or claim demo media is actual work.

22. **SEO, accessibility, and performance audit** — PENDING  
    Check page titles/descriptions, canonical URLs, sitemap/robots, social previews, structured data, image alt text, keyboard navigation, focus states, contrast, semantic headings, form error messaging, reduced-motion support, image weight, and Core Web Vitals/basic loading behavior.

23. **Security and privacy review** — PARTIAL  
    Review secret exposure, headers, CORS/origin policy, session/cookie settings, rate limits, request size limits, file validation, private media handling, PII logging, enquiry retention/delete/archive policy, and authorization on every admin route. Fix and test any discovered gaps.

24. **Regression suite, Postman, and operational evidence** — PARTIAL  
    Run typecheck, Worker tests, migration fixtures, schema-contract tests, frontend production build, and the Postman collection against a test target. Confirm no collection writes to Production. Store sanitized evidence and final known-limitations list.

### P3 — Optional/deferred capabilities (2 tasks)

25. **Password recovery and email verification** — PENDING / DEFERRED  
    These are not implemented. Decide whether a genuinely free and secure delivery/verification path exists. Do not add paid services or weaken authentication to claim completion.

26. **Email notifications and future booking/order workflows** — PENDING / DEFERRED  
    Enquiry persistence must work even if email notification is unavailable. Email notifications, online booking, and photo/video editing orders are future scope; implement only after the portfolio release is stable and a free-tier-safe design is approved.

## Execution plan and dependencies

Work in this order; later tasks must not be marked done merely because earlier tasks passed.

### Phase A — Preview build and read-only verification
- Tasks 1–5.
- Recheck current CI and deployment commit; inspect readiness and route wiring; verify current Preview bindings/secrets by presence and sanitized runtime outcomes; finish the Worker SQL/constraint contract audit.
- Exit gate: CI green, Preview deployment matches the commit, health/readiness response captured, routes confirmed, and schema-contract gaps documented. If direct endpoint access is unavailable, mark the exact checks BLOCKED and continue only with safe source/fixture work.

### Phase B — Backup and schema safety
- Tasks 6–8.
- Arrange an approved maintenance window, export/checksum, restore into disposable D1, run forward migration and integrity/data-preservation tests, and repeat from a clean restore.
- Exit gate: reproducible migration rehearsal passes with evidence. Never run the candidate migration on Production during this phase.

### Phase C — Production configuration and release gate
- Tasks 9–10.
- Review production environment and routing; prepare a reviewed change/rollback plan. Keep production unchanged until required approval is explicit.
- Exit gate: written go/no-go decision. Do not merge PR #87 or PR #63 just to advance progress.

### Phase D — Preview functional E2E
- Tasks 11–18.
- Use isolated Preview/test accounts and synthetic content. Sequence admin auth/roles → CMS/projects → authorized Storage verification → media upload/privacy/quota/cleanup → enquiry workflow.
- Exit gate: each workflow has observed request/response evidence and clean test data; no Production customer writes.

### Phase E — Whole-site quality review
- Tasks 19–24.
- Verify bilingual navigation and all categories, responsive regressions, real content/contact links, SEO/accessibility/performance, security/privacy, and final CI/Postman suite.
- Exit gate: acceptance checklist and sanitized evidence reviewed.

### Phase F — Deferred scope decision
- Tasks 25–26.
- Record explicitly whether these remain deferred or are separately approved for implementation. Do not block the core portfolio release on future features unless the owner changes scope.

## Completion reporting format

For every continuation, report:
- Total tracked tasks: 26.
- Completed: count only acceptance criteria supported by evidence.
- In progress: tasks actively being worked.
- Blocked: exact external permission, access, hold, or dependency.
- Current task number and next task.
- Evidence: commit/run/deployment/check output where available.

Never claim the website is fully launched based only on CI or a successful Pages deployment. Keep the project within the approved ₹0 budget; do not enable billing or paid services.
