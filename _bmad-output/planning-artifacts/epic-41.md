# Epic 41: Backoffice Auth Token Centralization

> **Epic Number:** 41
> **Status:** completed
> **Priority:** P1
> **Target Sprint:** Completed

---

## Overview

Centralize backoffice bearer token resolution inside `apiRequest()` so UI layers no longer pass `accessToken` through Router → Pages → Components → Hooks. This eliminates prop drilling and keeps auth logic at the boundary.

---

## Goals

1. Centralize token resolution in API client layer
2. Remove `accessToken` from all hook signatures
3. Remove `accessToken` from all page/component props
4. Clean up router to stop forwarding tokens to pages
5. Create proper XHR wrappers for progress tracking

---

## Success Criteria

- All API calls use centralized token resolution
- No `accessToken` prop drilling through pages/components/hooks
- All XHR upload/apply operations use wrapper functions
- Build, typecheck, and lint all pass

---

## Stories

| Story | Title | Estimate | Priority | Status |
|-------|-------|----------|----------|--------|
| 41.1 | API Client Token Resolution | 8h | P0 | ✅ Done |
| 41.2 | Hook Token Migration | 12h | P0 | ✅ Done |
| 41.3 | Page/Component Token Migration | 16h | P0 | ✅ Done |
| 41.4 | Router Cleanup | 4h | P1 | ✅ Done |
| 41.5 | XHR Wrapper Functions | 6h | P1 | ✅ Done |
| 41.6 | Final Verification | 2h | P1 | ✅ Done |

**Total Estimate:** 48h

---

## Story Details

### Story 41.1: API Client Token Resolution

**Goal:** Extend `apiRequest` to resolve tokens internally and create supporting functions.

**Tasks:**
- [x] Implement canonical token resolution order in `apiRequest()`
- [x] Create `apiStreamingRequest()` for exports and blob responses
- [x] Create `uploadWithProgress()` for XHR uploads with progress tracking
- [x] Create `applyWithProgress()` for XHR JSON POST with progress tracking
- [x] Export `getStoredAccessToken()` from auth-storage module
- [x] Preserve 401 refresh + retry semantics

**Files Modified:**
- `apps/backoffice/src/lib/api-client.ts`

**Verification:**
- `npm run typecheck -w @jurnapod/backoffice` passes
- `npm run lint -w @jurnapod/backoffice` passes

---

### Story 41.2: Hook Token Migration

**Goal:** Remove `accessToken` from all hook signatures.

**Tasks:**
- [x] Migrate `use-journals.ts` - useJournalBatches, useJournalBatch, createManualJournalEntry
- [x] Migrate `use-sales-invoices.ts` - useSalesInvoices
- [x] Migrate `use-outlet-account-mappings.ts` - useOutletAccountMappings
- [x] Migrate `use-modules.ts` - useModules, useModuleActions
- [x] Migrate `use-sales-orders.ts` - useSalesOrders
- [x] Migrate `use-reservations.ts` - useReservations
- [x] Migrate `use-outlet-tables.ts` - useOutletTables
- [x] Migrate `use-table-board.ts` - useTableBoard
- [x] Migrate `use-export.ts` - uses apiStreamingRequest
- [x] Migrate `use-variants.ts` - useVariants
- [x] Migrate `use-import.ts` - useUpload, useValidate, useApply, useGetTemplate, useImportWizard (uses new wrappers)

**Files Modified:**
- `apps/backoffice/src/hooks/*.ts`

**Verification:**
- All hooks use new signatures without accessToken parameter
- All callers updated to match new signatures

---

### Story 41.3: Page/Component Token Migration

**Goal:** Remove `accessToken` from page and component props.

**Tasks:**
- [x] Migrate FixedAssetsPage and sub-components
- [x] Migrate queue-status-badge
- [x] Fix hook call signatures in pages

**Files Modified:**
- `apps/backoffice/src/features/fixed-assets/FixedAssetsPage.tsx`
- `apps/backoffice/src/features/fixed-assets/components/CategoryCreateModal.tsx`
- `apps/backoffice/src/features/fixed-assets/components/AssetCreateModal.tsx`
- `apps/backoffice/src/components/queue-status-badge.tsx`
- `apps/backoffice/src/features/sales-payments-page.tsx`
- `apps/backoffice/src/features/transactions-page.tsx`

---

### Story 41.4: Router Cleanup

**Goal:** Stop forwarding accessToken from router to pages.

**Tasks:**
- [x] Remove token forwarding from RouteScreen
- [x] Keep session/auth gate checks only

**Files Modified:**
- `apps/backoffice/src/app/router.tsx`

---

### Story 41.5: XHR Wrapper Functions

**Goal:** Create proper wrappers for XHR-based operations.

**Tasks:**
- [x] Implement `uploadWithProgress()` for FormData uploads
- [x] Implement `applyWithProgress()` for JSON POST with progress
- [x] Update `use-import.ts` to use wrappers

**Files Modified:**
- `apps/backoffice/src/lib/api-client.ts`
- `apps/backoffice/src/hooks/use-import.ts`

---

### Story 41.6: Final Verification

**Goal:** Ensure all changes are stable.

**Tasks:**
- [x] Run full typecheck
- [x] Run full lint
- [x] Run build
- [x] Update epic documentation

---

## Architecture Decision

See `docs/adr/adr-001-auth-token-centralization.md` for full design.

### Token Resolution Order (Canonical)

1. Explicit string arg (legacy compat) - use even if empty
2. `options.accessToken` override - use even if empty
3. `getStoredAccessToken()` from auth storage - fallback

### API Client Functions

| Function | Purpose | Use Case |
|----------|---------|----------|
| `apiRequest<T>()` | Standard JSON responses | Most API calls, handles 401 refresh/retry |
| `apiStreamingRequest()` | Streaming/blob responses | Exports, file downloads |
| `uploadWithProgress()` | XHR upload with progress | File uploads with progress tracking |
| `applyWithProgress()` | XHR JSON POST with progress | Import apply with progress tracking |

---

## Remaining Token References (Appropriate)

The following are NOT prop drilling - they are appropriate internal or boundary uses:

| File | Usage | Reason |
|------|-------|--------|
| `api-client.ts` | Internal token resolution | Core auth boundary implementation |
| `router.tsx` | Session state management | Router stores token for auth flow |
| `session.ts` | `fetchCurrentUser(token)` | Called with explicit token during bootstrap |
| `reservation-context.tsx` | `accessTokenRef` for WebSocket | Internal token management for reservations |

---

## Definition of Done

- [x] All API calls use centralized token resolution
- [x] No `accessToken` prop drilling through pages/components/hooks
- [x] All XHR upload/apply operations use wrapper functions
- [x] `npm run typecheck -w @jurnapod/backoffice` passes
- [x] `npm run lint -w @jurnapod/backoffice` passes
- [x] `npm run build -w @jurnapod/backoffice` passes

---

## Out of Scope

- Backend auth changes
- POS token handling
- Changes to `auth-refresh.ts` (uses httpOnly cookies, not bearer tokens)

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking existing API calls | High | Low | Backward compat via optional token arg |
| XHR progress tracking regression | Medium | Low | Wrapper functions tested with use-import |
| 401 refresh not working | High | Low | Preserved original refresh logic |

---

## Related Documentation

- [ADR-001: Auth Token Centralization](../../docs/adr/adr-001-auth-token-centralization.md)
- [Epic 39: Permission System Consolidation](./epic-39-sprint-plan.md)

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial draft |
| 2026-04-13 | 1.1 | Added stories structure, completed migration |
