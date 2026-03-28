# Epic 12 Retrospective

**Epic:** Standardize Library Usage for All Routes  
**Status:** Completed (with significant deferred scope)  
**Date:** 2026-03-28  
**Facilitator:** Critical Review

---

## Executive Summary

Epic 12 claimed to establish "library-first architecture for all routes" but **deferred 3 of the 6 most complex routes** to a follow-up epic. This retrospective challenges whether Epic 12 was truly complete or whether we shipped an incomplete solution and called it done.

**Deferred to Epic 13:**
- `import.ts` (9 SQL queries, batch operations, complex validation)
- `inventory.ts` (4 SQL queries, multi-table access patterns)
- `sync/pull.ts` (audit adapter pattern, external interface requirements)

---

## What Went Well

### 1. Pattern Establishment
The core pattern is sound and was successfully replicated:
```
Types → Errors → CRUD Functions → Route Handlers
```
Evidence: All 3 libraries created in Epic 12 follow this structure consistently.

### 2. Test Coverage Discipline
Each library module got dedicated tests:
- `settings-modules.test.ts`: 6 tests
- `check-duplicate.test.ts`: 7 tests  
- `query-builder.test.ts`: 41 tests

This established a testing standard that Epic 13 maintained.

### 3. Documentation Artifacts
Created reusable templates:
- `TEMPLATE.md` for new library modules
- `ADR-0012-library-first-architecture.md` captured the decision
- Updated `AGENTS.md` with library-first guidelines

### 4. Successful Route Refactors
The 3 routes that *were* refactored work correctly:
- Zero functional regressions
- TypeScript compilation clean
- Routes are more readable

---

## What Didn't Go Well

### 1. Scope Deception
**Claim:** "Standardize Library Usage for **All** Routes"  
**Reality:** Only the easy routes were done.

We deferred exactly the routes that had:
- Complex multi-query operations
- Batch processing requirements  
- External interface dependencies (audit service)
- Permission logic interwoven with queries

This isn't "all routes" — this is "all the easy routes."

### 2. Underestimation of Complexity
Epic 12 estimated 16 hours total. Epic 13 (the "deferred" work) took another ~25 hours. Combined: **41 hours for 6 routes** = ~7 hours per route.

If we'd known the true complexity upfront, we should have:
- Scoped Epic 12 to "Standardize Simple Routes"
- Created Epic 13 from the start for "Complex Route Migration"
- Not claimed victory prematurely

### 3. False Confidence in Abstractions
The patterns from Epic 12 didn't fully work for Epic 13's complex routes:

| Epic 12 Pattern | Epic 13 Reality |
|----------------|-----------------|
| Simple CRUD functions | Needed batch operations with transaction management |
| Route-level validation | Needed shared validation library |
| Direct library calls | Needed adapter pattern for audit interfaces |
| Single-table queries | Multi-table access checks |

We thought we had a universal pattern. We had a pattern for simple cases.

### 4. Permission Logic Fragility
`settings-modules.ts` had inline permission checks that should have been extracted earlier. Epic 13 had to create `lib/auth/permissions.ts` — this should have been identified in Epic 12.

**Evidence:** The same `canManageCompanyDefaults()` logic was:
- Inline in `settings-modules.ts` route (Epic 12)
- Duplicated in planning for `inventory.ts` (Epic 13)
- Finally extracted to shared library (Epic 13.5)

This is duplication we created by not looking hard enough.

### 5. Export Library Scope Creep
Epic 12.5 "Extend lib/export/" added 4 new query builder functions. But the export route still needed significant work in Epic 12.6.

The library wasn't actually complete after 12.5 — the route refactor revealed gaps. This indicates the library-first approach wasn't fully validated before claiming the library story "done."

---

## What We Missed

### 1. Complexity Tiers
We should have categorized routes by complexity **before** starting:

**Tier 1 (Simple):**
- settings-modules.ts
- check-duplicate.ts
- Basic CRUD routes

**Tier 2 (Moderate):**
- export.ts (complex queries but single purpose)

**Tier 3 (Complex):**
- import.ts (batch operations, validation)
- inventory.ts (multi-table, permissions)
- sync/pull.ts (external interfaces, audit)

Had we done this, Epic 12 would have been scoped to Tier 1-2, and we'd have planned Epic 13 from the start.

### 2. Cross-Cutting Concerns
We missed that permission checks and validation logic were scattered across routes. Extracting queries wasn't enough — we needed to extract:
- Permission utilities
- Validation schemas
- Transaction management helpers

Epic 13 had to create these. Epic 12 should have identified the need.

### 3. Test Data Coupling
The libraries were tested in isolation, but we didn't verify they worked with the actual route contexts (transaction handling, error propagation). Epic 13 discovered edge cases in transaction handling that Epic 12 libraries didn't expose.

### 4. Documentation of "Why"
We documented the pattern ("what") but not the decision criteria ("why"). When should you use batch operations vs individual queries? When should validation be in the library vs the route? Epic 13 had to figure this out through trial and error.

---

## Technical Debt Created

### 1. Deferred Complexity
By deferring the hard routes, we:
- Left inconsistent architecture in the codebase (some routes library-first, some not)
- Delayed learning about complex patterns
- Created a false sense of "migration complete"

### 2. Incomplete Abstractions
The libraries from Epic 12 work for simple cases but don't compose well for complex scenarios. Example: `settings-modules.ts` functions don't support the transaction batching pattern needed by `import.ts`.

**Debt:** We'll need to either:
- Extend these libraries with batch/transaction support
- Create parallel "batch" versions
- Accept that some routes need different abstractions

### 3. Permission Coupling
`lib/settings-modules.ts` still has implicit permission requirements (caller must check before calling). This isn't documented in function signatures. A developer could misuse these functions.

**Recommendation:** Add permission requirements to JSDoc or encode in types.

### 4. Test Duplication
Each library has its own tests, but there's integration-level behavior (route + library) that's now tested in both unit tests and route tests. We should audit for redundant coverage.

---

## Root Cause Analysis

### Why Did We Defer 3 Major Routes?

**Surface Cause:** "Ran out of time / scope too big"  
**Root Cause:** Insufficient up-front analysis

We didn't:
1. Read all the route files before estimating
2. Identify complexity tiers
3. Understand cross-cutting concerns
4. Validate that our patterns would scale to complex cases

**The Planning Failure:**
If Epic 12 planning had included even 30 minutes of reading `import.ts`, `inventory.ts`, and `sync/pull.ts`, we would have seen:
- Batch operations in import
- Complex permission checks in inventory
- Audit adapter requirements in sync/pull

We would have scoped Epic 12 realistically and planned Epic 13 from the start.

---

## Action Items for Future Epics

### Immediate (Next Epic Planning)

1. **Mandatory Route Analysis**
   - Before estimating, read every file that will be touched
   - Document complexity tier for each route
   - Identify cross-cutting concerns upfront

2. **Pattern Validation**
   - Before claiming a pattern "established," verify it works for the most complex case
   - Create a "canary" story for the hardest route first

3. **Honest Scope Naming**
   - Don't call it "All Routes" if it's "Simple Routes"
   - Better to under-promise and over-deliver

### Process Improvements

4. **Library Completeness Criteria**
   A library story isn't done until:
   - [ ] Unit tests pass
   - [ ] Route refactor using the library passes tests
   - [ ] Documentation updated
   - [ ] **Pattern validated against most complex use case**

5. **Permission Audit**
   - Every route refactor must extract permission checks
   - No inline permission logic in routes
   - Document permission requirements in library JSDoc

6. **Complexity-Based Estimation**
   - Tier 1 (Simple CRUD): 2-3 hours
   - Tier 2 (Moderate): 4-6 hours
   - Tier 3 (Complex): 8-12 hours
   - Multiply by 1.5x for "first of kind" (pattern establishment)

---

## Lessons Learned

### For Developers
1. **Read the hard files first.** The easy files will always work. The hard files reveal the true constraints.
2. **Patterns aren't proven until they've handled an exception case.** Happy-path success is necessary but not sufficient.
3. **Extract cross-cutting concerns early.** Permission checks, validation, and transaction management should be identified in story 1, not story 7.

### For Planning
1. **"All" is a dangerous word.** Unless you've verified every instance, use "Initial" or "Phase 1."
2. **Deferral is debt.** Every deferred route is architectural inconsistency. Track it explicitly.
3. **Completion isn't binary.** Having 3 routes refactored is progress. Claiming the epic is "done" when 3 are deferred is misleading.

### For Reviews
1. **Challenge "done" claims.** Ask: "Is there any scope that was identified but not completed?"
2. **Verify pattern scalability.** Did the established pattern get tested against a complex case?
3. **Check for duplication.** If Epic N+1 creates utilities that Epic N should have made, flag it.

---

## Honest Assessment

**Did Epic 12 succeed?**

Partially. It:
- ✅ Established a sound pattern for simple routes
- ✅ Created reusable templates and documentation
- ✅ Refactored 3 routes successfully
- ❌ Claimed "all routes" when it was "simple routes"
- ❌ Deferred the hard work to a follow-up epic
- ❌ Created false confidence in pattern completeness

**Grade: B-**

Good execution on what was done, but poor scoping and premature celebration. The need for Epic 13 indicates Epic 12 was incomplete, not that we "discovered" additional work.

---

## Conclusion

Epic 12 delivered value but obscured remaining work. The retrospective's job isn't to celebrate what went well — it's to ensure we don't repeat the planning failures.

**The real metric:** How many epics until we can honestly say "all routes use library-first architecture?"

**Answer:** Epic 13. Not Epic 12.

Let's be honest about that in future planning.

---

*Retrospective completed: 2026-03-28*  
*Next retrospective: Epic 13 (to see if we learned these lessons)*
