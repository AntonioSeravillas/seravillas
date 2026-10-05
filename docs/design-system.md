# SeraVillas design system

## Operations workspace — 4 October 2026

Antonio selected the Finom-inspired **Operations workspace** concept after reviewing three interactive directions. It uses a cool grey canvas/sidebar, white 22px panels, charcoal pill buttons, Manrope typography, outline icons and muted sage, lilac, sand and other villa colours. Dark mode has matching tokens. The opening screen remains the existing villa-and-date timeline; Month is an alternative. Calendar details open as pop-ups. Desktop retains the collapsible category sidebar; phones use a floating bottom menu. The release changes the shared frontend design; the existing Cloudflare Worker and database schema remain unchanged.

The reference came from Antonio's screenshot and Finom's public dashboard tour; its signed-in app was unavailable. Motion is our proposed interaction design, not a claim to reproduce Finom's private animations.

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

Light is the default for new visitors. Saved `sv_theme` preferences remain respected; preview preferences use isolated storage. Both pages load self-hosted Manrope through `assets/css/fonts.css`; Plus Jakarta Sans and DM Mono remain available to legacy components. The cleaner offline cache includes both Manrope subsets and its license is retained with the assets.

## Components and spacing

- Titles: 30px/700 on laptops, 27px on phones (24px below 370px). Body 13–15px, controls 13–14px, secondary labels 11–12px.
- Main panels: 22px radius and no decorative border/shadow. Nested cards keep a quiet 1px border where useful. Fields: 12px radius. Buttons: 24px radius, 44px minimum height (36px compact desktop actions).
- Manager gutters: 32px laptop, 24px tablet, 14px phone. Header icons: 40px laptop, 44px phone.
- Reuse `.sv-btn`, `.sv-tabs`, `.sv-card`, `.sv-badge` and `.field`. Existing `.btn` controls inherit shared action styling.
- Navigation uses local outline SVGs. Legacy feature icons remain for later screen-specific refinement.
- Respect `prefers-reduced-motion`.

## Navigation

- Manager desktop (1024px and wider): a 210px left sidebar lists all categories, including individual management sections. **Hide navigation** closes it; the header menu button reopens it. The choice is saved on the device through `SV_STORAGE` as `sv_sidebar_collapsed`, outside synced app records. Closing it expands the content and reveals **Bookings / Cleaning / More** in the header. Hidden navigation is inert. Collapse uses a short width transition; reduced motion disables it.
- Phones below 768px use a floating bottom island with exactly **Home / Calendar / Tasks / More**, outline icons and a charcoal selected pill (light selected pill in dark mode). The header contains only the wordmark and tools. More opens the category dialog; Cleaning and Team remain available there. The island respects the bottom safe area, and content, toasts and the Home voice button leave room above it. The active item follows the current category: booking child routes select Calendar; other categories select More. The desktop sidebar preference does not affect this menu.
- Tablets from 768px to 1023px keep **Bookings / Cleaning / More** in the header.
- Bookings opens Timeline by default. Switching Timeline/Month retains the selected month.
- Cleaning directly renders the existing weekly planner, including Daily plan and By cleaner.
- More opens a grouped dialog with every category, using the same registry as the desktop sidebar. Team, Issues, Stock, Contacts, Notes and Overview open their own pages without the former mixed management tab strip.
- Reports renders revenue reporting directly; Properties holds villa information and related records. Settings is pinned to the desktop sidebar footer and contains Preferences, Data & backups, and Sync & access. See [the category guide](categories.md) for the complete feature inventory.
- Bookings' three-dot Booking tools menu retains imports, availability/gaps, agenda, events and calendar shortcuts. Weekly review stays under Overview.
- The header's **Create** dialog routes to the existing New booking, Plan cleaning, New task, Calendar event and Excel import actions. It is an icon button on phones.
- Cleaner: Schedule and Calendar stay in the top header on phones and laptops. The former bottom navigation is hidden. Role-specific controls and API access are unchanged.

## Calendar and pop-ups

`src/features/booking-operations.js` derives a read-only coverage notice and compact cleaning list from the month selected in Timeline or Month, and the selected villa. It reuses `SV_CLEANING.checkouts`, existing confirmation/crew requirements and conflict rules. Offered staff are not counted as confirmed; completed/cancelled sessions do not appear as coverage gaps. Missing, unlinked and outdated checkout links are shown separately from crew coverage, rather than pretending they are distinct physical cleanings. Actions call the original planner dialogs and handlers; opening the workspace never creates or changes cleaning records.

The cleaning list shows up to six records, preferring upcoming sessions and then recent past ones. Open schedule retains the villa and opens the selected month (the current week if that month is current). Coverage review lists every unresolved item. Pending checkout creation/linking is still an explicit manager action.

Timeline retains horizontal scrolling, month selection, bookings and cleaning markers. Bars use villa colours and open the existing booking detail dialog at every width.

Month uses Monday-based weeks across the available width, continuous stay segments, and daily signals for cleaning, arrivals/departures, tasks and events. Stays end at checkout (exclusive); day details include departures on checkout day. Overlapping stays receive separate lanes. Paid cancellations remain outside occupied-day bars, retaining revenue and history elsewhere. Villa and Cleanings only filters apply to both views and day details.

`showModal()` supplies dialog semantics, an explicit close button, Escape, a Tab focus loop and focus restoration. Dialogs are centred and scroll within the viewport. Do not reserve a calendar detail column. The development strip stays above the header in normal layout; the manager shell fills the remaining viewport with one scrolling content area.

Use subtle colour transitions and a short popup fade/lift. Avoid animating operational totals or staggering cards; these can delay reading. Respect reduced motion. Main phone actions have 44px touch targets. Compact calendar cells and stay labels remain dense and open their full details on selection.

## Release and verification

1. Check manager and cleaner at phone, tablet and laptop widths in both themes.
2. Verify both calendar views, filters, booking/day pop-ups, More destinations and cleaning planning.
3. Run existing tests: import preservation, cancellation revenue, sync conflicts and cleaner authorization. Calendar tests cover checkout exclusivity, overlap lanes, filters and view context.
4. Update URL suffixes and `CACHE` in `cleaner/sw.js` when cached assets change. Its offline shell includes the shared stylesheet.
5. Keep classic scripts and existing loading order. No framework or build step is introduced.
6. Publish after Antonio reviews the local redesign. Check cleaner offline reload after release; its service worker does not register in development.

## Remaining workflow work

This stage supplies shared styling, responsive navigation and the booking calendar. Desktop uses a collapsible sidebar and phones use a bottom island. Reports uses the same panels and controls for villa/month drilldowns, charts and booking prices; see [the report guide](revenue-reports.md). Dedicated refinements of Today, Tasks, Properties and cleaner assignment workflows can follow preview review. The manager's offline page shell remains a separate infrastructure task.

## Reports — Revenue overview, 5 October 2026

Antonio selected **Revenue overview** from three dashboard prototypes, with the existing soft sage chart style as the reference. The report uses a prominent charcoal revenue banner, three white headline metrics, monthly revenue/occupancy bars beside the villa comparison on laptops, and stacked panels on phones. Chart bars have rounded upper corners, concise values above and month labels below; the chart scrolls horizontally on phones. Exact monthly figures remain in the expandable Monthly breakdown. More figures uses the existing accessible popup for secondary metrics. Channel and booking details remain below the overview. The desktop sidebar, phone bottom island and saved dark-mode preference use the existing workspace shell.
