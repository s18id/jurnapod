# story-23.3.10: modules-reporting bootstrap

## Description
Bootstrap the modules-reporting package with report service interfaces and classification/timeout helpers, establishing journal source-of-truth assumptions.

## Acceptance Criteria

- [ ] Reporting package exposes report service interfaces and classification/timeout helpers
- [ ] Journal source-of-truth assumptions explicitly documented in package API
- [ ] API reports adapter compiles against package exports

## Files to Modify

- `packages/modules/reporting/src/index.ts` (create/update)
- `packages/modules/reporting/src/classification/*` (create)
- `packages/modules/reporting/src/contracts/*` (create)
- `apps/api/src/lib/report-telemetry.ts` (adapter split)

## Dependencies

- story-23.0.3 (Package scaffolds must exist)
- story-23.2.3 (Accounting adapters should be thinned)

## Estimated Effort

3 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/modules-reporting
npm run typecheck -w @jurnapod/api
```

## Notes

Reporting depends on GL data. Ensure the package documents its dependency on modules-accounting for financial reports.
