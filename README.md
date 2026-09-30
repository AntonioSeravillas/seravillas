# SeraVillas

SeraVillas is a web app for managing a group of holiday villas: properties, bookings, cleaning and team tasks.

## What exists today

### Project structure

| File | What it is | Edit it when you want to change... |
| --- | --- | --- |
| `index.html` | The page itself: the HTML structure and the small theme script in the `<head>` | Page layout, sections, buttons, forms |
| `assets/css/app.css` | All styling | Colours, spacing, fonts, how things look |
| `src/app.js` | All application logic | What the app does: bookings, calendar, tasks, sync, voice actions |

`app.js` is a classic script (not a module) because the HTML uses inline click handlers such as `onclick="..."`. Keep it that way for now.

### How it works today

- The app keeps its data in the browser's storage (`localStorage`).
- It also uses an existing cloud-sync service to share data.
- **Warning:** opening the app can trigger production sync and booking migrations. There is no safe development preview yet, so do not open the app casually against real data. Keep exported data backups outside this repository.

## Planned (not built yet)

These are plans only. None of them exist in the app today.

- **Safe development preview:** a way to run the app without touching production sync or running booking migrations.
- **Manager access:** managers can see and do everything.
- **Cleaner logins:** cleaners see the full team calendar and cleaning schedule, without guest details or prices.
- **Bookings from Excel for 2026:** bookings will be imported from Excel.
- **Uplisting integration:** deferred to 2027.
