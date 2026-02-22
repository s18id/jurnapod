# M4 PWA Baseline Manual QA Runbook

Status: executed and passed (see evidence log + screenshots)

## Ready-To-Execute Commands (Build + Preview)

From repository root (`/home/ahmad/jurnapod`), run:

```bash
# Terminal A (must complete successfully first)
npm run qa:pwa:build -w @jurnapod/pos

# Terminal B (run after build succeeds; keep this running during QA)
npm run qa:pwa:preview -w @jurnapod/pos
```

## Scope

This runbook covers the remaining manual-only M4 baseline checks for POS PWA:
- installability
- offline app shell behavior
- manifest + icon presence
- runtime sync badge visibility/state

## Go for QA (Pre-Run Sanity Checks)

Complete this quick sanity list before running Step 1:

- [ ] Browser is Chrome or Edge (latest stable), and version is noted for evidence.
- [ ] Existing installed localhost POS app is removed (if previously installed), so installability can be re-verified cleanly.
- [ ] Localhost site data is cleared and stale service worker is unregistered.
- [ ] Build command completed successfully, and preview server is running with no startup errors.
- [ ] `http://127.0.0.1:4173` opens successfully before DevTools checks begin.
- [ ] Evidence template is ready to fill: `docs/api/m4-pwa-baseline-evidence-log-template.md`.

## Preconditions

Complete the `Go for QA (Pre-Run Sanity Checks)` list first.

1. Use Chromium browser (Chrome or Edge), latest stable.
2. Start from repository root (`/home/ahmad/jurnapod`).
3. POS preview is served from local host using the commands in `Ready-To-Execute Commands (Build + Preview)`.
4. Open `http://127.0.0.1:4173`.
5. Clear prior localhost PWA state before test start:
   - DevTools -> Application -> Storage -> Clear site data.
   - DevTools -> Application -> Service Workers -> Unregister stale worker if present.

## Test Steps And Pass Criteria

Checklist alignment (`docs/api/m4-execution-checklist.md` -> `PWA baseline QA` done criteria):
- Step 1 verifies `manifest/icons present`.
- Step 2 is a prerequisite control step for Steps 3-4 (service worker baseline for reliable install/offline validation).
- Step 3 verifies `installability valid` and `runtime badge visible`.
- Step 4 verifies `offline app shell works` and offline badge state.

### 1) Manifest and icon baseline

Actions:
1. Open DevTools -> Application -> Manifest.
2. Confirm manifest fields render and icon preview is visible.
3. In Network tab, refresh once and filter for `manifest.webmanifest`, `app-icon-192.png`, and `app-icon-512.png`.

Pass criteria:
- `manifest.webmanifest` loads with HTTP 200.
- `/icons/app-icon-192.png` loads with HTTP 200.
- `/icons/app-icon-512.png` loads with HTTP 200.
- Manifest shows `name`, `short_name`, `start_url`, `scope`, `display`.

### 2) Service worker registration baseline

Actions:
1. DevTools -> Application -> Service Workers.
2. Confirm `/sw.js` is registered and activated.
3. Keep "Update on reload" unchecked for baseline behavior.

Pass criteria:
- Service worker status is active/running for current scope.
- No registration failure in Console.

### 3) Installability baseline

Actions:
1. From browser address bar or browser menu, trigger Install App for POS site.
2. Complete install.
3. Launch installed app window.

Pass criteria:
- Install action is available (or app installs from menu flow without error).
- Installed window opens in standalone app frame.
- POS home renders and sync badge is visible in header.

### 4) Offline app shell UX baseline

Actions:
1. Keep the same app context used in Step 3 and confirm shell is loaded once while online.
2. With app loaded, open DevTools -> Network and set throttling to `Offline`.
3. Refresh app (hard reload).
4. If testing installed window, disconnect network and relaunch installed app.

Pass criteria:
- App shell still renders (not browser offline error page).
- Header `Jurnapod POS` is visible.
- Sync badge is visible and shows `Offline` while network is offline.
- Major shell assets load from cache (no blocking fetch required to render shell).

## Evidence Capture Checklist

Use template: `docs/api/m4-pwa-baseline-evidence-log-template.md`

Attach these artifacts to QA record/ticket:
- Screenshot: Manifest panel with installability details.
- Screenshot: Service worker panel showing active `/sw.js`.
- Screenshot: Installed app window with POS header + sync badge.
- Screenshot: Offline reload showing app shell + `Sync: Offline`.
- Screenshot: Network entries for `manifest.webmanifest`, `/icons/app-icon-192.png`, and `/icons/app-icon-512.png` with 200 status.
- Console export or screenshot confirming no fatal SW/manifest install errors.

## Fail Triage Notes

- Install option missing:
  - Re-check manifest validity and icon fetch status.
  - Re-check service worker scope/activation.
  - Ensure URL is `http://127.0.0.1:4173` and not mixed origin.
- Offline shell fails (browser offline page or blank screen):
  - Verify `/sw.js` active version and cache entries for `/` and `/index.html`.
  - Check Application -> Cache Storage for app-shell cache population.
  - Check Console for SW fetch/install errors.
- Sync badge missing or wrong state offline:
  - Confirm app finished rendering (no runtime crash in Console).
  - Confirm browser offline toggle is active for tested window/tab.

Notes:
- This gate is manual-only and has been completed for M4 with attached evidence.
- Sync API behavior is out of scope for this baseline runbook.
