# Uplisting integration: stage 1 (read-only 2027 preview)

This stage connects the existing Cloudflare service to the owner's Uplisting account and shows a read-only preview of 2027 reservations in **Jarvis → Settings → Bookings from Uplisting**. It does not import bookings, register webhooks or schedule any sync.

Sources checked on 25 October 2026:
- the Uplisting developer page (https://www.uplisting.io/developer)
- the API partner integration article
- the legacy API Postman collection (`1320372/SWTBfdW6`)
- the AI-readable full reference, last updated 2 October 2026

## Authentication route

The integration uses the **legacy account API key**, sent as `Authorization: Basic <base64(key)>` to `https://connect.uplisting.io`.

- **Why not V3 OAuth now:** V3 OAuth is Uplisting's recommended route for new integrations. Its client ID and secret are issued by Uplisting through their API access request form. It also needs an exact HTTPS redirect URI and a server-side authorisation flow. That is an owner decision and an external request, so it was not made.
- **What the key can do:** the legacy key is self-serve (Uplisting app → Connect → API) and documented for reading your own account. It is **not scoped**: it can also write calendar data.
- **How read-only is enforced:** the Worker only ever sends `GET` requests, and only to `/users/me`, `/properties` and `/bookings/{listing_id}`. Every other path is refused in code before a request is made.
- **Later move to V3:** if scoped read-only access is wanted, request a V3 client with `properties:read bookings:read offline_access`. The callback can be on the Worker's HTTPS address.

## Where it runs and who can use it

- **Where:** the Cloudflare Worker `seravillas-sync`. It does not depend on the PC.
- **Where the key is kept:** as the Worker secret `UPLISTING_API_KEY`. It is never in Git, the browser, Hermes, ElevenLabs, logs or responses.
- **Routes** (manager-only, using the existing `X-Secret` manager key, like cloud sync):
  - `GET /api/uplisting/status`: shows whether the key is configured and when the last retrieval ran and how it ended. It does not contact Uplisting.
  - `GET /api/uplisting/preview?year=2027`: runs one read-only retrieval and returns a reduced reservation list.
- **What the Worker returns:** guest email, phone and lock codes are never returned.
- **What it stores:** only status metadata, under KV key `uplisting_status`: times, outcome, counts and request totals. No guest data is stored. App data (`app_state`, KV `seravillas`) is never read or written by these routes.
- **Repeat retrievals:** a retrieval cannot start within 20 seconds of the previous one.

## Retrieval rules

- **Account and listings:** `/users/me` verifies the key, then `/properties` lists the listings.
- **Bookings per listing:** two windows are read, `2026-10-01 → 2027-07-01` and `2027-07-01 → 2028-01-01`. Every page is read: the page number is 0-based, with 50 per page, until `meta.total_pages`.
  - The received count must equal `meta.total`.
  - Results are merged by Uplisting reservation ID.
  - If the same ID comes back with different details, it is flagged.
- **What is kept:** only stays overlapping 1 January–31 December 2027 (`checkIn ≤ 2027-12-31` and `checkOut > 2027-01-01`). Dates are compared as plain dates with no time zone conversion, and the departure day is not a night.
- **Reliability:**
  - Requests are spaced at least 250 ms apart. There is a 15-second timeout per request.
  - At most 2 retries are made, for 429 (honouring `Retry-After` up to 8 s), 5xx and timeouts.
  - A retrieval makes at most 40 requests in total.
- **When retrieval fails:**
  - A rejected key (401) stops the retrieval. No preview is shown.
  - Any other per-listing failure marks the preview **incomplete**. The app then warns that the preview is not complete, and does not use absence as evidence of anything.
- **Documented limits:** 5 requests per second and 100 per minute per IP, and 15 per minute per property. The Worker's outgoing IP addresses are shared Cloudflare addresses, so a 429 is possible even with careful pacing. It is reported as an incomplete preview.

**Known data-coverage limits:**
- The documentation does not say whether `from`/`to` filter by arrival, departure or overlapping stay. Fetching from 1 October 2026 covers late-2026 arrivals in every case. A stay arriving before 1 October 2026 and lasting into 2027 would be missed if Uplisting filters by arrival.
- `/properties` pagination is not documented. A `links.next` value marks the preview incomplete.
- The first real retrieval should be compared with the Uplisting calendar for one villa.

## Preview and matching (`src/imports/uplisting-bookings.js`)

**Property mapping:**
- An exact name or nickname match is suggested. It is alias-aware: it reads the Excel importer's fixed alias list.
- A partial match is only "likely" and needs an explicit choice. So does a match to several villas.
- Two listings mapped to one villa is a conflict.
- Choices are stored only in this browser (`<DB>_uplistingMappings`). They are never stored in app data, aliases or villas.

**Identity**, strongest first. All years of the same villa are searched.
1. The stable Uplisting reservation ID (`booking.uplisting.reservationId`). A future approved import will write it.
2. A reliable channel reference: `external_reservation_id` equal to the existing Excel/manual reference.
3. Identical arrival, departure and guest name.

Anything weaker is **Needs review**: overlapping dates, the same guest within 31 days, several matches, or two reservations matching one booking. Similar names are never assumed to be the same stay. A "same stay / different stay" decision in the preview is kept only on screen.

**Categories:**
- **Arriving in 2027.**
- **Arrived in 2026, departing in 2027.** These are shown separately because, under the existing arrival-year rule, they belong to 2026.
- **Within each:**
  - **New.**
  - **Possible update:** arrival, departure or guest count differ.
  - **Unchanged.**
  - **Cancelled in Uplisting.**
  - **Needs review.**
- **Excluded or unsupported:** missing ID, invalid dates, unknown status such as `pending`, or a listing marked "not one of these villas".
- **In Seravillas but not returned by Uplisting:** shown for information only. It is never a cancellation, and it is marked "cannot compare" when retrieval was incomplete.

**Values:**
- A field absent from the response is **not provided**. `null` is **unknown**. `0` is **0.00**.
- Uplisting amounts (accommodation total, cleaning fee, payout) are reservation figures, not proof of payment. They are not compared with the workbook's "a cobrar" amount, which has a different meaning.
- Times are shown from `arrival_time` and `departure_time`. A difference from a recorded Seravillas time is a note, not a change.

**Cleaning review:** a changed departure or an Uplisting cancellation flags a cleaning-review item when a cleaning exists for the old checkout. Nothing is moved, deleted or reassigned.

## Field ownership for the later sync stage

| Owner | Fields |
| --- | --- |
| Uplisting (imported reservation facts) | reservation ID, listing ID, arrival and departure dates, status/cancellation, guest name, guest count, channel and channel reference, Uplisting amounts with currency, arrival/departure times as sent, booked-at |
| Seravillas (operational) | Seravillas booking ID, villa mapping, notes, linked cleaning and task links, cleaning sessions and staff, recorded operational check-in/out times, payment tracking, Excel provenance (`_excel`) |

Defined conflict resolutions:
- **Cancelled in Seravillas but active in Uplisting:** review only. It is never reactivated automatically.
- **Active in Seravillas and cancelled in Uplisting:** a proposed cancellation, plus a cleaning-review item.
- **Departure changed:** a proposed date update. The linked cleaning stays where it is and is flagged.
- **Guest name or channel differs on a reference match:** shown as a note. Any change needs explicit approval.
- **Unknown or missing count or amount:** never overwrites a known value.
- **Not returned by Uplisting:** no action.

## Before the first approved import, and before continuous sync

1. **Owner setup:** generate the API key, add the Worker secret and deploy the Worker. See "Owner setup" below.
2. **First real check:** run one retrieval and confirm it is complete. Spot-check one villa against Uplisting.
3. **Confirm the property mapping** for every listing.
4. **Design and test the apply step.** It should follow the Excel importer's safeguards:
   - a fingerprint check, so a stale preview cannot be applied
   - a pre-import backup
   - an `importHistory` entry
   - writing `booking.uplisting = {reservationId, propertyId, lastSeenAt}`
   - explicit selection of cancellations
   - flags only for cleaning review
5. **Decide price handling:** which Uplisting amount, if any, maps to `totalPrice`.
6. **Continuous sync:** Uplisting recommends webhooks (`booking_created`, `booking_updated`, `booking_cancelled`). They are registered with the legacy key, and their signatures must be verified. Each webhook should be stored as a pending review item, not applied directly. A bounded daily reconciliation should only report differences.

## Owner setup (no secrets in chat)

1. **Generate the key:** in Uplisting, open **Connect → API** (https://app.uplisting.io/connect/api) and click **Generate API Key**. Copy it. Do not paste it into chat, email or the Jarvis app.
2. **Add the secret:** in Cloudflare, open **Workers & Pages → seravillas-sync → Settings → Variables and Secrets → Add**. Choose type **Secret**, name `UPLISTING_API_KEY`, paste the key as the value, and save. Keep `DB`, `STAFF_DB` and `SECRET` unchanged.
3. **Update and deploy the code:**
   - Note the active Worker version so it can be rolled back.
   - Open **Edit code** and replace the source with `cloudflare/worker.mjs` from this release. Deploy.
   - Bindings and secrets are kept, because only the code changes.
4. **Check it:** in Jarvis, open **Settings → Bookings from Uplisting → Open the 2027 preview**. Choose **Retrieve 2027 bookings**.

**Rollback:** in Cloudflare, open **Workers & Pages → seravillas-sync → Deployments** and roll back to the noted version. You can delete the `UPLISTING_API_KEY` secret. The status key in KV can stay. No app data is involved.
