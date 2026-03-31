# Epic 17: Resurrect Sync-Core (Sync Module Architecture)

**Status:** Done
**Completion Date:** 2026-03-31
**Theme:** Modular Sync Architecture
**Epic Number:** 17
**Stories Completed:** 7/7 (100%)

---

## Summary

Migrate sync logic from `apps/api/src/lib/sync/` into dedicated packages (`sync-core` for shared infrastructure, `pos-sync` for POS-specific sync), refactor API routes as thin adapters, and delete the legacy `lib/sync/` directory.

---

## Context

### Problem

The original sync architecture had all sync logic (`lib/sync/`) co-located in the API package. This created several issues:

1. **Tight coupling** - Sync logic was tightly coupled to HTTP handlers
2. **Code duplication** - Similar sync patterns were duplicated across apps
3. **Difficult testing** - Testing sync logic required HTTP layer overhead
4. **Poor reusability** - POS sync and backoffice sync couldn't share infrastructure

### Solution

Create a modular sync architecture:

```
packages/
├── sync-core/          # Shared sync infrastructure
│   ├── registry/       # Module registration
│   ├── auth/           # Authentication
│   ├── audit/          # Audit logging
│   ├── transport/      # HTTP transport with retry
│   ├── idempotency/    # Idempotency service
│   ├── data/           # Shared SQL queries
│   ├── websocket/      # Event publishing
│   └── jobs/           # Background jobs
│
├── pos-sync/           # POS-specific sync module
│   ├── pull/           # Pull sync logic
│   ├── push/           # Push sync logic
│   └── core/           # Data services
│
└── backoffice-sync/    # Backoffice-specific sync module
    ├── pull/           # Pull sync logic
    ├── push/           # Push sync logic
    └── core/           # Data services
```

---

## Goals

1. **Create sync-core package** - Shared sync infrastructure (registry, auth, audit, transport, idempotency, data queries)
2. **Create pos-sync package** - POS-specific sync module implementing `SyncModule` interface
3. **Create backoffice-sync package** - Backoffice-specific sync module (future)
4. **Refactor API routes** - Routes become thin HTTP adapters delegating to sync modules
5. **Migrate push/pull logic** - Move sync business logic from `lib/sync/` to appropriate packages
6. **Clean up legacy code** - Delete `lib/sync/` directory after successful migration

---

## Stories

| Story | Title | Status | Notes |
|-------|-------|--------|-------|
| 17.1 | Create sync-core package structure | ✅ Done | Registry, auth, audit, transport, idempotency, data queries |
| 17.2 | Create pos-sync package structure | ✅ Done | Basic module, types, endpoints factory |
| 17.3 | Implement SyncModule interface in PosSyncModule | ✅ Done | Wire up sync-core dependencies |
| 17.4 | Move pull logic to pos-sync | ✅ Done | Pull sync in `pos-sync/pull/` |
| 17.5 | Move push logic to pos-sync | ✅ Done | Push sync in `pos-sync/push/` |
| 17.6 | Refactor API routes as thin adapters | ✅ Done | Routes delegate to pos-sync |
| 17.7 | Delete lib/sync/ and its tests | ✅ Done | Legacy code removed |

---

## Key Deliverables

### 1. sync-core Package

| Component | File | Purpose |
|-----------|------|---------|
| Module Registry | `registry/module-registry.ts` | Central registration and lifecycle |
| Authenticator | `auth/sync-auth.ts` | Token validation, role checking |
| Auditor | `audit/sync-audit.ts` | Audit event logging |
| Retry Transport | `transport/retry-transport.ts` | HTTP client with exponential backoff |
| Idempotency | `idempotency/` | Duplicate detection, error classification |
| Data Queries | `data/*.ts` | Shared SQL for items, variants, orders, transactions |
| WebSocket | `websocket/` | Event publishing |
| Jobs | `jobs/data-retention.job.ts` | Data cleanup |

### 2. pos-sync Package

| Component | File | Purpose |
|-----------|------|---------|
| Main Module | `pos-sync-module.ts` | Implements `SyncModule` interface |
| Pull Sync | `pull/index.ts` | Handle POS data pulls |
| Push Sync | `push/index.ts` | Handle POS data pushes |
| Endpoints | `endpoints/pos-sync-endpoints.ts` | HTTP endpoint factory |
| Data Service | `core/pos-data-service.ts` | Database queries |

### 3. API Refactoring

| Route | Change |
|-------|--------|
| `routes/sync/push.ts` | Thin adapter delegating to `PosSyncModule.handlePushSync()` |
| `routes/sync/pull.ts` | Thin adapter delegating to `PosSyncModule.handlePullSync()` |

### 4. Deleted Files

`apps/api/src/lib/sync/` (14 files, ~4,000 lines deleted):
- `push/index.ts`, `push/types.ts`, `push/transactions.ts`, `push/orders.ts`
- `push/stock.ts`, `push/idempotency.ts`, `push/variant-sales.ts`, `push/variant-stock-adjustments.ts`
- `pull/index.ts`, `pull/types.ts`
- `master-data.ts`, `audit-adapter.ts`, `check-duplicate.ts`
- `audit-adapter.test.ts`, `check-duplicate.test.ts`

---

## Architecture Patterns

### SyncModule Interface

All sync modules implement the `SyncModule` interface:

```typescript
interface SyncModule {
  readonly moduleId: string;
  readonly clientType: 'POS' | 'BACKOFFICE';
  readonly endpoints: SyncEndpoint[];
  
  initialize(context: SyncModuleInitContext): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;
  cleanup(): Promise<void>;
}
```

### Two-Phase Push Pattern

**Phase 1 (pos-sync)**: Persistence - transactions, orders, items, payments, taxes
**Phase 2 (API)**: Business logic - COGS posting, stock deduction, table release, reservation update, posting hook

```typescript
// Phase 1: pos-sync handles persistence
const phase1Results = await posSyncModule.handlePushSync({
  db, companyId, outletId, transactions, ...
});

// Phase 2: API iterates Phase 1 results for business logic
for (const result of phase1Results) {
  if (result.status === 'success') {
    await postCOGS(db, result.transaction);
    await deductStock(db, result.items);
    // ...
  }
}
```

### Feature Flag: PUSH_SYNC_MODE

Gradual rollout for push sync migration:
- `shadow` (default): Log metrics, don't use new path
- `10`, `50`, `100`: Percentage rollout

---

## Metrics

| Metric | Value |
|--------|-------|
| New packages created | 2 (sync-core, pos-sync) |
| Lines of code in sync-core | ~2,500 |
| Lines of code in pos-sync | ~2,000 |
| Legacy files deleted | 14 |
| Legacy lines deleted | ~4,000 |
| API routes refactored | 2 (push, pull) |
| Tests passing | 765+ |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| @jurnapod/db | Required | Database connectivity (DbConn) |
| @jurnapod/shared | Required | Zod schemas, date helpers |
| Epic 11 (idempotency) | Completed | SyncIdempotencyService in sync-core |

---

## Success Criteria

- [x] `packages/sync-core/` fully functional with all components
- [x] `packages/pos-sync/` implements `SyncModule` interface
- [x] Pull sync uses `pos-sync/pull/` via `handlePullSync()`
- [x] Push sync uses `pos-sync/push/` via `handlePushSync()`
- [x] API routes are thin adapters (no business logic)
- [x] `PUSH_SYNC_MODE` feature flag implemented
- [x] `lib/sync/` completely removed
- [x] All tests passing
- [x] Typecheck, build, lint passing

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Rollback complexity | Feature flag allows instant rollback |
| Data inconsistency during migration | Shadow mode for comparison |
| Test coverage gaps | Comprehensive integration tests |

---

## Notes

Epic 17 represents a major architectural shift from a monolithic sync layer to a modular, reusable sync infrastructure. The `sync-core` package can now be used by both `pos-sync` and `backoffice-sync` packages, reducing duplication and improving maintainability.

---

## Retrospective

See: [Epic 17 Retrospective](./epic-17.retrospective.md)

---

*Epic completed: 2026-03-31*
