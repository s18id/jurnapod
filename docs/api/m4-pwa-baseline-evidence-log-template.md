# M4 PWA Baseline QA Evidence Log Template

Use this during manual execution of:
- `docs/api/m4-pwa-baseline-manual-qa-runbook.md`

## Test Session Metadata

- Date: `2026-02-22`
- Start time (local): `not recorded`
- End time (local): `not recorded`
- Tester name: `ahmad`
- Browser: `<Chrome|Edge>`
- Browser version: `not recorded`
- Execution mode: `<browser tab|installed app window|both>`
- Environment URL: `http://127.0.0.1:4173`
- Ticket/record link: `not recorded`

## Per-Step Results

| Step | Runbook step name | Result (PASS/FAIL) | Screenshot path(s) | Notes |
| --- | --- | --- | --- | --- |
| 1 | Manifest and icon baseline | PASS | `docs/api/evidence/m4-pwa/2026-02-22/step-1-manifest.png`, `docs/api/evidence/m4-pwa/2026-02-22/step-1-manifest-devtool.png`, `docs/api/evidence/m4-pwa/2026-02-22/step-1-network.png` |  |
| 2 | Service worker registration baseline | PASS | `docs/api/evidence/m4-pwa/2026-02-22/step-2-service-worker.png` |  |
| 3 | Installability baseline | PASS  | `docs/api/evidence/m4-pwa/2026-02-22/step-3-instalability.png`, `docs/api/evidence/m4-pwa/2026-02-22/step-3-standalone.png` |  |
| 4 | Offline app shell UX baseline | PASS | `docs/api/evidence/m4-pwa/2026-02-22/step-4-offline.png`, `docs/api/evidence/m4-pwa/2026-02-22/step-4-cache.png` |  |

## Checklist Acceptance Mapping (must be YES for PASS)

- `manifest/icons present`: `YES`
- `installability valid`: `YES`
- `runtime badge visible`: `YES`
- `offline app shell works`: `YES`

Origin note:
- QA screenshots may show `localhost` while metadata uses `127.0.0.1`; both point to the same local preview host for this run.

## Final Verdict

- Final result: `PASS`
- Blocking issues found: `none`
- Follow-up actions: `none`

Sign-off:
- QA tester sign-off: `ahmad 2026-02-22T12:07:00+0700`
