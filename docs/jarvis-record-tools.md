# Jarvis app record tools

Jarvis can search the manager's current loaded app data by natural request. Queries run in the browser against current records and require no new cloud access or database migration. Searches cover all loaded years, not just the assistant's six-week summary. Results appear in a read-only panel while conversation continues; a selected record can be opened in its existing app detail screen.

Examples:

- “How much did Elise Example pay?” Finds matching stays and reports the recorded booking price, explicitly explaining that payment receipts are not tracked.
- “When does she arrive?” Answers the arrival of the selected booking. Departure, guest count and linked cleaning/team questions work similarly.
- “Show me next year's bookings at Villa Mar.” Searches the requested dates and property.
- “Who is cleaning tomorrow?” Lists sessions and distinguishes confirmed staff from offered assignments. Missing-team and staff filters are available.
- “What tasks are overdue?” Searches open tasks by due date, priority, status, property or words from the task.
- “Any open issues at Villa Mar?” Lists matching issues.
- “Is Villa Mar free from 17 to 19 October 2026?” Checks active recorded bookings with checkout-exclusive overlap. External calendars and owner blocks are not checked; incomplete dates make availability unknown.
- “Open the second one”, “show more” and “open that booking” use the current result selection. “Take me to Reports” opens the full app page and pauses the microphone.

The new Bookings footer button opens upcoming/current stays without an AI round trip. Numbered result buttons, pagination and native record handoff also work locally. Approximate names and duplicate stays require a choice. Every query resolves against current records again; it never relies on remembered amounts or stale result data.

The AI receives the query, coverage counts and bounded selectors from the last result, not the booking catalog, prices, private notes, contact details, photos or credentials. It proposes only a validated read query or an allowlisted app destination. The browser computes values and speaks the answer directly, avoiding a second model round trip. The same query contract validates proposals server-side and queries client-side.

Booking prices, cancellation amounts retained and payments are distinct. A missing/unknown price stays unknown; a genuine zero remains zero. Full booked-price summaries are not cash receipts, income received or profit. There is no payment/deposit ledger or bank connection. No tool here records a payment, edits a booking, completes tasks or sends messages. Existing review/approval flows still govern supported changes and WhatsApp sends.

Hermes memory may retain confirmed preferences and aliases. Booking dates, prices and guest financial details must not be stored as long-term memory. Read-only query results stay local; if custom speech is selected, spoken reply text uses the existing ElevenLabs voice path. Device voice is available without that custom speech service.
