# Cloudflare rollout for cleaner access

## Current status

As of 2026-10-01 the **Cloudflare D1 database is activated and verified in production** (confirmed by the project owner). D1 is the authoritative store for the manager snapshot; the old KV snapshot is a historical backup and is not mirrored. The sections below are kept as the record of the activation procedure and as the rollback reference. Do not repeat the migration step. The server rejects a second activation.

This status is recorded by hand. Re-check the live `/api/admin/capabilities` response (manager key) before relying on it for a release.

## Review before activation

The existing Worker `seravillas-sync` uses the `DB` KV binding, key `seravillas`, and a `SECRET` environment variable. The reviewed source is now version-controlled in `cloudflare/worker.mjs`. Keep credentials in Cloudflare secrets, never in Git.

The upgrade adds a **D1** database bound as `STAFF_DB`. It provides conditional revisions and atomic update/receipt transactions. This avoids the concurrent overwrite behavior of KV. See Cloudflare's [KV consistency documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/) and [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).

Until a D1 snapshot is explicitly activated, the Worker continues using existing KV manager sync and cleaner access is disabled. Publishing the manager frontend must precede activation: old pages cannot save after activation until refreshed. Their local data remains available for export.

## Deployment sequence

1. Obtain approval to publish this release and activate the new database in the existing Cloudflare account. Review both the manager and cleaner previews. Do not create real cleaner codes during deployment.
2. Pause edits on all manager devices during the data copy. Export a fresh cloud backup outside Git, preserving the exact GET response text and its SHA-256 hash. Verify the 2026/2027 records, cancellation payments and non-booking collections.
3. In Cloudflare **Storage & databases → D1**, create `seravillas-app`. Check the account's plan and limits; do not purchase an upgrade automatically. Run the statements from `cloudflare/schema.sql` in the new database's console. It creates empty tables only.
4. Add a **D1 database** binding named `STAFF_DB` to `seravillas-sync`. Preserve the existing `DB` KV binding and `SECRET`. Replace the Worker source with `cloudflare/worker.mjs` and deploy. Manager GET/POST continues using KV at this stage.
5. Publish the frontend release to the GitHub Pages `main` branch. Verify the changed files are served, the manager app still connects, the cleaner page opens, and **Cleaner logins** reports that activation is pending.
6. Fetch a fresh manager GET and store another private backup/hash. POST `{ "sourceHash": "<hash of exact GET text>" }` to `/api/admin/migrate`, authenticated with the existing manager `X-Secret` header. The server rejects a changed source or a second activation. It copies the existing snapshot into D1 at revision 1, preserving all records. It leaves the old KV snapshot in place.
7. Verify manager GET returns the identical data and an `ETag`; `/api/admin/capabilities` should report both features enabled. Reload manager devices. If local edits are newer, the app offers an export and a merge review instead of replacing them silently.
8. Verify an invalid cleaner code cannot read data, and a cleaner cannot use manager routes. Creating real accounts is a separate manager action. After access is approved for a person, the manager creates and privately shares that person's code through **Cleaner logins**.

## API boundaries

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /` | Manager key | Full app snapshot; ETag after activation |
| `POST /` | Manager key + current If-Match after activation | Save reviewed manager changes |
| `GET /api/admin/capabilities` | Manager | Activation status |
| `POST /api/admin/migrate` | Manager | Explicit, hash-guarded KV → D1 copy |
| `GET/POST /api/admin/accounts` | Manager | List, issue/replace or revoke cleaner codes |
| `GET /api/cleaner/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD` | Personal bearer code | Whitelisted team schedule and occupancy dates, maximum 63 days |
| `POST /api/cleaner/assignment` | Personal bearer code | Confirm/decline/complete own assignment only, with version and operation ID |

All API responses are non-cacheable. The cleaner service worker caches only its page shell and static assets. Requests from other browser origins are rejected; the allowed production origin is `https://antonioseravillas.github.io`.

## Storage limits and next stages

The first D1 stage keeps the complete app snapshot in one revisioned row. This preserves the existing app data model while protecting concurrent writes. It is a transition, not a complete multi-tenant PMS database. Workspace tenancy, email/password recovery and normalized booking/staff tables remain future stages.

The Worker rejects snapshots above 1.8 MB, below D1's [2 MB row/string limit](https://developers.cloudflare.com/d1/platform/limits/). Move embedded photo blobs to object storage before approaching that limit. Existing photos are preserved during this upgrade. Cleaner retry receipts are retained; add a documented retention policy as usage grows.

## Rollback

Before activation, reverting the Worker/frontend leaves KV current and requires no data migration. After activation, D1 is the authoritative store: the old KV snapshot is a historical backup and is **not** automatically mirrored.

For an emergency rollback after activation, pause edits and cleaner updates, export the latest authenticated D1 snapshot, disable cleaner access, and verify that backup before restoring it to KV with the old Worker. Do not simply deploy the old Worker against stale KV. Preserve the D1 database and all backup files for recovery. Reload manager devices and clear their cloud baseline only as part of this reviewed rollback.

## Public source history

Completed embedded guest imports have been removed from the current source. The Excel marker constants and compatibility function names remain. The bookings themselves stay in authenticated app data.

Older public Git commits may still contain the embedded guest rows from the original app. This release does not rewrite Git history, erase existing copies, or claim to resolve that historical exposure. Review repository-history cleanup separately before a broader product launch.
