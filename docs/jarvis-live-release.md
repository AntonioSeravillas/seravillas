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

## Rollback

Choose the smallest step that fixes the problem.

1. **Stop remote access only:** close the relay window on the PC, or choose **Revoke PC access** in Jarvis settings. The rest of the app is unaffected.
2. **Roll back the app:** revert the release merge on `main`, returning the published files to `e2b1dacc42b91dd33956a218b44b5c6841d0c425`. Reload the app on each device.
3. **Roll back the Worker:** in **Workers & Pages → seravillas-sync → Deployments**, roll back to version `10801ab9`. Keep the `DB`, `STAFF_DB` and `SECRET` bindings. App data is unaffected because the relay never writes to `app_state` or KV.
4. **Do not rerun the migration** and do not restore KV as part of this rollback.
5. Optional cleanup after rolling back the Worker: in the `STAFF_DB` D1 console, remove stored relay text with `DELETE FROM relay_jobs;`. The two relay tables can remain; the old Worker ignores them.
6. Delete `jarvis-live-relay.json` on the PC if remote access is no longer wanted.
