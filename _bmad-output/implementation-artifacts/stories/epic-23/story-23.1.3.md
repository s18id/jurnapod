# story-23.1.3: Move feature flags/settings to @jurnapod/modules-platform

## Description
Move platform settings and feature flags core APIs from the API app to the modules-platform package, centralizing configuration management.

## Acceptance Criteria

- [ ] Platform settings core APIs are exposed from platform package
- [ ] API keeps thin adapter only (validation/auth at route boundary, no business logic duplication)
- [ ] Tenant scoping checks preserved in package service interfaces

## Files to Modify

- `packages/modules/platform/src/settings/*` (create)
- `packages/modules/platform/src/feature-flags/*` (create)
- `apps/api/src/lib/platform-settings.ts` (adapter/removal)
- `apps/api/src/lib/feature-flags.ts` (adapter/removal)

## Dependencies

- story-23.0.2 (Lint rules must be in place)

## Estimated Effort

4 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/modules-platform
npm run build -w @jurnapod/modules-platform
npm run test:unit:single -w @jurnapod/api src/routes/platform/*.test.ts
```

## Notes

Ensure feature flag evaluation remains performant. The platform package should handle tenant-specific configuration scoping internally.
