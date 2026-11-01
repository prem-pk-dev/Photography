# Golden Films media deletion — implementation design

Status: delete route is still design-only. Additive cleanup-ledger migration `migrations/0101_gf_media_cleanup_jobs.sql` has been drafted on the feature branch; it has NOT been applied to Preview or Production.

## Goals

Provide an owner-authorized permanent delete for uploaded media without leaving a public record pointing at a missing object, silently orphaning stored files, or incorrectly reducing monthly upload accounting.

## Existing behavior and constraints

- `POST /api/admin/projects/media/hide` sets `project_media.is_public = 0`; it does not delete a Supabase Storage object.
- `project_media.original_key` may be NULL for externally hosted media records. Never pass an empty key or an external URL to the Storage delete helper.
- A media row must not be deleted while its preview URL is the project's current `cover_image_url`. Require the owner to replace the cover first.
- Production D1 backup/export and migrations are paused until a real backup artifact can be downloaded and verified on the owner's PC.
- The existing Storage delete helper sends Supabase Storage's bulk-delete payload `{ prefixes: [key] }`; its behavior and exact-object semantics must be verified against the current Supabase Storage API before the endpoint relies on it.

## Required durable state

Use an additive migration on an isolated Preview D1 first. Add a cleanup ledger/outbox table (name proposed: `gf_media_cleanup_jobs`) containing at minimum:
- `id` primary key;
- `media_id` and `project_id` as plain identifiers so the cleanup record survives media-row deletion;
- `storage_key` (non-empty object key);
- `status` constrained to `pending`, `failed`, or `complete`;
- `attempt_count`, `last_error_code` (bounded, non-secret), `created_at`, `updated_at`, and `completed_at`.

Do not add a schema change to Production until backup/restore gates pass. The ledger must not store credentials, signed URLs, raw request bodies, or personal data beyond existing identifiers.

## Delete protocol

1. Authenticate the admin; require `role === "owner"`; validate the media ID.
2. In a D1 batch/transaction, read the media and project cover state, reject not-found and current-cover cases, and create an idempotent cleanup job while marking the media non-public. For rows with NULL `original_key`, do not invoke Storage deletion; handle them as database-only records with an audit event.
3. For a stored object, call the documented exact-object delete operation. Treat already-absent object as success only if the API's response semantics are confirmed.
4. On Storage failure, keep the media hidden and retain the pending job; return a stable `503 media_delete_cleanup_pending`. Do not erase the row or claim deletion succeeded.
5. On Storage success, use a D1 batch to delete the media row (guarded by ID/project/key) and mark the cleanup job complete, with an audit event. If this D1 step fails, the object is already absent; the durable job must remain retryable and the endpoint must not report full success.
6. Implement a bounded retry/reconciliation path for pending/failed jobs before shipping the endpoint. Retries must be idempotent and must never delete a different object's key.
7. Do not decrement monthly upload quota merely because an object is deleted unless product policy explicitly defines that ledger as current stored bytes. Current code uses it as a monthly upload quota; it should not be treated as current storage occupancy.

## Required tests before opening a PR

- unauthenticated request -> 401, no D1 writes and no Storage call;
- editor role -> 403, no D1 writes and no Storage call;
- malformed ID -> 400;
- unknown media ID -> 404;
- active cover image -> 409, no Storage call;
- NULL/empty original key -> no Storage call; documented database-only behavior;
- Storage success -> media hidden during cleanup, then row removed, job complete, audit present;
- Storage failure -> media stays hidden, job pending, stable 503, row retained;
- D1 failure after successful Storage deletion -> pending job remains recoverable; never claim full success;
- retry after timeout/duplicate request -> idempotent outcome;
- wrong/malformed key rejected before external call;
- exact object-delete API behavior verified with a disposable Supabase object, not Production media;
- schema migration tested on a disposable SQLite/D1 fixture and existing rows preserved.

## Release gates

- [ ] Confirm Supabase Storage exact-object delete contract and status codes from current official docs.
- [x] Draft additive cleanup-ledger migration `migrations/0101_gf_media_cleanup_jobs.sql` on the feature branch (not applied anywhere).\n- [ ] Execute migration and preservation checks on an isolated test database only.
- [ ] Implement cleanup ledger plus retry/reconciliation.
- [ ] Add injected Storage and D1 failure tests.
- [ ] CI passes on the feature branch.
- [ ] Verify live upload/read/delete with a disposable Preview object only, after confirming configured Preview credentials without exposing secrets.
- [ ] Review Production D1 backup artifact on PC; verify restore procedure before any Production schema/data change.
- [ ] Keep PR #87 and PR #63 unmerged until all relevant release gates are satisfied.

## Storage API contract review (2026-11-01)

- Reviewed the official Supabase Storage delete documentation and current `storage-js` implementation. The supported bulk-delete route is `DELETE /storage/v1/object/{bucketName}` with JSON body `{ prefixes: [objectPath] }`; the SDK's `remove(paths)` method uses this shape. Sources: https://supabase.com/docs/guides/storage/management/delete-objects and https://github.com/supabase/storage-js/blob/main/src/packages/StorageFileApi.ts.
- The current Worker helper uses that endpoint/body shape. This confirms the request contract at source level, but does not verify that this project's configured key, bucket, object key, and runtime permissions work. A disposable Preview object test is still required before release.
- Supabase explicitly says to delete objects through the Storage API rather than deleting Storage metadata through SQL; SQL deletion can orphan the underlying object. Source: https://supabase.com/docs/guides/storage/management/delete-objects.
- Remaining implementation gates are unchanged: durable cleanup ledger/retry, exact-key validation, owner/cover safeguards, failure-injection tests, and isolated Preview runtime verification.
