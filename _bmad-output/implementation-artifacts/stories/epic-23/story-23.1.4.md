# story-23.1.4: Consolidate audit utilities into @jurnapod/modules-platform

## Description
Move audit write/read helpers from the API to the modules-platform package, ensuring consistent audit logging across the system.

## Acceptance Criteria

- [ ] Audit write/read helpers move to platform package
- [ ] API audit modules become route-facing adapters only
- [ ] Audit query filters retain canonical `success` semantics (not `result`)

## Files to Modify

- `packages/modules/platform/src/audit/*` (create)
- `apps/api/src/lib/audit.ts` (adapter)
- `apps/api/src/lib/audit-logs.ts` (adapter)
- `apps/api/src/lib/super-admin-audit.ts` (adapter)

## Dependencies

- story-23.1.3 (Platform settings extraction should be complete)

## Estimated Effort

3 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/modules-platform
npm run test:unit:single -w @jurnapod/api src/lib/audit*.test.ts
```

## Notes

Critical: Maintain the existing audit log schema and ensure `success` field semantics are preserved per project conventions.
