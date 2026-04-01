# Story 22.2: Migrate Core Imports to Modules-Accounting

**Status:** done  
**Epic:** Epic 22  
**Story Points:** 3  
**Priority:** P1  
**Risk:** HIGH  
**Assigned:** bmad-dev

---

## Overview

Migrate all internal consumers from `@jurnapod/core` to `@jurnapod/modules-accounting` using mechanical import path updates only.

## Acceptance Criteria

- [x] All source imports previously targeting `@jurnapod/core` target `@jurnapod/modules-accounting`.
- [x] No behavior changes in posting, cash-bank, sales, sync-push posting flows.
- [x] Build/typecheck pass for touched workspaces.

## Expected Files

- `apps/api/src/lib/sales-posting.ts`
- `apps/api/src/lib/sync-push-posting.ts`
- `apps/api/src/lib/cash-bank.ts`
- `apps/api/src/lib/depreciation-posting.ts`
- `packages/modules/accounting/src/index.ts` (if additional export glue needed)

## Validation (Story)

- [x] `npm run typecheck -w @jurnapod/api`
- [x] `npm run build -w @jurnapod/api`
