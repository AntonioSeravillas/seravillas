# Cleaning schedule and team access

## Manager workflow

Open **Manage → Schedule**. Select any week (including 2027), filter by villa, and switch between **Daily plan** and **By cleaner**.

Each cleaning shows its time, checkout time, next arrival, confirmed/offered staff, and how many people are still needed. Existing `cleanerIds` assignments count as confirmed; explicit crew assignments preserve their offered/confirmed/cancelled status. Alina's allocated team spots also appear in the cleaner grid.

**Checkout cleanings to plan** lists bookings without a correctly linked cleaning. **Schedule cleaning** creates one unassigned cleaning and links it to the booking. **Link existing cleaning** links a matching session. Mismatched dates/villas require review. Cancelled bookings do not generate checkout work.

Use **Assign team** to offer work and confirm assignments. The app checks same-day assignment clashes and Alina's four-person daily capacity. Moving a session to another date or time offers it again and clears old completion stamps. A cleaner marking her own work done does not close the whole cleaning; the manager closes the session after the team finishes.

## Individual cleaner access

The separate `cleaner/` page shows the full team schedule and a villa calendar with arrival/departure times. It loads only the restricted API; it never loads the manager app, historical booking imports, or the manager access key.

The cloud database is active in production (see [cloud rollout](cloudflare-rollout.md)). Open **Manage → Cleaners → Cleaner logins**. Create one personal code for each cleaner. Codes are random, shown once, and stored as hashes on the server. Share each code privately yourself. Replacing or disabling a code stops further cloud access with the old code.

Each account is tied to the existing cleaner ID. The server allows only that person's confirmation, decline and completion actions. Alina's account can update her aggregate team allocation; it cannot change the number of spots. Other people's work, staff assignments, villa details and bookings are manager-only changes.

Guest names, counts, prices, financial reports, contact details, photos and free-form manager notes are excluded from cleaner responses. An existing offline download cannot be remotely erased; sign-out removes this portal's local cache and pending updates.

## Offline use

Open the cleaner page and sign in online once. Its own page shell is cached by a service worker restricted to `cleaner/`. The last downloaded week remains available after an offline reload. Confirmations, declines and completion updates are queued on the device, then retried when the connection returns or **Refresh** is pressed. Retried updates have an operation ID so they apply once.

If the manager moves, removes, closes or reassigns work, an old queued update is rejected and displayed for review. Other staff updates can proceed. Only one unsynced action per assignment is allowed, so an offline confirmation cannot accidentally be followed by an unconfirmed completion.

The manager app keeps loaded data and edits in browser storage. Its entire page shell is not yet installable offline. Versioned sync merges independent edits and asks the manager to resolve conflicting fields; it preserves a baseline across reloads. Existing local backups and Excel import rollback remain available.

## Local preview in VS Code

Start the repository's local server as described in the README. Open `/` for the manager preview or `/cleaner/` for the fictional cleaner preview. Localhost disables all real cloud requests. Select a sample cleaner to try the team view and assignment buttons.

## Release status

The cleaning planner, cleaner page and backend are published, and Cloudflare D1 is activated and verified in production (see [cloud rollout](cloudflare-rollout.md)). Visual changes follow [the design system](design-system.md). No real cleaner accounts are created by tests or previews.
