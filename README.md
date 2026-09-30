# SeraVillas

A web app for managing holiday villas, bookings, cleaning schedules, tasks, issues, contacts, and reports.

## Open the project in VS Code

Open this repository folder. The local working branch is `app-structure`.

## Development preview

In the VS Code terminal, run:

```powershell
py -m http.server 5500 --bind 127.0.0.1
```

Open <http://127.0.0.1:5500/> and leave the terminal running. Stop the server with Ctrl+C.

The preview displays **Development preview — cloud sync disabled**. It opens without an access key, starts with fictional records dated around today, and keeps edits after refresh. You can restore a private backup into a separate localhost preview to review real records locally. Cloud requests and both historical booking migrations are disabled. Every preview storage key starts with `seravillas_dev:`. Existing production storage and access keys are kept separate.

Preview mode activates on localhost, 127.0.0.1, IPv6 loopback, and file://. Use the local server for normal development. Opening the hosted GitHub Pages app still uses production login, data, sync, and migrations.

To reset the fictional data, remove only the `seravillas_dev:` entries in your browser's developer tools under Local Storage. Keep real exported backups outside this repository.

## Where to make changes

| Location | Responsibility |
| --- | --- |
| `index.html` | Page shell and script loading order |
| `assets/css/app.css` | Styling and the existing responsive design |
| `src/app.js` | Startup only |
| `src/config.js`, `src/storage.js` | Environment detection and isolated browser storage |
| `src/dev-seed.js` | Fictional preview records |
| `src/state/store.js` | Shared in-memory app and screen state |
| `src/data/` | Load/save, backups, cloud sync, historical migrations |
| `src/utils/dates.js` | Calendar and date helpers |
| `src/features/` | Home, calendar/bookings, tasks, cleanings, issues, management, properties, reports |
| `src/ui/` | Navigation, theme, animations, modals, shared actions, voice commands |
| `src/imports/excel-bookings.js` | Workbook parsing, booking matching, and import planning |
| `assets/vendor/sheetjs/` | Local workbook parser and license notices |
| `docs/excel-import.md` | Manager import workflow and preservation rules |
| `src/auth/session.js` | Existing access-key login and sign-out |
| `docs/architecture.md` | How the files fit together and the next development stages |

These remain classic JavaScript scripts. Existing inline button handlers still use global functions. Keep the script order in `index.html`; load startup last. The feature split preserves the original code and does not introduce a framework or build requirement.

Some script URLs have a `?v=` release suffix so returning browsers fetch the updated file. When changing one of these scripts for a release, update its suffix in `index.html`; it does not change the file name on disk.

## Import bookings from Excel

Open **Properties → Import bookings from Excel** in the local preview. Choose the workbook, match its villa sheets, review changes, and resolve flagged rows before applying. The importer keeps IDs, notes, cancelled history, and cleaning links; a pre-import backup supports rollback. Your workbook stays unchanged. See [the step-by-step import guide](docs/excel-import.md).

The importer handles 2026 bookings. Selecting a workbook only prepares a review; applying in development stays local. Production application uses the existing cloud save process. Keep private workbooks and app exports outside Git.

## Current data and future work

The current app uses browser storage (`localStorage`) and an existing Cloudflare Worker for whole-app synchronization. Individual user accounts, restricted cleaner access, and reliable conflict handling are future work.

- You need full manager access to your workspace.
- Cleaner accounts should show the **full team calendar and cleaning schedule**, excluding guest details and prices.
- Your Excel table is the booking source for **2026**; the workbook importer and review screen are built.
- Uplisting integration is deferred to **2027**.
- Installable offline opening, a durable edit queue, and record-level conflict handling remain to be built. Existing local data persistence is not the complete offline/cloud design.

## Run the checks

Using Node.js in the VS Code terminal:

```powershell
node --test tests/app.test.js tests/excel-import.test.js
```

The checks use fictional records and stubbed storage/network. They cover preview isolation and reload persistence, existing production key mappings, date boundaries, exact voice property matching, cleaning crew coverage, and preservation of saved sync/import metadata. The importer checks also cover duplicate prevention, explicit cancellation review, missing prices/counts, stable IDs, stale previews, scope preservation, rollback, and storage failures. They never contact the live Worker. UI rendering is checked separately in the local preview.
