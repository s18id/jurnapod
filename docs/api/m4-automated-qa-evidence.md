# M4 Automated QA Evidence

Status: automated gate green

## Commands

- `npm run qa:pos:e2e`
- `npm run qa:pos:lhci`

## Result Summary

- Playwright E2E: PASS (`2 passed`, `1 skipped` real-env test)
- Lighthouse script: PASS (report generated)

## Artifacts

- Playwright last run status: `apps/pos/test-results/.last-run.json`
- Lighthouse report JSON: `apps/pos/.lighthouseci/lighthouse-report.report.json`
- Lighthouse report HTML: `apps/pos/.lighthouseci/lighthouse-report.report.html`

## Lighthouse Snapshot

- Performance: `1.00`
- Accessibility: `0.89`
- Best Practices: `1.00`
- SEO: `0.82`
- Present/passing checks: `is-on-https`, `viewport`

## Notes

- Skipped Playwright test is the real API scenario (`apps/pos/e2e/sync-pull.real.spec.ts`) gated by runtime credentials/env vars.
- Manual PWA baseline QA has been executed with evidence in `docs/api/m4-pwa-baseline-evidence-log-template.md` and screenshots under `docs/api/evidence/m4-pwa/2026-02-22/`.
