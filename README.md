# SeraVillas

SeraVillas is a web app for managing a group of holiday villas: properties, bookings, cleaning and team tasks.

## What exists today

### Project structure

| File | What it is | Edit it when you want to change... |
| --- | --- | --- |
| `index.html` | The page itself: the HTML structure and the small theme script in the `<head>` | Page layout, sections, buttons, forms |
| `assets/css/app.css` | All styling | Colours, spacing, fonts, how things look |
| `src/app.js` | All application logic | What the app does: bookings, calendar, tasks, sync, voice actions |
| `src/config.js` | Runtime configuration: decides production vs development mode | Which environments count as development |
| `src/storage.js` | Storage adapter: all browser-storage access goes through it | How storage keys are named |
| `src/dev-seed.js` | Fictional sample data for the development preview | The sample properties, bookings, tasks, etc. |

`app.js` is a classic script (not a module) because the HTML uses inline click handlers such as `onclick="..."`. Keep it that way for now.

### How it works today

- The app keeps its data in the browser's storage (`localStorage`).
- It also uses an existing cloud-sync service to share data.
- **Warning:** opening the app can trigger production sync and booking migrations. Use the development preview (below) instead of opening the hosted app with real data. Keep exported data backups outside this repository.

## Development preview (safe mode)

The app switches to **development mode** automatically on `localhost`, `127.0.0.1`, `[::1]` and `file://`. It is never on for the hosted GitHub Pages site.

In development mode:

- There is no cloud access: no sync requests, no timers, no login check, and the production access key is never read.
- Both booking migrations are skipped.
- There is no access-key screen. The app opens straight away.
- All browser-storage keys start with `seravillas_dev:`, so production data is never touched.
- On first use it fills only that development storage with fictional sample properties, cleaners, bookings, cleaning sessions, tasks and issues, dated around today. Your edits are kept after reloading.
- A label reads **Development preview — sample data**, and the sync controls say cloud sync is disabled.

To start it, open the VS Code terminal in this repository and run:

```
py -m http.server 5500 --bind 127.0.0.1
```

Then open <http://127.0.0.1:5500/>.

To reset the sample data, clear the `seravillas_dev:` entries in your browser's storage (DevTools → Application → Local Storage).

## Planned (not built yet)

These are plans only. None of them exist in the app today.

- **Manager access:** managers can see and do everything.
- **Cleaner logins:** cleaners see the full team calendar and cleaning schedule, without guest details or prices.
- **Bookings from Excel for 2026:** bookings will be imported from Excel.
- **Uplisting integration:** deferred to 2027.
