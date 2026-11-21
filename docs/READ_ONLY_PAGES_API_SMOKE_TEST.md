# Read-only Pages API smoke test

Use the repository script to verify the deployed Pages API from a machine with outbound HTTPS access.

```sh
node scripts/smoke-pages-api.mjs https://<preview-deployment>.golden-films.pages.dev
```

The script sends only three GET requests:

- `GET /api/health` — confirms the API health contract.
- `GET /api/ready` — confirms the Worker reports a ready, legacy-compatible schema.
- `GET /api/content?page=home` — confirms the published home-content response shape.

It rejects non-HTTPS URLs, fails on redirects, applies a 10-second timeout per request, and checks JSON content type plus `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. It never signs in, creates users, submits enquiries, changes content, or writes to D1.

A passing smoke test is runtime evidence for the exact URL tested only. It does not validate a Production migration, prove all schema/data safety gates, or authorize database writes. Run against Preview first; Production checks should remain read-only and only be performed when explicitly approved.

The pull-request workflow validates script syntax and safe refusal behavior without making external requests or consuming Pages/D1 resources.
