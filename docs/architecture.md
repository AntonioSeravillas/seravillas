# Architecture and development guide

## Current structure

The first restructuring keeps the existing HTML, CSS, global functions, and application behaviour. The large JavaScript file is split into smaller classic scripts. `index.html` is the authoritative loading order; `src/app.js` runs startup after every other script has loaded.

1. `config.js` identifies the environment before any storage is read.
2. `storage.js` maps keys: unchanged in production, `seravillas_dev:` prefix in the local preview.
3. The small head script applies the saved theme before the page paints.
4. `dev-seed.js` defines fictional records; production never seeds them.
5. `state/store.js` declares the shared `D` object, UI state, and sync state.
6. Data, utilities, UI, feature, authentication, and historical migration scripts define functions and register event handlers.
7. Vendored SheetJS, `imports/excel-bookings.js`, and `ui/excel-import.js` define workbook import support.
8. `app.js` loads data and starts the appropriate environment.

Cross-file functions and state remain global for compatibility with inline HTML handlers. This is a transition toward clearer boundaries, not a completed module system. Do not add `type="module"`, `async`, or `defer` to individual scripts without migrating their dependencies and handlers together.

## Feature guide

| File | Contents |
| --- | --- |
| `features/home.js` | Home dashboard and operations overview |
| `features/reports.js` | Weekly review, booking reports, quick-add menu |
| `features/calendar.js` | Calendar, event views, timeline, booking actions, WhatsApp draft helpers |
| `features/booking-operations.js` | Read-only selected-month cleaning coverage and list; existing crew/checkout planner actions remain responsible for edits |
| `features/booking-tools.js` | Existing availability calculation and gap display; agenda/event page wrappers |
| `features/settings.js` | App preferences, backup/storage controls, sync status and manager access |
| `features/tasks.js` | Task views, project views, task editing and photos |
| `features/cleanings.js` | Crew requirements, capacity, assignment, cleaner schedules |
| `features/cleaning-planner.js` | Pure cleaning projections, manager daily plan and missing checkout work |
| `data/sync-merge.js` | Three-way record/field merge for independent device changes |
| `auth/cleaner-access.js` | Manager code issuing/revocation controls |
| `src/cleaner/portal.js`, `cleaner/` | Separate cleaner page, restricted API client, queue and offline shell |
| `cloudflare/worker.mjs`, `cloudflare/schema.sql` | Reviewed server permissions, versioned snapshots and idempotent assignment updates |
| `features/issues.js` | Issue views/editing, supplies, scratchpad |
| `features/manage.js` | Management overview, contacts views, new cleaning dialog |
| `features/properties.js` | Property list/hub, photos, and related session/staff/contact dialogs |
| `ui/shell.js` | Shared display helpers, navigation, rendering, animations, theme |
| `ui/actions.js` | Shared CRUD helpers, notifications, import, modals and delegated handlers |
| `imports/excel-bookings.js` | Pure workbook parsing, matching, scope, import plans, and application |
| `ui/excel-import.js` | File selection, manager review, pre-import backup, application, and rollback |
| `ui/voice.js` | Local voice parser, exact property aliases, preview and command execution |

Some related actions are still in shared files because this stage preserves the original declaration and event-registration order. Move them into their owning feature gradually when those features are changed and tested. Do not create empty placeholder modules for future features.

The current UI gives each category its own page; see [the category guide](categories.md). Revenue renders directly through `booking-report`, with no Properties wrapper. Legacy `manageTab` routes retain compatibility with existing dashboard links while showing only their own content. Weekly review remains implemented in `reports.js` but opens under Overview. The sidebar and phone category dialog share one navigation registry. App administration controls have moved out of Properties into Settings, and the existing gap analysis is in Booking tools.

## Cancellation revenue

Bookings may carry a numeric `cancellationRevenue` amount in euros, explicitly entered by the manager after cancellation. Missing values mean zero retained income. `bookingRevenueSummary` in `features/reports.js` aggregates prices and retained payments in integer cents, using the scheduled check-in year/month. Active prices contribute to stay averages; retained cancellations contribute only to revenue. The report keeps its occupancy and booked-night calculations limited to active stays. Backups, cloud snapshots and Excel updates preserve the retained amount.

## Data boundaries

`data/local-data.js` owns the current load/save and daily backup behaviour. It restores `_savedAt`, `_migrations`, and `importHistory` from stored data so offline reloads retain the sync version and completed import markers. Old backups without valid metadata use safe defaults. `data/cloud-sync.js` owns GET/POST synchronization with conditional versions and three-way merge after cloud activation. `auth/session.js` owns the existing manager access-key login. The actual Worker source has been read and the new reviewed service is in `cloudflare/`. Cloudflare D1 is activated and verified in production; see the rollout guide for status and rollback.

The local preview never needs a production key. Cloud functions and both historical migrations return without action in development. Preview edits and backups use separate storage keys.

`data/legacy-booking-migrations.js` retains only Excel marker constants and empty compatibility hooks. Completed guest-row imports were removed from the current public files after the cloud imports were verified. Public repository history may still contain those original records; history cleanup remains separate work.

## Agreed roadmap

1. Keep the local preview and focused checks working during restructuring.
2. Preserve stored metadata, stable IDs, cancelled history, notes, and cleaning links when improving data loading and imports.
3. The Excel importer handles 2026 and 2027 RESERVES workbooks with year selection, date/nights review, exact property mapping, duplicate/match checks, and backup rollback. Missing rows require a complete snapshot plus individually selected cancellations. Other arrival years are preserved. See [Excel import details](excel-import.md).
4. Review the existing Worker; introduce individual accounts, workspace isolation, and server-enforced manager/cleaner permissions. Cleaner responses and caches must exclude guest details and prices while showing the full team schedule.
5. Add an app-shell cache, IndexedDB records, durable pending edits, and visible record conflicts. Avoid silently choosing one entire device snapshot.
6. Add Uplisting imports as a separate future feature, preserving Excel-managed history and operational notes.

The cleaning stage preserves the established visual theme and adds a separate cleaner page plus reviewed backend source. It is published and Cloudflare D1 is active in production. The manager page shell and multi-tenant normalized data model are still future stages. See [cleaning workflows](cleaning-schedule.md), [cloud rollout](cloudflare-rollout.md) and the [design system](design-system.md).
