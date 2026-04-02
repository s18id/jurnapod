# story-23.1.3: Move feature flags/settings to @jurnapod/modules-platform

## Description
Move platform settings and feature flags core APIs from the API app to the modules-platform package, centralizing configuration management.

## Acceptance Criteria

- [x] Platform settings core APIs are exposed from platform package
- [x] API keeps thin adapter only (validation/auth at route boundary, no business logic duplication)
- [x] Tenant scoping checks preserved in package service interfaces

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

## Status

REVIEW

## Implementation Summary

### Changes Made

1. **Feature Flags Extraction** (`packages/modules/platform/src/feature-flags/index.ts`):
   - Moved pure logic functions: `getPushSyncMode()`, `shouldUseNewPushSync()`, `getPushSyncModeDescription()`
   - `PushSyncMode` type exported
   - Reads `PUSH_SYNC_MODE` env var directly

2. **Platform Settings Extraction** (`packages/modules/platform/src/settings/`):
   - `index.ts`: Core CRUD operations with encryption support
   - `encryption.ts`: AES-256-GCM encryption utilities (duplicated from API to avoid cross-package dependency)
   - Functions accept `db` parameter for dependency injection (follows pattern from `AuditService`)
   - Exports: `ensurePlatformSettingsSeeded()`, `getPlatformSetting()`, `getAllPlatformSettings()`, `setPlatformSetting()`, `setBulkPlatformSettings()`, `deletePlatformSetting()`, `buildPlatformSettingsSeedValues()`

3. **API Adapters** (now thin wrappers):
   - `apps/api/src/lib/feature-flags.ts`: Re-exports from `@jurnapod/modules-platform`
   - `apps/api/src/lib/platform-settings.ts`: Delegates to package functions, handles `getDb()` singleton and env config injection

4. **Package Exports** (`packages/modules/platform/src/index.ts`):
   - Added exports for `feature-flags` and `settings` modules

### Architecture Notes

- **Dependency Injection Pattern**: Package functions accept `db: KyselySchema` parameter rather than importing `getDb()` from API, ensuring framework-agnostic design per ADR-0014
- **Encryption**: Duplicated encryption utilities in package to avoid forbidden `apps/**` import
- **Backward Compatibility**: API adapter maintains same function signatures as original implementation
