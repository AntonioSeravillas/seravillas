# Cloudflare service

- `worker.mjs`: reviewed manager sync and restricted cleaner API.
- `schema.sql`: empty D1 schema.
- Bindings: existing KV `DB`, new D1 `STAFF_DB`, existing secret `SECRET`.
- Optional `SITE_TIME_ZONE`: defaults to `Europe/Madrid` for cleaning completion dates.

Follow [the rollout guide](../docs/cloudflare-rollout.md). Merely committing these files does not deploy Cloudflare. Migration is explicit and requires a fresh, private backup.

Local tests run against an in-memory SQLite database with fictional records; they never connect to Cloudflare.
