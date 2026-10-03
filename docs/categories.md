# Workspace categories

Local redesign review, 2 October 2026. Every existing feature has a home; no records are migrated when navigating.

| Category | Contents |
| --- | --- |
| Today | Daily arrivals, departures, cleanings, priorities and contextual shortcuts |
| Bookings | Default villa/date timeline, Month, villa filters, booking creation and editing, cancellation history, calendar day pop-ups |
| Bookings → Booking tools | Excel imports, availability/free-night analysis, upcoming agenda, calendar events, add-cleaning/event shortcuts and schedule sharing |
| Cleaning | Weekly planning, Daily plan / By cleaner, checkout planning, staff coverage, assignments, confirmations, completion and message drafts |
| Tasks | Capture, task board/list, property work, projects, growth tasks, photos and completed work |
| Properties | Villa list, creation/removal, details, photos and notes; each villa hub includes its related bookings, sessions, tasks, issues and history |
| Reports | Revenue by year/month, channel/agency and villa; booking value, occupancy, booked nights and retained cancellation income |
| Team | Cleaner roster, contact details, add/edit/remove staff and individual cleaner logins |
| Overview | Operations summary and shortcuts; Weekly review keeps completion charts, issue tracking and project progress |
| Issues | Repairs, status/priority filters, details, photos and resolution |
| Stock | Supplies, quantities, requirements and stock adjustments |
| Contacts | Service-provider directory, category/status filters, search and contact details |
| Notes | Operations scratchpad |
| Settings → Preferences | Theme choice and day-before cleaning reminders |
| Settings → Data & backups | Browser storage usage, full JSON export/import, automatic-backup restore and restore-before-Excel-import snapshot |
| Settings → Sync & access | Cloud status/manual sync and the manager's sign-out/change-access-key control |

## Navigation rules

- Revenue is its own route, `booking-report`. Rendering it never changes the selected category to Properties.
- Properties never switches to Revenue based on the legacy `propsView` flag.
- Management routes retain their existing `manageTab` values for compatibility with existing dashboard shortcuts, but render only the selected category. The old mixed management tab strip is gone.
- The desktop sidebar and the phone More dialog share `WORKSPACE_NAV_GROUPS`. Every management section and Settings can be opened directly on either device.
- Settings is pinned at the bottom of the desktop sidebar. The sidebar remains collapsible.
- Calendar events, agenda and availability are child routes of Bookings, with a Back to Bookings control. Timeline and Month remain the two main booking views.
- Weekly review is a child of Overview. Its existing charts and issue navigation are retained.
- Global navigation and relevant contextual shortcuts remain available. Pages do not include unrelated category switchers or app administration cards.

## Preservation

The same handlers still perform imports, exports, restore confirmation, sync, staff access and edits. The category reorganization does not alter booking IDs, Excel history, cancelled records, retained payments, cleaning links, cloud conflict handling, offline data or cleaner permissions. Preview storage stays isolated and cloud access remains disabled locally.
