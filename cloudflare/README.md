# Cloudflare service

- `worker.mjs`: reviewed manager sync and restricted cleaner API.
- `schema.sql`: empty D1 schema.
- Bindings: existing KV `DB`, new D1 `STAFF_DB`, existing secret `SECRET`.
- Optional `SITE_TIME_ZONE`: defaults to `Europe/Madrid` for cleaning completion dates.

- Jarvis live relay: `relay_devices` and `relay_jobs` in `STAFF_DB`, created automatically on the first manager relay request. They never touch `app_state` or KV and need no migration. See [the Jarvis live release guide](../docs/jarvis-live-release.md).

Follow [the rollout guide](../docs/cloudflare-rollout.md). Merely committing these files does not deploy Cloudflare. Migration is explicit and requires a fresh, private backup.

Local tests run against an in-memory SQLite database with fictional records; they never connect to Cloudflare.

- Uplisting read-only preview: optional secret `UPLISTING_API_KEY` (the account API key; never in Git). Manager-only `GET /api/uplisting/status` and `GET /api/uplisting/preview?year=2027`; GET requests to three documented read paths only; status metadata in KV key `uplisting_status`. See [the Uplisting integration notes](../docs/uplisting-integration.md).
