# Epic 4: Technical Debt Cleanup & Process Improvement

**Status:** Done  
**Theme:** Address Epic 3 retrospective action items and improve development processes  
**Dependencies:** Epic 3 (master data domain extraction complete)  
**Completed:** 2026-03-28  
**Stories:** 4/4 (100%)

---

## Summary

Epic 4 addressed all P1 and P2 action items from the Epic 3 retrospective. This pure cleanup and process improvement epic consolidated duplicated utilities from five domain modules into a shared location, backfilled test coverage gaps for fixed-assets, created stakeholder-facing documentation explaining the business value of architecture investments, and established permanent process improvements including updated story templates and sync protocol validation checklists.

---

## Goals

1. **Shared Utilities**: Consolidate duplicated helper code from domain modules
2. **Test Coverage**: Backfill fixed-assets route tests to match other domains
3. **Stakeholder Communication**: Document product enablement from Epic 3
4. **Process Improvement**: Update templates and create sync validation checklist

---

## Stories

| Story | Description | Status | Key Achievement |
|-------|-------------|--------|-----------------|
| 4.1 | Extract Shared Master-Data Utilities | Done | `lib/shared/master-data-utils.ts` created |
| 4.2 | Backfill Fixed-Assets Route Tests | Done | 51 new route tests added |
| 4.3 | Document Epic 3 Product Enablement | Done | Stakeholder-facing enablement doc created |
| 4.4 | Update Story Template & Sync Checklist | Done | Templates updated with coverage criteria |

---

### Story 4.1: Extract Shared Master-Data Utilities

**Status:** Done  
**Description:** Consolidate duplicated utilities from five domain modules into a shared location.

**Context:**
Epic 3 extracted 5 domain modules, each independently implementing identical utilities:
- `withTransaction` - database transaction wrapper
- `isMysqlError` - MySQL error type guard
- `mysqlDuplicateErrorCode` / `mysqlForeignKeyErrorCode` - error code constants
- `ensureUserHasOutletAccess` - shared validation helper
- Audit logging helpers

This ~80% duplication created maintenance burden.

**Acceptance Criteria:**
- All duplicated utilities identified across 5 domain modules
- `lib/shared/master-data-utils.ts` created with consolidated utilities
- Each domain module imports from shared location
- All 762 tests pass with zero functional changes

**Consolidated Utilities:**
- `mysqlDuplicateErrorCode = 1062`
- `mysqlForeignKeyErrorCode = 1452`
- `isMysqlError(error)` - Type guard for MySQL errors
- `withTransaction<T>(operation)` - Transaction wrapper
- `recordMasterDataAuditLog(executor, input)` - Generic audit log recorder
- `ensureUserHasOutletAccess(executor, userId, companyId, outletId)` - Access validation

**Module-Specific Functions (NOT consolidated):**
- `ensureCompanyItemGroupExists` - Only in item-groups and items
- `ensureCompanyItemExists` - Only in item-prices
- `ensureCompanyOutletExists` - Only in item-prices and fixed-assets
- `ensureCompanyAccountExists` - Only in items and fixed-assets
- `ensureCompanyFixedAssetCategoryExists` - Only in fixed-assets

**Files Created:**
- `apps/api/src/lib/shared/master-data-utils.ts`

**Files Modified:**
- `apps/api/src/lib/item-groups/index.ts`
- `apps/api/src/lib/items/index.ts`
- `apps/api/src/lib/item-prices/index.ts`
- `apps/api/src/lib/supplies/index.ts`
- `apps/api/src/lib/fixed-assets/index.ts`

---

### Story 4.2: Backfill Fixed-Assets Route Tests

**Status:** Done  
**Description:** Add automated route-level tests for fixed-asset and fixed-asset-category CRUD endpoints.

**Context:**
Story 3.5 extracted the fixed-assets domain but accepted a coverage gap. Items and item-groups have comprehensive route tests, but fixed-assets coverage was thin.

**Acceptance Criteria:**
- Fixed-asset-category endpoints (GET, POST, PUT, DELETE) have route-level coverage
- Fixed-asset endpoints (GET, POST, PUT, DELETE) have route-level coverage
- Error paths (validation, not found, conflicts) tested
- Tenant isolation (company_id scoping) verified
- Minimum 80% route coverage achieved

**Test Suites Created (51 tests):**
- Route-Level HTTP Validation (3 tests)
- Fixed Asset Category Data Structure (2 tests)
- Fixed Asset Category CRUD Operations (5 tests)
- Fixed Asset Category Input Validation (7 tests)
- Fixed Asset Category Not Found (3 tests)
- Fixed Asset Category Conflicts (2 tests)
- Fixed Asset Data Structure (2 tests)
- Fixed Asset CRUD Operations (8 tests)
- Fixed Asset Input Validation (5 tests)
- Fixed Asset Not Found (3 tests)
- Fixed Asset Filtering (2 tests)
- Tenant Isolation (4 tests)
- Query Building (2 tests)
- Error Handling (3 tests)

**Coverage Achieved:**
- CRUD operations for fixed-asset-categories: 100%
- CRUD operations for fixed-assets: 100%
- Error paths (HTTP validation, not found, conflicts): 100%
- Tenant isolation: 100%

**Files Created:**
- `apps/api/src/routes/accounts.fixed-assets.test.ts` (51 tests)

---

### Story 4.3: Document Epic 3 Product Enablement

**Status:** Done  
**Description:** Create stakeholder-facing documentation explaining how Epic 3 enables future features.

**Context:**
Epic 3 was a pure refactoring epic with no user-facing changes. Stakeholders need to understand what this architectural investment enables.

**Acceptance Criteria:**
- Document explains enabled features (variant-level sync, GL reports, import/export)
- Technical debt impact quantified (reduced review scope, lower regression risk)
- Technical concepts explained in business terms
- ROI of refactoring articulated
- Document located at `docs/product/epic-3-product-enablement.md`

**Document Sections:**
1. Executive Summary
2. What We Did (brief, non-technical)
3. What This Enables:
   - Faster Feature Development (25-40% time reduction)
   - Variant-Level POS Sync (Q3 2026)
   - Advanced GL Reports (Q4 2026)
   - Import/Export Infrastructure (Q1 2027)
4. Technical Debt Impact
5. ROI Calculation (~$26,250 annual savings in review time)
6. Next Steps

**Files Created:**
- `docs/product/epic-3-product-enablement.md`

**Files Modified:**
- `_bmad-output/implementation-artifacts/epic-3-retro-2026-03-26.md`

---

### Story 4.4: Update Story Template and Create Sync Checklist

**Status:** Done  
**Description:** Improve story templates and create sync validation checklist to prevent future gaps.

**Context:**
Epic 3 retrospective identified gaps:
1. Story 3.5 accepted fixed-assets coverage gap - future stories need explicit test coverage criteria
2. Story 3.6 uncovered sync protocol edge cases - future sync changes need mandatory validation checklist

**Acceptance Criteria:**
- Story template includes mandatory "Test Coverage Criteria" section
- Coverage percentage or "all paths" statement required
- Error paths listing required
- Sync protocol validation checklist created with mandatory validation steps
- ADR-0009 references the checklist
- Epic 4 stories include explicit test coverage criteria

**Story Template Additions:**
```markdown
## Test Coverage Criteria

- [ ] Coverage target: __% (or "all paths")
- [ ] Happy paths to test:
  - [ ] ...
- [ ] Error paths to test:
  - [ ] 400: ...
  - [ ] 404: ...
  - [ ] 409: ...
  - [ ] 500: ...
```

**Sync Protocol Checklist Sections:**
1. Pre-Implementation
   - [ ] Identify sync touchpoints
   - [ ] Review offline-first requirements
2. Implementation
   - [ ] client_tx_id handling verified
   - [ ] Idempotency logic implemented
   - [ ] Conflict resolution strategy defined
3. Testing
   - [ ] Regression tests added/updated
   - [ ] Offline scenario tests pass
   - [ ] Concurrent sync tests pass
4. Documentation
   - [ ] ADR updated if protocol changes
   - [ ] API contracts updated

**Files Created:**
- `docs/process/sync-protocol-checklist.md`
- `docs/templates/story-spec-template.md`

**Files Modified:**
- `docs/adr/ADR-0009-kysely-type-safe-query-builder.md`
- `_bmad-output/implementation-artifacts/stories/epic-4/story-4.1-extract-shared-master-data-utilities.md`
- `_bmad-output/implementation-artifacts/stories/epic-4/story-4.2-backfill-fixed-assets-route-tests.md`
- `_bmad-output/implementation-artifacts/stories/epic-4/story-4.3-document-epic-3-product-enablement.md`
- `_bmad-output/implementation-artifacts/stories/epic-4/story-4.4-update-story-template-and-sync-checklist.md`

---

## Acceptance Criteria

### AC1: Shared Utilities Extraction
- [x] `lib/shared/master-data-utils.ts` created with consolidated utilities
- [x] All 5 domain modules import from shared location
- [x] Zero functional changes (762 tests passing)

### AC2: Test Coverage Backfill
- [x] Fixed-assets route tests created (51 tests)
- [x] CRUD operations 100% covered
- [x] Error paths covered
- [x] Tenant isolation verified

### AC3: Stakeholder Communication
- [x] Product enablement document created
- [x] Business value explained
- [x] ROI quantified
- [x] Document linked from retrospective

### AC4: Process Improvement
- [x] Story template updated with test coverage criteria
- [x] Sync protocol checklist created
- [x] ADR-0009 references checklist
- [x] Epic 4 stories backfilled with coverage criteria

---

## Outcomes

### Completed Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| Shared Utilities | Consolidated helper code from 5 domain modules | Done |
| Fixed-Assets Tests | 51 new route tests added | Done |
| Product Enablement Doc | Stakeholder-facing documentation | Done |
| Story Template | Updated with coverage criteria | Done |
| Sync Checklist | Mandatory validation steps documented | Done |

### Quality Metrics

| Metric | Value |
|--------|-------|
| Stories Completed | 4/4 (100%) |
| Tests Added | 51 new route tests |
| Tests Passing | 762/762 (100%) |
| Type Check | Pass |
| Build | Pass |
| Lint | Pass |
| Retro Action Items | 5/5 completed (3 P1 + 2 P2) |
| Process Docs Created | 2 |

---

## Epic 3 Action Item Follow-Through

All P1 and P2 action items from Epic 3 were completed:

| Action Item | Priority | Story | Status |
|-------------|----------|-------|--------|
| Extract shared master-data utilities package | P1 | 4.1 | Done |
| Backfill fixed-assets route tests | P1 | 4.2 | Done |
| Document Epic 3 product enablement | P1 | 4.3 | Done |
| Add test-coverage gates to story template | P2 | 4.4 | Done |
| Create sync protocol validation checklist | P2 | 4.4 | Done |

**Not Addressed:**
| Action Item | Priority | Status |
|-------------|----------|--------|
| Audit remaining monolith patterns | P3 | Deferred to future capacity |

---

## Key Improvements

### 1. Code Consolidation

**Before:** 5 domain modules each with ~80% identical helpers
**After:** Single `lib/shared/master-data-utils.ts` with shared code

**Utilities Consolidated:**
- `withTransaction`
- `isMysqlError`
- Error code constants
- `ensureUserHasOutletAccess`
- Audit logging helpers

### 2. Test Coverage Achievement

**Before:** Fixed-assets had thin route coverage
**After:** 100% CRUD coverage, error paths, tenant isolation

**Test Categories:**
- Route-Level HTTP Validation
- Data Structure Validation
- CRUD Operations
- Input Validation
- Not Found Handling
- Conflict Detection
- Tenant Isolation
- Query Building
- Error Handling

### 3. Process Documentation

**Story Template Now Requires:**
- Explicit coverage target (% or "all paths")
- Listed happy paths
- Listed error paths (400, 404, 409, 500)

**Sync Checklist Covers:**
- Pre-implementation sync touchpoint identification
- Implementation idempotency verification
- Testing regression and offline scenarios
- Documentation updates

### 4. Stakeholder Communication

**Product Enablement Document:**
- Translates technical refactoring into business value
- Quantified ROI (~$26,250 annual savings)
- Feature timeline estimates (Q3 2026 - Q1 2027)
- Links technical work to business outcomes

---

## Dependencies

| Dependency | Epic | Status | Notes |
|------------|------|--------|-------|
| Domain modules extracted | Epic 3 | Done | 5 modules ready for utility consolidation |
| Epic 3 retrospective | Epic 3 | Done | Source of action items |

---

## Lessons Learned

### Technical Lessons

1. **Not everything should be consolidated**: Module-specific validators correctly stayed in their modules
2. **Clear criteria for shared vs module-specific**: Functions used by 3+ modules → shared; 1-2 modules → stay local

### Process Lessons

1. **Debt repayment epics are effective when scoped to retro actions**: Epic 4's tight focus ensured completion
2. **Test coverage backfill is easier with established patterns**: Following existing `inventory.test.ts` patterns made Story 4.2 straightforward
3. **Process improvements compound value**: Template and checklist changes benefit every future epic
4. **Stakeholder-facing docs justify architecture work**: Product enablement document demonstrated business value of refactoring
5. **Retro action items need explicit tracking**: Having them as stories in sprint-status.yaml made tracking easier

---

## Risks Encountered

| Risk | Severity | Status | Mitigation |
|------|----------|--------|------------|
| Epic 4 had no epic definition file | Low | Noted | P1 action for future epics |
| Story 4.4 scope expansion | Low | Accepted | Additional valuable work included |
| P3 items not addressed | Low | Deferred | Review at next sprint planning |

---

## Next Epic Preparation

**Epic 5:** (Next feature epic)

**Epic 4 Leaves Behind:**
- Updated story templates with coverage requirements
- Sync protocol validation checklist
- Consolidated shared utilities
- 100% fixed-assets test coverage
- P3 item to audit remaining monolith patterns

---

## Retrospective Reference

Full retrospective available at: `epic-4.retrospective.md`

Related documentation:
- [Epic 3 Retrospective](../epic-3-retro-2026-03-26.md)
- [Epic 3 Product Enablement](../../docs/product/epic-3-product-enablement.md)
- [Sync Protocol Checklist](../../docs/process/sync-protocol-checklist.md)
- [Story Spec Template](../../docs/templates/story-spec-template.md)

---

## Definition of Done Verification

- [x] All Acceptance Criteria implemented with evidence
- [x] No known technical debt from Epic 3 retro
- [x] Code follows repo-wide operating principles
- [x] No breaking changes without cross-package alignment
- [x] Unit tests written and passing (762 tests)
- [x] Error path/happy path testing completed
- [x] Code review completed
- [x] AI review conducted
- [x] Process documentation created
- [x] Templates updated and applied
- [x] Feature is deployable
- [x] Completion evidence documented

---

*Epic 4 completed successfully. All Epic 3 retrospective action items addressed.*
