# Jarvis live release (phone and other computers)

This release lets the live GitHub Pages app use Jarvis from a phone or another computer. Jarvis itself still runs on **one PC**, the "Jarvis PC". The other devices send requests through the existing Cloudflare Worker, and the Jarvis PC collects them.

Nothing in this document has been carried out yet. Every step below is a manual production action for the owner to approve and perform.

## How it works

```
Phone / laptop (GitHub Pages app)
   │  manager access key (X-Secret), HTTPS
   ▼
Cloudflare Worker seravillas-sync  ──  D1 STAFF_DB: relay_devices, relay_jobs
   ▲  PC code (Bearer), HTTPS, outbound polling only
   │
Jarvis PC: tools/jarvis/live-relay.mjs  ──►  existing Jarvis server http://127.0.0.1:5500
```

- The Jarvis PC opens no public port. The relay agent only makes outbound HTTPS requests to the production Worker and loopback requests to the existing Jarvis server. It does not start a second WhatsApp session.
- Only one PC can be registered. Registering again replaces the old PC code. Revoking it stops the relay at once, and jobs that are still waiting are expired.
- The PC code can only send heartbeats, collect jobs and return results. It cannot read app data or use manager routes.
- Allowed remote actions: Jarvis health, chat, WhatsApp status, inbox, review, send and discard.
- **Not allowed remotely:** AI WhatsApp drafts, AI model consent, connecting or disconnecting WhatsApp, and account consent. Do these on the Jarvis PC itself.
- The local Jarvis session token never leaves the PC. The relay removes it, and any WhatsApp QR code, before anything is stored in Cloudflare.

### What Cloudflare stores, and for how long

Request text and reply text pass through Cloudflare D1:

- A request expires if the PC does not pick it up: after **30 seconds for a WhatsApp send**, after **5 minutes** for everything else.
- A reply expires **2 minutes** after the PC returns it.
- Expired text is removed the next time anyone uses the relay. While nobody uses Jarvis remotely, expired text can stay stored for longer.
- The relay tables live only in the existing `STAFF_DB`. They never touch `app_state` or the KV snapshot.

## Release baseline (for rollback)

| Item | Value |
| --- | --- |
| Worker | `seravillas-sync`, current version **10801ab9** |
| GitHub Pages `main` | **e2b1dacc42b91dd33956a218b44b5c6841d0c425** |
| Release branch | `jarvis-live-release` |
| Bindings kept unchanged | KV `DB`, D1 `STAFF_DB`, secret `SECRET` |

**Do not rerun `/api/admin/migrate`.** D1 is already active. The relay tables (`relay_devices`, `relay_jobs`) are created automatically the first time a signed-in manager uses a relay route. No schema step and no data migration are needed.

## Before you start

1. Run the checks on the release branch (see "Run the checks" in the README). All of them should pass, including the three new relay test files.
2. Export a fresh private backup of the app from **Settings** and keep it outside Git.
3. On the Jarvis PC, confirm Jarvis works locally: run `tools/jarvis/start-jarvis.ps1`, open <http://127.0.0.1:5500/>, and check that chat and the WhatsApp inbox work.

## Deployment steps

### 1. Deploy the Worker

1. In the Cloudflare dashboard, open **Workers & Pages → seravillas-sync**. Note that the active version is `10801ab9`.
2. Open **Settings → Bindings**. Confirm that `DB` (KV), `STAFF_DB` (D1) and the `SECRET` variable are present. Do not change them.
3. Replace the Worker source with `cloudflare/worker.mjs` from the release branch and deploy.
4. Check that the existing app still works: open the live manager app, confirm it loads and syncs, and open the cleaner page.

### 2. Publish the app to GitHub Pages

1. Merge `jarvis-live-release` into `main`.
2. Wait for GitHub Pages to finish publishing, then reload the live app. The new files load with the `?v=20261018-live` suffix.
3. Open Jarvis on the live app. Before a PC is registered, it should say honestly that the Jarvis PC is offline. Nothing is sent.

### 3. Register the Jarvis PC

1. On any signed-in device using the live app, open Jarvis settings and expand **Use Jarvis from this device**.
2. Read the notice, then choose **Register the Jarvis PC…** and confirm.
3. A one-time PC code appears **once**. It is not saved in the browser. Copy it straight into the configuration file in the next step. If you lose it, register again; that replaces the old code.

### 4. Configure the relay on the Jarvis PC

1. Copy `tools/jarvis/live-relay.example.json` to:
   `%LOCALAPPDATA%\hermes\profiles\seravillas\jarvis-live-relay.json`
2. Edit that file and replace the placeholder `deviceToken` with the PC code. Leave `cloudUrl` (`https://seravillas-sync.antonio-01e.workers.dev`) and `localUrl` (`http://127.0.0.1:5500`) as they are. The agent refuses any other cloud address and any local address that isn't loopback.
3. Never put this file in the repository. `.gitignore` already excludes it.

### 5. Start Jarvis and the relay

On the Jarvis PC, in two separate PowerShell windows:

```powershell
.\tools\jarvis\start-jarvis.ps1
```

```powershell
.\tools\jarvis\start-live-relay.ps1
```

The relay script reads only the configuration file path. The PC code never appears on the command line. Leave both windows open.

### 6. Test from a phone and another computer

1. In Jarvis settings, **Use Jarvis from this device → Check the Jarvis PC** shows the PC as online.
2. Jarvis health shows ready. A short chat question gets a reply.
3. The WhatsApp inbox lists chats. There are no Connect, Disconnect, AI consent or Draft again controls.
4. Send one test WhatsApp message to yourself: type it, choose Review, then Send. Check on the phone that it arrived **once**.
5. Close the relay window on the PC. Within about a minute, other devices should report that the Jarvis PC is offline, and nothing is sent.
6. Optional: choose **Revoke PC access** in settings. The relay window should stop with "Register it again". Register again to continue.

## Limitations

- **The Jarvis PC must stay on, awake and online** with both windows running. If it sleeps, other devices see "offline". Disable sleep in Windows power settings while you need remote access.
- **Unclear sends are never retried.** If a send times out or the PC restarts mid-send, Jarvis says the result is uncertain. Check WhatsApp on the phone before sending again.
- **Voice on phones depends on the browser.** Speech input works only where the browser supports it (for example Chrome on Android; Safari on iPhone is limited and may need typing). Microphone permission is asked per device. Spoken replies depend on the device's voices.
- **Remote replies are slower** than on the PC: the PC checks for work every few seconds.
- **Usage counts against the Cloudflare plan.** The PC polls the Worker while the relay runs, and open apps poll for results. Check the free-tier request and D1 limits in the Cloudflare dashboard after the first days.
- AI WhatsApp drafts stay off remotely. WhatsApp linking and consent happen only on the PC.

## Optional ElevenLabs voice

The live desktop and phone app can play the same custom voice. The existing PC relay generates speech;
the WhatsApp session and local Jarvis server are unchanged. Only spoken reply text goes to ElevenLabs.
Text and MP3 audio pass through the same authenticated relay, with its existing expiry and cleanup rules.

Create `%LOCALAPPDATA%/hermes/profiles/seravillas/jarvis-elevenlabs.json` privately on the PC:

```json
{"enabled":true,"apiKey":"YOUR_PRIVATE_TTS_KEY","voiceId":"YOUR_VOICE_ID","monthlyCharacters":10000}
```

Never commit this file or paste its key into the browser app or chat. Restrict the key to Text to Speech
in ElevenLabs. Restart only `live-relay.mjs` after saving it. Health then advertises the custom voice;
Jarvis settings offers **Jarvis Seravillas · ElevenLabs** and **Device voice · free**.

The PC reserves a conservative 10,000-character monthly test budget before each generation, including
failed requests. Usage persists beside the private config; no credit-consuming request is automatically
retried. Recent exact speech repeats are cached in memory on the PC and in the open Jarvis panel.
The provider's own quota still applies, including usage outside Jarvis. No subscription or auto top-up
is configured by this integration. The user must ensure their plan covers their intended use.

Speech is split at word/sentence boundaries into sections of at most600 characters. Each MP3 is bounded
to180KB before returning it. Closing, hiding, interrupting or entering a review stops playback; listening
resumes only after the final audio section. If audio is blocked, tap **Play reply**; on iPhone keep Silent
Mode off when using Device voice. Disabling or removing the private config and restarting the relay
returns to the original browser voice.

## Rollback

### Conversational WhatsApp and iPhone capture update — 15 October 2026

The assistant now handles ordinary WhatsApp requests directly against the protected inbox: “Read my messages”, “Read Bex’s messages”, “Write a message to Bex”, followed by dictated text. Already-read retained messages remain readable. Names resolve exactly; duplicate names and phonetic alternatives such as “Becks” require an explicit option choice. Dictation stays in this workflow and is not passed to the AI drafting model.

The recipient, chat detail and exact draft are displayed and spoken. The user authorised spoken **Approve and send** after the complete read-back. A vague “yes” or “send it” cannot send, and interrupted/muted read-backs do not enable voice approval. The screen approval remains available after visual review. The existing server review token binds the recipient, chat version, exact text and expiry; a new message, expiry or uncertain send requires a fresh review. There is no automatic retry. Contact messages are never interpreted as commands.

The inbox now stays embedded on narrow screens so it no longer closes the assistant. Its microphone can be restarted while browsing; typing in the reply editor pauses it. iPhone recognition waits for silent media preparation to finish and keeps a microphone capture source active for the recognition turn, releasing it before speech and on every stop/error/hide/close. This addresses the audio-session lifecycle implicated by [WebKit issue317741](https://bugs.webkit.org/show_bug.cgi?id=317741); physical iPhone behaviour still needs device verification. Conversation mode retries quiet pauses with a capped delay until paused or hidden, and capture failures have bounded recovery attempts. The iPhone speech-to-listening gap is one second.

This release adds no Worker operations or database schema. Restart the PC server to expose hashed per-message read keys and the five most recent retained incoming messages. Keep the existing WhatsApp linked-device session and private keys. The prior app commit is `31f3619`, with Worker `2d8cfb9e` unchanged.

### WhatsApp navigation and unread update — 15 October 2026

Jarvis navigation uses its own `data-jarvis-nav` attributes so the workspace's capture handler cannot swallow footer clicks. The open assistant checks the inbox every eight seconds remotely (five locally), with one request at a time. Initial history establishes a quiet baseline. Incoming messages can play a cue and be read aloud after a microphone/send tap or **Enable message audio**. Reading waits during speech, active dictation, settings and WhatsApp review. Closing or hiding Jarvis cancels watching and audio; this is not a background phone notification service.

“Good morning Jarvis, do we have any unread messages on WhatsApp?” is handled from the protected inbox, without an AI call. Unread means retained messages received by Jarvis since tracking was enabled, not WhatsApp's phone read status or older account history. A completed read-out acknowledges only its exact message keys; interrupted, failed or muted playback does not clear them. The `wa-read` relay operation accepts at most ten hashed message keys and cannot send or change chat content. Sending still requires an exact-text review and approval. AI drafting stays off.

Previously authorised links resume when the server loads the inbox; explicit Disconnect persists. Transient disconnects retry with delays capped at sixty seconds. A phone logout still requires linking again. The PC server can use its existing installed Baileys runtime via `JARVIS_WHATSAPP_RUNTIME`; keys and linked-device credentials stay in the private profile. Automatic startup after a PC reboot is not configured.

For this update alone, the previous app commit is `21a8c8e` and previous Worker version is `a47a5ca4`. No database migration is involved. The older rollback instructions below describe the original full relay release.

Choose the smallest step that fixes the problem.

1. **Stop remote access only:** close the relay window on the PC, or choose **Revoke PC access** in Jarvis settings. The rest of the app is unaffected.
2. **Roll back the app:** revert the release merge on `main`, returning the published files to `e2b1dacc42b91dd33956a218b44b5c6841d0c425`. Reload the app on each device.
3. **Roll back the Worker:** in **Workers & Pages → seravillas-sync → Deployments**, roll back to version `10801ab9`. Keep the `DB`, `STAFF_DB` and `SECRET` bindings. App data is unaffected because the relay never writes to `app_state` or KV.
4. **Do not rerun the migration** and do not restore KV as part of this rollback.
5. Optional cleanup after rolling back the Worker: in the `STAFF_DB` D1 console, remove stored relay text with `DELETE FROM relay_jobs;`. The two relay tables can remain; the old Worker ignores them.
6. Delete `jarvis-live-relay.json` on the PC if remote access is no longer wanted.


### ElevenLabs live conversation — 15 October 2026

The microphone defaults to the private ElevenLabs Agent when the PC advertises it. The pinned official client (1.28.0) connects browser audio directly using WebRTC; the manager-authenticated relay obtains a short-lived connection credential from the fixed private agent. The account key stays on the PC. The only new Worker operation is live-session with an empty parameter object. No database migration or binding change is required.

The voice agent uses the existing Jarvis Seravillas voice with Eleven v3 Conversational and a hosted Gemini 2.5 Flash conversation model. Direct lookup_records searches the loaded app data without a Hermes round trip. Only projected query results are returned to the voice model; full catalogs, private notes, contact credentials and payment receipts are not exposed. ask_hermes retains the existing n8n/Hermes path for memory and supported reviewed app changes. Persistent memory remains in Hermes, not ElevenLabs automatic user memory.

WhatsApp tools can read or prepare/revise a draft, never approve or send. Exact read-backs use app-controlled speech while the live session is muted, and only completed playback enables the literal owner approval. Incoming automatic AI reply drafting remains off. Typed messages during a live session mute microphone input and keep it muted until the owner taps Resume microphone; agent audio can still play. Structured tool fields avoid nested JSON escaping, and bounded relative-day values are resolved against the current app date. Close, hide, settings and explicit pause end it. Native device speech and the previous voice workflow remain available in settings.

Agent settings: private authentication; the user's chosen voice; ten-minute session maximum, ninety-second silence timeout with re-engagement set later than that timeout to avoid repeated idle prompts, one concurrent session, twenty sessions per day, no paid bursting. Audio recording is off, transcript/PII retention is configured to one day (not zero retention). The API key retains the owner's 3,000-credit cap. Its allowance is separate from the local legacy TTS character counter. No subscription or billing upgrade was made.

Validation: 268 automated checks passed, including real overlay integration on desktop/narrow layouts, private-token authentication, ignored/stale callbacks, one-time owner approval, relay scoping, and factual payment/crew safeguards. A real four-turn agent session used fictional records and mock WhatsApp, correctly changed follow-up dates and prepared an unsent draft. A separate short speech request verified the corrected key allowance. Actual iPhone microphone, playback quality and natural interruptions still require the owner's listening test.

Rollback: previous app commit 4539b18, previous Worker version 2d8cfb9e. Switch Voice to the previous Jarvis Seravillas voice or Device voice to disable the new live connection. No app-state restore or migration is involved.

### Voice latency — 16 October 2026

An early microphone tap now waits for the pending connection check and starts the selected live agent, rather than silently entering the browser recognition/Hermes/separate-speech loop. Cancellation while waiting cannot open a late microphone session. Explicit App tools and legacy/device voice choices remain available.

Gemini 2.5 Flash's supported thinking budget is explicitly zero for the conversational agent; the fixed app tools, factual safeguards, Hermes memory and independent send approval remain unchanged. Four identical fictional text turns took 5.04/5.73/7.62/10.00 seconds before tuning, and 0.85/1.36/1.38/1.17 seconds after tuning. These are single-run provider response measurements, not phone end-to-end audio guarantees; network, speech recognition, relay-backed WhatsApp and Hermes delegation add time.

WhatsApp reuses the already authenticated app session token, removing a redundant status round trip without changing endpoint authentication. Exact app-controlled read-backs begin with at most 220 characters, then prepare at most one next section while playback is in progress. Approval remains disabled until every section completes; interruption, cancellation or playback failure cannot arm it. No automatic drafts, real test messages, new relay operations, polling-frequency increases or billing changes are involved. Validation: 272 automated checks passed, including delayed startup on desktop/narrow layouts, cancellation, token reuse and interrupted prefetch.

### WhatsApp conversation and translation — 16 October 2026

The existing authenticated wa-inbox operation now accepts bounded read views: voice contact metadata, recent incoming/outgoing messages, unread, per-chat history with literal search, and awaiting-reply candidates. Windows contain at most ten messages or eight candidates, with offsets and explicit coverage. The PC retains at most thirty messages per chat; this is not an import of the entire phone archive. Media contents are unavailable. Incoming and observed owner replies are ordered by message time, and unread status is independent of whether a chat may need an answer. A final incoming acknowledgement is a candidate to assess, not proof of an unanswered request.

Live read results go directly to the conversational voice model for natural English reading, translation and summaries, without a second TTS pass. Only requested source windows reach it. Interrupted or superseded playback cannot acknowledge those messages as read. Legacy speech uses an explicit bounded, reply-only presentation pass; normal planning still excludes incoming bodies. Incoming text never grants instructions, approval or automatic reply drafting. The latter remains off.

The owner can request a translated outgoing draft. The exact target-language text and optional English meaning are displayed and read back; every revision creates a fresh review and invalidates earlier approval. The voice agent still has no approve/send tool. Voice approval remains exclusively app-controlled after the complete exact read-back.

Validation: 282 automated checks passed, including scoped transport/cloud authentication, message direction/paging/search, read-versus-replied distinction, Spanish draft revisions, reply-only presentation and interrupted audio. A real provider test translated fictional Spanish messages into English, read both speakers and prepared an unsent Spanish draft with an English gloss. Further real voice verification requires an available ElevenLabs allowance; no spending limits or billing settings were changed. Worker read filters changed; bindings, schema and migrations did not.
