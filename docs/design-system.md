# SeraVillas design system

The look of the app is defined in `assets/css/app.css`. New screens reuse these tokens and components instead of defining their own. The cleaner page (`assets/css/cleaner-portal.css`) and the cleaning planner (`assets/css/cleaning-planner.css`) follow this guide.

## Colour tokens

Use CSS variables only. Never hard-code a hex value in a component.

| Role | Variables | Notes |
| --- | --- | --- |
| Page and surfaces | `--bg`, `--surface`, `--surface2`, `--surface3` | Page, card, inset area (inputs, rows), hover/pressed |
| Lines | `--border`, `--border2` | Card edges; stronger edges |
| Text | `--text`, `--text2`, `--text3` | Primary, secondary, muted/labels |
| Accent (terracotta) | `--accent`, `--accent-hover`, `--accent-bg`, `--accent-border`, `--accent-text` | The one brand colour: primary buttons, active tabs, own-item borders |
| Status | `--success`, `--warning`, `--danger`, `--info` and `--amber-*`, `--red-*`, `--purple-*`, `--pink-*` (`-bg`, `-border`, `-text`) | Tinted background + border + text for badges and notices |

Dark is the default. `html[data-theme="light"]` redefines the same variables in `app.css`, so components must not need per-theme colours. The theme is stored under `sv_theme` (`seravillas_dev:sv_theme` in the preview) and applied by a small script in `<head>` before first paint. Components need a light-theme override only when they use a hard-coded colour, which is a reason to switch to a token.

## Typography

- **Plus Jakarta Sans** for everything: 400/500 body, 600–700 controls, 800 titles and labels.
- **DM Mono** for dates, times, counts and chips (`font-family:'DM Mono',monospace`).
- Page title `.sv-title` (22px/800, −0.5px tracking), subtitle `.sv-subtitle` (13px, `--text3`), card heading 16px/700, body 13px, small text 11–12px.
- Form labels and section labels: 11px, 700–800, uppercase, 0.07em tracking, `--text2`/`--text3`.
- The manager page loads the fonts from Google Fonts. The cleaner page loads the same fonts from `assets/fonts/` through `assets/css/fonts.css`, so it works offline (OFL licence note in `assets/fonts/README.md`).

## Spacing and shape

- Radii: cards `var(--radius)` (18px), controls and inset cards `var(--radius-sm)` (12px), buttons 12px (small 10px), pills `var(--radius-pill)`.
- Page gutters 16px on phones, 28px from 768px. Card padding 14–16px. Gaps 8, 10, 12, 14px.
- Cards have a 1px `--border` and a faint `0 1px 4px rgba(0,0,0,0.06)` shadow. Highlighted items use a 4px left border (`--accent` for the signed-in cleaner's own work).

## Components (reuse, don't re-create)

| Need | Class | Where defined |
| --- | --- | --- |
| Page heading | `.sv-page-header`, `.sv-page-heading`, `.sv-title`, `.sv-subtitle` | `app.css` |
| Card | `.sv-card` (plus `.ct-card`/`.cp-card` for the cleaner and planner variants) | `app.css` |
| Buttons | `.sv-btn` + `-primary`, `-secondary`, `-ghost`, `-danger`, `-sm` | `app.css` |
| Tabs / segmented control | `.sv-tabs` containing `.sv-tab` (`.active`) | `app.css` |
| Filter chips | `.sv-chip-row`, `.sv-chip` | `app.css` |
| Status badges | `.sv-badge` + `-resolved` (done/confirmed), `-waiting` (offered), `-open` (declined/cancelled), `-medium` (today), `-low`, `-overdue`, `-progress` | `app.css` |
| Form fields | `.field` with a `<label>`; global `input`, `select`, `textarea` styles with accent focus ring | `app.css` |
| Sync/status dot | `.sync-dot` + `idle`, `syncing`, `ok`, `error` | `app.css` |
| Empty state | `.sv-empty` | `app.css` |
| Header and wordmark | `.header` / `.logo` (gradient wordmark), `.header-date` | `app.css` |

Status colours carry meaning: green = confirmed/done, amber = offered/needs attention, red = declined/cancelled/overdue, accent = yours or active.

## Navigation

- **Phones (below 768px):** a floating glass pill at the bottom (`.nav` with `.nav-item`, active item in `--accent-bg`). The manager app has five items. The cleaner page has two: Schedule and Calendar.
- **Desktop (768px and up):** `.nav` is hidden by `app.css`. The manager app uses its left sidebar. The cleaner page puts the same two sections as `.sv-tabs` in the sticky header, next to the wordmark.
- The header is a sticky glass bar (`--glass` look, 60px). Icon buttons are 32px circles. The theme toggle shows a sun in dark mode and a moon in light mode.

## Page shell rules

`app.css` is written for the manager app. Its `body` is a 480px phone column and, from 768px, the page is locked to the viewport (`html, body {height:100%; overflow:hidden}`) because the manager scrolls inside its own panes. A page that does not use the manager shell must override this. The cleaner page does it with `class="ct-html"` on `<html>` and `class="ct-body"` on `<body>` (see the first rules in `cleaner-portal.css`). Without that override a tablet-width page is boxed to 480px and a desktop page cannot scroll.

## Rules for new UI

1. Reuse a component from the table above before writing CSS.
2. Colours come from variables. Check both themes.
3. Touch targets are at least 42px tall on controls and 32px for small icon buttons.
4. Check at 390px (phone), about 640px (tablet) and 1280px (desktop), in dark and light.
5. Keep existing `data-action` hooks and element IDs. Scripts and tests depend on them.
6. For files cached by the cleaner service worker, change the `?v=` suffix and `CACHE` name in `cleaner/sw.js` whenever the file changes.
7. Do not add a framework or build step.

## Known gaps

- The manager page still loads fonts from Google Fonts, so its typography falls back when offline. Switching it to `assets/css/fonts.css` is a small follow-up.
- In the development preview, the amber "Development preview — cloud sync disabled" label overlaps the manager header on narrow screens.
- On phones the manager's Manage tab bar scrolls horizontally and clips the Schedule tab.
