# Epic 6: Technical Debt Consolidation & Modernization

**Goal:** Address accumulated technical debt from Epics 0-5, reduce code complexity, improve type safety, and establish sustainable patterns for future development.

**Business Value:**
- Faster feature development as codebase becomes more maintainable
- Reduced bug surface area from type-unsafe code paths
- Better performance from optimized data access patterns
- Improved developer experience with cleaner architecture
- Lower technical risk for future scaling

**Success Metrics:**
- Reduce `as any` casts in production code by 80%
- Extract monolith files (>2000 lines) into focused domain modules
- All critical paths have route-level test coverage
- Zero deprecated public APIs in use
- MySQL/MariaDB compatibility verified across all schema changes

---

## Story 6.1: Consolidate Sales Module (4000+ lines monolith)

**Context:**

`apps/api/src/lib/sales.ts` is 4,120 lines handling:
- Invoice creation and validation
- Payment processing
- Journal posting
- Receipt generation
- Credit/Debit notes
- Split payments

This file was the original monolith and has accumulated significant complexity.

**Acceptance Criteria:**

**AC1: Module Boundary Extraction**
- Extract invoice-specific logic into `lib/invoices/`
- Extract payment processing into `lib/payments/`
- Extract receipt generation into `lib/receipts/`
- Each sub-module has clear public interface in `index.ts`

**AC2: Type Safety Improvements**
- Replace `as any` casts in `sales.ts` with proper typed queries
- Use Kysely's typed query builders throughout
- Add Zod schemas for all public function parameters

**AC3: Test Coverage**
- Add unit tests for extracted sub-modules
- Maintain 100% passing tests throughout refactor
- No regression in existing invoice/payment flows

**Estimated Effort:** 4 days

**Risk Level:** High (core financial module)

---

## Story 6.2: Consolidate Service Sessions Module (2000+ lines)

**Context:**

`apps/api/src/lib/service-sessions.ts` is 2,051 lines handling dine-in service sessions with multi-cashier support.

**Acceptance Criteria:**

**AC1: Sub-module Extraction**
- Extract session lifecycle into `lib/service-sessions/lifecycle.ts`
- Extract line management into `lib/service-sessions/lines.ts`
- Extract checkpoint/finalize logic into `lib/service-sessions/checkpoint.ts`
- Clear `index.ts` public interface

**AC2: Type Safety**
- Replace `as any` casts with typed queries
- Add runtime validation for session state transitions

**Estimated Effort:** 3 days

**Risk Level:** Medium (POS-facing but isolated)

---

## Story 6.3: Type Safety Audit - Remove `as any` Casts

**Context:**

67 instances of `as any` found across codebase. While some are acceptable in test files, production code casts represent type safety debt that can hide bugs.

**Acceptance Criteria:**

**AC1: Production Code Audit**
- Review all `as any` casts in production code (not tests)
- Categorize: necessary (library interop), should fix, can defer
- Fix "should fix" items with proper types

**AC2: Priority Fixes**
- `batch-processor.ts` connection cast
- `recipe-composition.ts` execute cast
- `cost-tracking.ts` multiple casts
- `reports.ts` report type casts

**AC3: Pattern Documentation**
- Document when `as any` is acceptable
- Add ESLint rule to prevent new `as any` in production

**Estimated Effort:** 2 days

**Risk Level:** Low (type safety improvement)

---

## Story 6.4: Deprecation Cleanup

**Context:**

Two deprecated items identified:
1. `date-helpers.ts` - `toLocalDate()` deprecated in favor of `toUtcInstant()`
2. `auth.ts` - `checkUserAccess` deprecated in favor of `checkAccess`

**Acceptance Criteria:**

**AC1: Date Helper Migration**
- Update all callers to use `toUtcInstant()`
- Remove deprecated `toLocalDate()` function
- Update ADR-0007 if needed

**AC2: Auth Helper Migration**
- Update all callers to use `checkAccess()`
- Remove deprecated `checkUserAccess()` function
- Update AGENTS.md auth section if needed

**AC3: Documentation**
- Search codebase for any remaining references to deprecated functions
- Update any docs referencing deprecated functions

**Estimated Effort:** 1 day

**Risk Level:** Low (straightforward replacement)

---

## Story 6.5: Reservation System Domain Extraction

**Context:**

`apps/api/src/lib/reservations.ts` is 1,849 lines handling:
- Reservation CRUD
- Table assignment
- Availability checking
- Large party support (groups)
- Walk-in management

This is a candidate for domain extraction similar to Epic 3's items/prices extraction.

**Acceptance Criteria:**

**AC1: Module Extraction**
- Extract reservations into `lib/reservations/` domain module
- Clear `index.ts` public interface
- Maintain all existing functionality

**AC2: Route Migration**
- Update routes to use new domain module
- Maintain API compatibility

**AC3: Test Coverage**
- Add unit tests for reservation domain
- Maintain 100% passing tests

**Estimated Effort:** 3 days

**Risk Level:** Medium (user-facing feature)

---

## Story 6.6: ADR Documentation & Debt Registry

**Context:**

As the codebase matures, technical debt needs active tracking. ADR-0010 was created for Epic 5 but there's no systematic approach to tracking debt.

**Acceptance Criteria:**

**AC1: Debt Registry**
- Create `docs/adr/TECHNICAL-DEBT.md` as living debt registry
- Catalog all known debt items across epics
- Link to specific ADRs for detailed tracking

**AC2: Review Process**
- Document process for adding new debt items
- Define priority levels (P1/P2/P3)
- Set review cadence (per-epic or quarterly)

**AC3: Debt Prevention**
- Add debt items to story templates as checkboxes
- Require debt review before closing epics

**Estimated Effort:** 1 day

**Risk Level:** None (process improvement)

---

## Story 6.7: Epic 5 Follow-Up Actions

**Context:**

Epic 5 retrospective identified specific follow-up actions that weren't completed:

**Acceptance Criteria:**

**AC1: Integration Tests (P1)**
- Add API-level integration tests for import/export endpoints
- Cover: upload → validate → apply flow
- Cover: export with filters

**AC2: UI Completeness (P2)**
- Add column reordering in export UI
- Add row count preview before export
- Add retry option on export errors

**AC3: Epic 5 ADR Update**
- Mark completed follow-ups in ADR-0010
- Update status of remaining debt items

**Estimated Effort:** 2 days

**Risk Level:** Low (feature completion)

---

## Technical Debt Items to Address

### From Previous Epics

| TD | Description | Priority | Epic |
|----|-------------|----------|------|
| TD-1 | CSV parsing loads entire file | Medium | Epic 5 |
| TD-2 | Excel parsing loads entire workbook | Medium | Epic 5 |
| TD-5 | FK validation may cause N+1 | Medium | Epic 5 |
| TD-6 | No import checkpoint/resume | Low | Epic 5 |
| TD-7 | Export streaming backpressure | Low | Epic 5 |
| TD-8 | No progress persistence | Low | Epic 5 |

### From This Epic

| TD | Description | Priority |
|----|-------------|----------|
| TD-9 | `sales.ts` monolith (4120 lines) | High |
| TD-10 | `service-sessions.ts` monolith (2051 lines) | Medium |
| TD-11 | `reservations.ts` monolith (1849 lines) | Medium |
| TD-12 | `as any` casts in production code | Medium |
| TD-13 | Deprecated date-helpers functions | Low |
| TD-14 | Deprecated auth functions | Low |

---

## Estimated Timeline

| Story | Effort | Dependencies |
|-------|--------|--------------|
| 6.1 | 4 days | None |
| 6.2 | 3 days | None |
| 6.3 | 2 days | None |
| 6.4 | 1 day | None |
| 6.5 | 3 days | None |
| 6.6 | 1 day | None |
| 6.7 | 2 days | 6.1, 6.2, 6.5 |

**Total Estimated Effort:** 16 days (4 weeks)

---

## Files to Create/Modify

### New Files
- `apps/api/src/lib/invoices/` - Invoice domain module
- `apps/api/src/lib/payments/` - Payment domain module
- `apps/api/src/lib/receipts/` - Receipt domain module
- `apps/api/src/lib/service-sessions/lifecycle.ts`
- `apps/api/src/lib/service-sessions/lines.ts`
- `apps/api/src/lib/service-sessions/checkpoint.ts`
- `apps/api/src/lib/reservations/` - Reservations domain module
- `docs/adr/TECHNICAL-DEBT.md` - Debt registry

### Files to Modify
- `apps/api/src/lib/sales.ts` - Extract sub-modules
- `apps/api/src/lib/service-sessions.ts` - Extract sub-modules
- `apps/api/src/lib/reservations.ts` - Extract domain
- `apps/api/src/lib/date-helpers.ts` - Remove deprecated
- `apps/api/src/lib/auth.ts` - Remove deprecated
- `apps/api/src/lib/batch-processor.ts` - Type fixes
- `apps/api/src/lib/recipe-composition.ts` - Type fixes
- `apps/api/src/lib/cost-tracking.ts` - Type fixes
- `apps/api/src/routes/reports.ts` - Type fixes
- `docs/adr/ADR-0010.md` - Update Epic 5 debt
- `docs/adr/TECHNICAL-DEBT.md` - New debt registry

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Refactoring sales module introduces bugs | Comprehensive test suite; incremental extraction |
| Breaking changes to invoice API | Maintain backward compatibility; version if needed |
| Scope creep on "type safety" | Strict AC definitions; defer if needed |
| Developer fatigue from debt work | Rotate between debt and features |

---

## Related Documentation

- [Epic 3 Retrospective](../_bmad-output/implementation-artifacts/epic-3-retro-2026-03-26.md) - Pattern for domain extraction
- [Epic 5 Retrospective](./epic-5-retro-2026-03-26.md) - Follow-up actions
- [ADR-0010: Import/Export Technical Debt](../docs/adr/ADR-0010-import-export-technical-debt.md)
