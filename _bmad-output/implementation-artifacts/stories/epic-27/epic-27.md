# Epic 27: POS Sync Push Boundary Completion

**Status:** 📋 Backlog  
**Date:** 2026-04-03  
**Stories:** 6 total  
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-27-sprint-plan.md`

---

## Executive Summary

Epic 27 completes the API Detachment work for the POS sync push boundary — the highest business-risk zone remaining in the API. The `/sync/push` endpoint directly handles idempotency, stock deduction, and journal posting. This epic extracts the remaining heavy API-local logic into packages, leaving the API as a thin transport/auth adapter only.

**Key Goals:**
- API route = auth + Zod validation + response mapping only
- Push orchestration in `@jurnapod/pos-sync`
- Stock resolution in `@jurnapod/modules-inventory`
- POS-sale + COGS posting in `@jurnapod/modules-accounting`
- Shared contracts/constants in `@jurnapod/pos-sync`, `@jurnapod/sync-core`, `@jurnapod/shared`
- Delete API-local duplicates of posting engines

---

## Goals & Non-Goals

### Goals
- Move `sync/push/types.ts` domain types/constants to package ownership
- Wire `sync-push-posting.ts` to `modules-accounting/runSyncPushPostingHook`, delete API copy
- Port missing COGS behaviors to `modules-accounting/posting/cogs.ts`, delete `cogs-posting.ts`
- Move `sync/push/stock.ts` heavy SQL to `modules-inventory`, delete API copy
- Replace `pos-sync` phase2 stubs with concrete orchestrator
- Thin API route to pure adapter

### Non-Goals
- No new sync protocol changes
- No POS app changes
- No database schema changes
- No rollback of idempotency semantics

---

## Architecture

### Current State (problematic)

```
apps/api/src/lib/sync/push/transactions.ts     # 550 LOC - heavy orchestration
apps/api/src/lib/sync/push/stock.ts            # 180 LOC - heavy SQL
apps/api/src/lib/sync-push-posting.ts          # 791 LOC - duplicate posting engine
apps/api/src/lib/cogs-posting.ts               # 688 LOC - duplicate COGS
apps/api/src/lib/sync/push/types.ts            # 378 LOC - boundary-leaky types
packages/pos-sync/src/push/index.ts            # 1238 LOC - stubs at 362/367/744/759/1068
```

### Target State

```
apps/api/routes/sync/push.ts                   # thin adapter only
apps/api/src/lib/sync/push/types.ts            # minimized (re-exports only)
packages/pos-sync/src/push/                    # canonical phase2 orchestrator
packages/modules-accounting/src/posting/       # canonical POS posting + COGS
packages/modules-inventory/                    # canonical stock resolution
```

### Dependency Direction

```
pos-sync → modules-accounting (COGS/posting)
pos-sync → modules-inventory (stock deduction)
pos-sync → sync-core (idempotency)
modules-accounting → modules-inventory-costing (cost calculation)
```

---

## Success Criteria

- [ ] `apps/api/src/routes/sync/push.ts` is thin adapter only
- [ ] `apps/api/src/lib/sync-push-posting.ts` deleted
- [ ] `apps/api/src/lib/cogs-posting.ts` deleted
- [ ] Heavy logic removed from `apps/api/src/lib/sync/push/transactions.ts`
- [ ] Heavy logic removed from `apps/api/src/lib/sync/push/stock.ts`
- [ ] `packages/pos-sync/src/push/index.ts` stubs replaced
- [ ] Zero behavior regression on duplicate replay, COGS/journal under retries, table/reservation updates
- [ ] Full validation gate passes

---

## Stories

| # | Title |
|---|---|
| [story-27.1](./story-27.1.md) | Contract alignment & type source-of-truth |
| [story-27.2](./story-27.2.md) | Replace API POS-sale posting with modules-accounting |
| [story-27.3](./story-27.3.md) | COGS parity in modules-accounting |
| [story-27.4](./story-27.4.md) | Move stock transaction-resolution to modules-inventory |
| [story-27.5](./story-27.5.md) | Implement phase2 in pos-sync (replace stubs) |
| [story-27.6](./story-27.6.md) | API simplification + full validation gate |
