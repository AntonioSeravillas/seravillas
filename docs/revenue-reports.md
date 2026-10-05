# Revenue reports

Choose **Reports** in the sidebar or **More → Reports** on phones. The report uses the existing workspace design and current booking records. Reports and their filters do not save or alter bookings.

Reports tracks **Villa Mar, Villa Marjals, Villa Diagonal and La Forca**. The manager confirmed that Can Vallori is not tracked: its stable property ID is excluded from report capacity, revenue, stays, channels, booking lists and villa filters. Its property record and any other app records are preserved. This report scope is defined in `REPORT_EXCLUDED_VILLA_IDS` in the report feature, not inferred from whether a villa has bookings. Other tracked villas still contribute capacity when empty.

## Explore the report

- Choose a year, villa and period. Villa and month filters work together.
- Click a villa in Property performance to see only that villa. Click a month or chart bar to see that month's figures and bookings. The view returns to the summary at the top.
- The annual chart switches between revenue and occupancy. Its monthly rows remain available while exploring a selected month.
- Open any channel or agency for a popup containing its revenue and bookings within the selected villa and period.
- Booking details includes full booking prices, dates, guests, nights inside the period and the value allocated to those nights. Search by guest, villa or channel, filter active/cancelled bookings and sort by arrival or price. Clicking a record opens the existing booking detail popup.
- **All villas / full year** clears the villa, month, search and status filters.

## Calculation rules

| Figure | Basis |
| --- | --- |
| Booked revenue | Current active prices plus explicit money retained from cancelled bookings, attributed to the scheduled arrival month/year. This preserves the previous report's revenue basis. |
| Bookings arriving | Active bookings arriving in the selected period. |
| Stay value in period | Known active prices allocated evenly over the stay's nights, including bookings arriving in a previous month/year. Cumulative rounding in integer cents makes the pieces reconcile to the full price. |
| Occupancy | Unique occupied villa nights / available villa nights. Checkout is exclusive. Overlapping bookings count once for occupancy and show a warning. |
| Available nights | Selected registered villas × calendar nights, less unique occupied nights. All villas in scope count, including villas with no bookings. No owner blocks or out-of-service periods are deducted because these are not recorded as report availability. |
| Average booking value | Known-price arrivals' active prices / number of known-price arrivals. |
| Average nightly value | Allocated stay value / priced booking nights in the period. Cancelled stays are excluded. |
| Value per available night | Allocated active stay value / all selected villa nights, before subtracting booked nights. |
| Average stay | Full stay nights / active arrivals with valid dates. |
| Guests | Known guest counts on active arrivals, with missing counts shown separately. |

These figures are booked values. The app does not record payment receipts or operating expenses, so these reports do not claim to show cash collected or profit. Genuine zero prices remain known; absent, invalid or negative prices are unknown and flagged. Original cancelled prices are never counted as retained income. Dates use UTC day indexes for DST-safe night calculations and Gregorian leap-year rules. Invalid dates and missing villa references are flagged rather than adding invented occupied nights.

The former year-end clipping error is corrected: a stay departing on 1 January includes the night of 31 December. Portfolio occupancy now includes every selected villa, rather than averaging only villas with bookings.

## Code and checks

`src/features/reports.js` retains weekly review and existing revenue helpers. `src/features/revenue-reports.js` owns detailed read-only calculations, drilldown state and rendering. Its report-specific styles are in `assets/css/workspace.css` and use the shared design tokens. Booking data, sync, imports and cleaner permissions are unchanged.

Run `tests/reports.test.cjs` alongside the existing four suites. Coverage includes month/year boundaries, exact allocation, checkout exclusivity, overlaps, empty-villa capacity, leap years, paid cancellations, zero/missing prices and combined scope preservation. Preview uses fictional development data and disabled cloud access. Publication remains a separate step after preview review.
