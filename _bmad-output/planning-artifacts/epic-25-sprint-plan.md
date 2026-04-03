# Epic 25 Sprint Plan

## Overview
**Epic:** Cash-Bank Domain Extraction to modules-treasury
**Duration:** 1-2 sprints
**Goal:** Extract cash-bank domain logic from `apps/api/src/lib/cash-bank.ts` into a new `@jurnapod/modules-treasury` package, keeping API routes as thin composition adapters.

## Dependency Direction

```
apps/api routes → modules-treasury → modules-accounting (PostingService)
                                → modules-platform (AccessScopeChecker port)
```

## Epic Goals

1. Create `@jurnapod/modules-treasury` package with proper structure
2. Extract domain model, types, errors, and helpers to treasury
3. Implement `CashBankService` with create/post/void/list/get operations
4. Define and implement API port adapters (DB, access, fiscal-year)
5. Add comprehensive tests for journal balance, status transitions, atomicity
6. Update route adapter to use treasury service
7. Validate full gate passes

## Non-Goals

- Depreciation operations (stays in accounting)
- New cash-bank features
- Changes to sync protocol
- Changes to database schema

## Sprint Breakdown

### Sprint 1: Package Scaffold + Domain Model

#### Story 25.1: Scaffold modules-treasury package
- **Estimate:** 1.5h
- **Priority:** P1
- **Dependencies:** None
- **Focus:** Create package structure, tsconfig, dependencies, and public API exports

#### Story 25.2: Extract domain model, types, errors, helpers to treasury
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** 25.1
- **Focus:** Move types, errors, money/date helpers, and account classification

### Sprint 2: Service Implementation + Port Adapters

#### Story 25.3: Implement CashBankService with create/post/void and API port adapters
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 25.2
- **Focus:** Service implementation, journal line builder, posting mapper/repository, port definitions

### Sprint 3: Tests + Route Adapter Integration

#### Story 25.4: Add tests, update route adapter, validate full gate
- **Estimate:** 2.5h
- **Priority:** P1
- **Dependencies:** 25.3
- **Focus:** Unit tests, route adapter update, validation gate

## Critical Path

```
25.1 (Scaffold) → 25.2 (Domain Model) → 25.3 (Service + Ports) → 25.4 (Tests + Adapter)
```

## Capacity Planning

| Sprint | Stories | Hours | Focus |
|--------|---------|-------|-------|
| Sprint 1 | 25.1, 25.2 | 3.5h | Package, domain model |
| Sprint 2 | 25.3 | 3h | Service implementation |
| Sprint 3 | 25.4 | 2.5h | Tests, integration, validation |
| **Total** | **4 stories** | **~9h** | Full extraction |

## Pre-requisites

- Epic 23 (API Detachment) modules-accounting stable
- Epic 23 modules-platform with AccessScopeChecker port
- Understanding of ports/adapters pattern from modules-sales

## Success Criteria

- [ ] `@jurnapod/modules-treasury` package created and builds
- [ ] Domain logic extracted from `lib/cash-bank.ts`
- [ ] API routes use treasury service via thin adapters
- [ ] All existing cash-bank tests pass
- [ ] New treasury package tests pass
- [ ] No circular dependencies
- [ ] Full validation gate passes (typecheck, build, lint, tests)

## Interface Pattern (Ports/Adapters)

Following the modules-sales pattern:

**Treasury Package (owns business logic):**
- Domain types, validation, errors
- `CashBankService` with operations
- `buildCashBankJournalLines` (pure function)
- Port interfaces (contracts API must implement)

**API Package (implements adapters):**
- HTTP route handling (auth middleware, Zod validation)
- `AccessScopeChecker` port implementation (`userHasOutletAccess`)
- `FiscalYearGuard` port implementation (`ensureDateWithinOpenFiscalYear`)
- `CashBankRepository` adapter (Kysely DB)

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Journal balance regression | P1 | Comprehensive tests for all transaction types (MUTATION, TOP_UP, WITHDRAWAL, FOREX) |
| Status transition errors | P1 | Explicit state machine tests for DRAFT→POSTED→VOID |
| Tenant scoping leaks | P1 | Mandatory assertions for company_id/outlet_id in all operations |
| Posting atomicity issues | P1 | Transaction wrapper tests, verify batch+lines written together |
| Port adapter mismatch | P2 | Clear port interface definitions with TypeScript strict checking |

## What Stays in API

- Route HTTP handling (auth middleware, Zod validation)
- `userHasOutletAccess` as `AccessScopeChecker` port implementation
- `ensureDateWithinOpenFiscalYearWithExecutor` as `FiscalYearGuard` port implementation
- Thin composition in route handlers
- `lib/cash-bank.ts` deleted after extraction

## Validation Commands

```bash
cd /home/ahmad/jurnapod

# Package validation
npm run typecheck -w @jurnapod/modules-treasury
npm run build -w @jurnapod/modules-treasury

# API validation
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run lint -w @jurnapod/api

# Test validation
npm run test:unit -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/lib/cash-bank.test.ts

# Critical path tests
npm run test:unit:critical -w @jurnapod/api
```

---

_Last Updated: 2026-04-03_
