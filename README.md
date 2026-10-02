# SeraVillas

A web app for managing holiday villas, bookings, cleaning schedules, tasks, issues, contacts, and reports.

## Open the project in VS Code

Open this repository folder. The Top tabs redesign is being reviewed locally on `top-tabs-redesign`. It has not been published.

## Development preview

In the VS Code terminal, run:

```powershell
py -m http.server 5500 --bind 127.0.0.1
```

Open <http://127.0.0.1:5500/> and leave the terminal running. Stop the server with Ctrl+C.

The preview displays **Development preview — cloud sync disabled**. It opens without an access key, starts with fictional records dated around today, and keeps edits after refresh. You can restore a private backup into a separate localhost preview to review real records locally. Cloud requests and both historical booking migrations are disabled. Every preview storage key starts with `seravillas_dev:`. Existing production storage and access keys are kept separate.

Preview mode activates on localhost, 127.0.0.1, IPv6 loopback, and file://. Use the local server for normal development. Opening the hosted GitHub Pages app uses production login, data and sync. Completed historical imports are retired; their marker constants remain for Excel compatibility.

To reset the fictional data, remove only the `seravillas_dev:` entries in your browser's developer tools under Local Storage. Keep real exported backups outside this repository.

## Where to make changes

| Location | Responsibility |
| --- | --- |
| `index.html` | Page shell and script loading order |
| `assets/css/app.css` | Existing feature layouts and base components |
| `assets/css/workspace.css`, `src/ui/workspace.js` | Shared light/dark design, top navigation, calendar filters and month stay bars |
| `src/app.js` | Startup only |
| `src/config.js`, `src/storage.js` | Environment detection and isolated browser storage |
| `src/dev-seed.js` | Fictional preview records |
| `src/state/store.js` | Shared in-memory app and screen state |
| `src/data/` | Load/save, backups, versioned cloud sync and merge helpers |
| `src/features/cleaning-planner.js`, `assets/css/cleaning-planner.css` | Manager daily plan, checkout planning and staff coverage |
| `cleaner/`, `src/cleaner/`, `assets/css/cleaner-portal.css` | Separate cleaner page and its offline shell |
| `src/auth/cleaner-access.js` | Manager controls for personal cleaner codes |
| `cloudflare/` | Worker source and new D1 schema |
| `src/utils/dates.js` | Calendar and date helpers |
| `src/features/` | Home, calendar/bookings, tasks, cleanings, issues, management, properties, reports |
| `src/ui/` | Navigation, theme, animations, modals, shared actions, voice commands |
| `src/imports/excel-bookings.js` | Workbook parsing, booking matching, and import planning |
| `assets/vendor/sheetjs/` | Local workbook parser and license notices |
| `docs/excel-import.md` | Manager import workflow and preservation rules |
| `src/auth/session.js` | Existing access-key login and sign-out |
| `docs/design-system.md` | Colours, typography, spacing, components, navigation and theme conventions |
| `assets/css/fonts.css`, `assets/fonts/` | Self-hosted fonts shared by manager and cleaner pages |
| `docs/architecture.md` | How the files fit together and the next development stages |

These remain classic JavaScript scripts. Existing inline button handlers still use global functions. Keep the script order in `index.html`; load startup last. The feature split preserves the original code and does not introduce a framework or build requirement.

Some script URLs have a `?v=` release suffix so returning browsers fetch the updated file. When changing one of these scripts for a release, update its suffix in `index.html`; it does not change the file name on disk.

## Import bookings from Excel

Open **More → Properties → Import bookings from Excel** in the local preview. Choose the workbook, match its villa sheets, review changes, and resolve flagged rows before applying. The importer keeps IDs, notes, cancelled history, and cleaning links; a pre-import backup supports rollback. Your workbook stays unchanged. See [the step-by-step import guide](docs/excel-import.md).

The importer handles 2026 and 2027 bookings. Confirm the year, review the dates and resolve any mismatch with the workbook nights before applying. Selecting a workbook only prepares a review; applying in development stays local. Production application uses the existing cloud save process. Keep private workbooks and app exports outside Git.

## View next year in the calendar

In **Calendar → Timeline**, use **Go to month** to select a month in 2027. The timeline opens at that month and includes the following bookings and cleanings. **Today** returns to the current date. Changing this view does not edit booking data.

## Cancelled bookings and retained payments

In **Properties → Revenue**, expand **Cancelled bookings — money retained**, open the booking, and choose **Edit**. Enter the amount actually kept under **Money retained after cancellation (€)**. Use 0 for a full refund, the full booking price for a fully paid late cancellation, or the amount kept after a partial refund.

Retained money contributes to total, monthly, platform/agency and property revenue in the originally scheduled check-in month. Cancelled stays do not contribute to booking counts, average booking value, occupancy, booked nights or checkout cleanings. A cancelled booking's original price alone does not count as revenue. Excel updates and backups preserve the recorded retained amount; restoring a booking counts its active price once.

## Cleaning schedule and cleaner access

Open the **Cleaning** top tab (or **More → Manage → Schedule**) to plan any week, filter villas, review staff confirmations and cover missing checkout cleanings. The **Daily plan** and **By cleaner** views use the same assignment records. See [the cleaning guide](docs/cleaning-schedule.md).

Open <http://127.0.0.1:5500/cleaner/> for the separate fictional cleaner preview. It shows the full team schedule and villa calendar; each sample cleaner updates only her own assignments. The Cloudflare D1 database is activated and verified in production ([status and rollback](docs/cloudflare-rollout.md)). Cleaner codes are created by the manager in **More → Team → Cleaner logins**; local previews and tests never create real accounts.

The manager app still supports the existing shared access-key login. The new service checks snapshot versions, combines independent changes and asks for review when the same field changes on two devices. The cleaner page supports cached offline opening and queued assignment updates. The manager's full offline page shell, multiple workspaces, email/password recovery and Uplisting integration remain future work. Excel remains the source for 2026 and 2027 bookings.

Completed guest-row migrations are retired from the current public files. Older public Git history may still contain the original embedded rows; this release does not erase historical copies.

## Run the checks

Using Node.js in the VS Code terminal:

```powershell
node --test tests/app.test.js tests/excel-import.test.js tests/cleaner-backend.test.cjs tests/sync-merge.test.cjs
```

Use Node.js 24 or newer (the backend checks use the bundled SQLite API). The checks use fictional records, stubbed storage/network, and an in-memory SQLite database. They cover preview isolation and reload persistence, existing production key mappings, date boundaries, exact voice property matching, cleaning crew coverage, and preservation of saved sync/import metadata. The importer checks also cover duplicate prevention, explicit cancellation review, missing prices/counts, stable IDs, stale previews, scope preservation, rollback, and storage failures. They never contact the live Worker. UI rendering is checked separately in the local preview.
