# SeraVillas design system

## Top tabs direction — local review, 2 October 2026

Antonio selected Top tabs: white and soft grey, dark primary buttons, muted villa colours, outline navigation icons and dark mode. The opening screen remains the existing villa-and-date timeline. Month is an alternative view. Calendar details and navigation open as pop-ups; there is no permanent manager sidebar. This branch has not been published.

`assets/css/workspace.css` is the shared presentation layer, loaded after `app.css` and each page's feature styles. It overrides the old theme and shell while retaining component classes and handlers. `app.css` still provides legacy feature layouts. New shared styling belongs in `workspace.css`; do not add another theme layer.

## Tokens

| Role | Tokens |
| --- | --- |
| Page / surfaces | `--bg`, `--surface`, `--surface2`, `--surface3` |
| Text / lines | `--text`, `--text2`, `--text3`, `--border`, `--border2` |
| Primary action | `--accent`, `--accent-hover`, **`--on-accent`** |
| Selection | `--accent-bg`, `--accent-border`, `--accent-text` |
| Status | `--teal-*` for confirmed/done, `--amber-*` for offered/attention, `--red-*` for declined/cancelled/errors |
| Villa identity | `--villa-0-*` through `--villa-5-*` (`bg`, `border`, `text`) |

Use tokens in components. Villa identity is separate from booking platform and status. `propBarColor()` returns CSS variables that follow the selected theme, preserving the existing property index mapping. Pair backgrounds with matching text tokens. Primary buttons become light in dark mode, so use `--on-accent` rather than white.

Light is the default for new visitors. Saved `sv_theme` preferences remain respected; preview preferences use isolated storage. Both pages load self-hosted Plus Jakarta Sans and DM Mono through `assets/css/fonts.css`.

## Components and spacing

- Titles: 27px/700 on laptops, 24px on phones. Body 13–15px, controls 13–14px, secondary labels 11–12px.
- Cards: 18px radius, 1px border, no decorative shadow. Fields: 12px radius. Buttons: 22px radius, 42px minimum height (36px compact actions).
- Manager gutters: 32px laptop, 24px tablet, 14px phone. Header icons: 40px laptop, 36px phone.
- Reuse `.sv-btn`, `.sv-tabs`, `.sv-card`, `.sv-badge` and `.field`. Existing `.btn` controls inherit shared action styling.
- Navigation uses local outline SVGs. Legacy feature icons remain for later screen-specific refinement.
- Respect `prefers-reduced-motion`.

## Navigation

- Manager: **Bookings / Cleaning / More** at the top on every device. Phones have a wordmark/tools row and a navigation row.
- Bookings opens Timeline by default. Switching Timeline/Month retains the selected month.
- Cleaning directly renders the existing weekly planner, including Daily plan and By cleaner.
- More opens a dialog with Today, Tasks, Properties, Reports, Team and Manage. Existing Manage subsections remain accessible.
- Cleaner: Schedule and Calendar stay in the top header on phones and laptops. The former bottom navigation is hidden. Role-specific controls and API access are unchanged.

## Calendar and pop-ups

Timeline retains horizontal scrolling, month selection, bookings and cleaning markers. Bars use villa colours and open the existing booking detail dialog at every width.

Month uses Monday-based weeks across the available width, continuous stay segments, and daily signals for cleaning, arrivals/departures, tasks and events. Stays end at checkout (exclusive); day details include departures on checkout day. Overlapping stays receive separate lanes. Paid cancellations remain outside occupied-day bars, retaining revenue and history elsewhere. Villa and Cleanings only filters apply to both views and day details.

`showModal()` supplies dialog semantics, an explicit close button, Escape, a Tab focus loop and focus restoration. Dialogs are centred and scroll within the viewport. Do not reserve a calendar detail column. The development strip stays above the header in normal layout; the manager shell fills the remaining viewport with one scrolling content area.

## Release and verification

1. Check manager and cleaner at phone, tablet and laptop widths in both themes.
2. Verify both calendar views, filters, booking/day pop-ups, More destinations and cleaning planning.
3. Run existing tests: import preservation, cancellation revenue, sync conflicts and cleaner authorization. Calendar tests cover checkout exclusivity, overlap lanes, filters and view context.
4. Update URL suffixes and `CACHE` in `cleaner/sw.js` when cached assets change. Its offline shell includes the shared stylesheet.
5. Keep classic scripts and existing loading order. No framework or build step is introduced.
6. Publish after Antonio reviews the local redesign. Check cleaner offline reload after release; its service worker does not register in development.

## Remaining workflow work

This stage supplies shared styling, top navigation and the booking calendar. Dedicated refinements of Today, Tasks, Properties, reports and cleaner assignment workflows can follow preview review. The manager's offline page shell remains a separate infrastructure task.
