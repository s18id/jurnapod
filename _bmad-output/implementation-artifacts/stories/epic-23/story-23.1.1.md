# story-23.1.1: Move correlation primitives to @jurnapod/telemetry

## Description
Move correlation ID generation and propagation utilities from the API app to the telemetry package, establishing a shared foundation for distributed tracing.

## Acceptance Criteria

- [ ] Correlation ID generation/propagation utilities are hosted in telemetry package
- [ ] API telemetry middleware imports package utility (no duplicated logic remains)
- [ ] Behavior compatibility verified for request correlation IDs

## Files to Modify

- `packages/telemetry/src/*` (new/updated correlation utility)
- `apps/api/src/lib/correlation-id.ts` (replaced with adapter or removed)
- `apps/api/src/middleware/telemetry.ts` (updated imports)

## Dependencies

- story-23.0.2 (Lint rules must be in place)

## Estimated Effort

3 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/telemetry
npm run build -w @jurnapod/telemetry
npm run typecheck -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/middleware/telemetry.test.ts
```

## Notes

This is the first extraction story. Ensure the telemetry package exports a clean interface that can be consumed by other apps/packages in the future.
