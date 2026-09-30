# Excel booking imports

## Use the importer

1. Start the local preview from VS Code as described in the README.
2. Open **Properties → Import bookings from Excel** and choose the RESERVES `.xlsx` workbook.
3. Match every sheet to its villa. Existing exact villa names are matched automatically. In an empty/sample workspace, choose **Create [villa]** when appropriate.
4. Review **New**, **Updates**, **Unchanged**, **Review**, and **Excluded** counts. Open **All bookings** to inspect every row.
5. Resolve flagged dates, cancellation markers, uncertain matches, and missing prices. For a missing price, enter the value and click **Use this price**. Zero is a valid price. Unknown is a separate choice.
6. Only if the workbook contains all bookings for the matched villas, check the complete-snapshot box. Select missing bookings for cancellation individually. This is optional; absence alone never cancels a booking.
7. Click **Apply reviewed changes to preview** to apply locally. On a production host, the button applies to the current manager dataset and the existing cloud sync follows normal save behaviour.

The local preview has a visible development label and disabled cloud sync. The workbook is read in the browser; selecting it does not upload it. Applying records to production subsequently sends the normal app dataset to its existing Worker.

## Supported workbook format

| Workbook field | App field |
| --- | --- |
| Sheet name | Property, with exact aliases such as Villa Marjals / Can Marjals |
| AGENCIA | Platform and agency name |
| Fecha entrada / Fecha salida | Arrival / departure, without timezone conversion |
| Nombre cliente | Guest name |
| Reserva | Source reference, preserved as text |
| Nº personas | Guest count; `12 + 6 + 1` becomes 19, raw notation is retained |
| $ a cobrar / $ a pagar | Booking price, using the workbook's cached numeric value |

`AIRBNB`, `BOOKING`, and `PRIVATE` map to Airbnb, Booking.com, and Direct. Other channels retain their agency names. Formula totals and empty formatted rows are skipped.

Only bookings arriving in **2026** are in scope. A stay arriving in December 2026 and departing in January 2027 is included. Existing 2027 arrivals and villas absent from the workbook are preserved.

Rows dated 2025 can be explicitly shifted to 2026 using the review checkbox. Check the listed source rows before doing so. The original workbook dates remain in import metadata; the workbook itself is never edited.

A reservation field containing `CANCELED`, `CANCELLED`, or a supported Spanish cancellation marker requires an explicit decision. The manager can exclude the row, keep cancelled history, or mark it active. Excluding a source row already marked cancelled does not invalidate the active-booking snapshot. Excluding any other row disables missing-booking cancellation.

## Matching and preservation

- Reliable booking references are matched within the property and agency/channel. Generic text such as `CA TEVA` is not treated as a unique reference.
- Without a reliable reference, the importer matches property, dates, and guest name. Possible matches require review when those details differ.
- Reimporting unchanged records does not create duplicate bookings. Duplicate workbook rows or two rows matching one existing booking block application until resolved.
- Updates preserve booking IDs, operational notes, linked cleaning IDs, and other app records. Unknown source counts/prices preserve existing known values when matched; new unknown values remain explicit.
- Changed checkout dates and booking cancellations flag linked cleanings for review. Their dates and assignments are not moved automatically. The booking detail shows the review notice.
- A cancelled existing booking is never silently reactivated.
- If bookings, properties, or cleaning sessions change after the preview, the application rejects that stale preview. Review the file again.

## Backup and audit

Application saves a full copy under `seravillas_v1_beforeExcelImport` before replacing the current dataset. Development uses the normal `seravillas_dev:` prefix. If saving fails, the in-memory dataset is kept intact.

**Properties → Data & Backup → Restore before last Excel import** restores that copy. It replaces edits made after the import, so export current data first if those edits matter. The backup is overwritten by the next successful import attempt; keep independent exports for longer history.

Each applied batch is recorded in `D.importHistory` with counts, changed booking IDs/fields, file name, timestamp, and cleaning-review IDs. Each imported booking retains `_excel` source provenance. Load/save preserves both across reloads. The 2026 legacy migration marker is retained so old embedded bookings cannot undo the import.

Import history and the rollback backup are currently data records, not a separate history screen or multi-step undo system. Existing whole-app cloud synchronization still needs replacement before multiple accounts can edit concurrently.

## Files and dependencies

- `src/imports/excel-bookings.js`: pure parsing, matching, planning, and application rules.
- `src/ui/excel-import.js`: workbook selection, manager review, persistence, and rollback.
- `assets/vendor/sheetjs/`: unmodified SheetJS CE 0.20.3, Apache 2.0 license and notices included.
- `tests/excel-import.test.js`: fictional importer fixtures; no real workbook rows.
- `tests/app.test.js`: isolated storage, integration, persistence, and rollback checks.

The vendored parser avoids a runtime CDN dependency for importing. It does not make the entire app installable/offline yet. See the [official installation guide](https://docs.sheetjs.com/docs/getting-started/installation/standalone/), [parse options](https://docs.sheetjs.com/docs/api/parse-options/), and [license information](https://docs.sheetjs.com/docs/miscellany/license/).

Keep workbooks and exported app backups outside Git. `.gitignore` excludes common workbook files and app backup names. This does not remove historical guest rows already embedded in the original public frontend; retiring those remains a separate migration task.
