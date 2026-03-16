# Cleanup Sprint: Complete Retro Commitments & Fix Technical Debt

## Overview

This cleanup sprint addresses systemic issues identified in Epics 1 and 2 retrospectives:
- Incomplete retro commitments
- Stories marked "DONE" with known gaps
- Technical debt accumulation
- Inconsistent Definition of Done

**Goal**: Clean foundation before Epic 3
**Timeline**: 1 week (aggressive but achievable)
**Approach**: Dedicated focus, no parallel Epic 3 work

---

## The Problem

### Epic 1 Commitments (Not Completed)
1. ❌ Build notification service infrastructure
2. ❌ Create configuration defaults template
3. ❌ Enhance Definition of Done

### Epic 2 "DONE" Stories (Incomplete)
1. **Story 2.1**: Stock validation NOT implemented
2. **Story 2.2**: Transaction-level discounts NOT implemented
3. **Story 2.6**: Server-side duplicate check NOT implemented

**Result**: 7 technical debt items, quality gates inconsistent, building on unstable ground

---

## The Solution

### Phase 1: Critical Cleanup (P0/P1 Only)

Focus on what blocks production and data integrity. Defer P2/P3 enhancements.

#### Task 1: Build Notification Service (8h)
**Priority**: P0  
**Why**: Blocks multiple features, Epic 1 commitment
**Story**: `cleanup-1-notification-service.md`

**Deliverables:**
- Email service (SendGrid/AWS SES)
- Template system (user invitation, role change, password reset)
- Retry logic and error handling
- Integration tests

**Acceptance Criteria:**
- [ ] Service can send transactional emails
- [ ] Configuration via environment variables
- [ ] 3 retry attempts with exponential backoff
- [ ] Integration test proving delivery

---

#### Task 2: Server-Side Duplicate Check API (4h)
**Priority**: P0  
**Why**: Data integrity critical for POS sync
**Story**: `cleanup-2-duplicate-check-api.md`

**Deliverables:**
- API endpoint: `POST /api/transactions/check-duplicate`
- Unique constraint on `(company_id, client_tx_id)`
- Idempotent transaction creation
- Integration with sync flow

**Acceptance Criteria:**
- [ ] Endpoint returns existing transaction if found
- [ ] Creates new transaction only if not exists
- [ ] Database constraint prevents duplicates
- [ ] Tenant isolation enforced

---

#### Task 3: Stock Validation System (12h)
**Priority**: P1  
**Why**: Prevents overselling, production requirement
**Story**: `cleanup-3-stock-validation.md`

**Deliverables:**
- Add `stock_qty` to ProductCacheRow
- Sync stock data from server
- Validate stock before adding to cart
- Update stock after sale
- Server-side stock validation

**Acceptance Criteria:**
- [ ] Stock quantity included in product sync
- [ ] Validation prevents adding items beyond stock
- [ ] Stock decremented after successful sale
- [ ] Server validates stock on sync
- [ ] Edge cases handled (zero stock, stale data, etc.)

---

### Phase 2: Process Improvements (2h)

#### Task 4: Enhanced Definition of Done
**File**: `AGENTS.md` (already updated)

**New Definition of Done:**
```markdown
## Definition of Done (MANDATORY)

**Before marking ANY story as DONE, the following MUST be completed:**

### Implementation Checklist
- [ ] All Acceptance Criteria implemented with evidence
- [ ] No known technical debt (or debt items formally created in sprint-status.yaml)
- [ ] Code follows repo-wide operating principles
- [ ] No breaking changes without cross-package alignment

### Testing Requirements
- [ ] Unit tests written and passing (show test output)
- [ ] Integration tests for API boundaries
- [ ] Error path/happy path testing completed
- [ ] Database pool cleanup hooks present

### Quality Gates
- [ ] Code review completed with no blockers
- [ ] AI review conducted (use `bmad-code-review` agent)
- [ ] Review feedback addressed or formally deferred

### Documentation
- [ ] Schema changes documented
- [ ] API changes reflected in contracts
- [ ] Dev Notes include files modified/created

### Production Readiness
- [ ] Feature is deployable (no feature flags hiding incomplete work)
- [ ] No hardcoded values or secrets in code
- [ ] Performance considerations addressed

### Completion Evidence
Story completion notes MUST include:
- List of files created/modified
- Test execution evidence (passing tests)
- Screenshots or logs for UI changes
- Any known limitations or follow-up work

**IMPORTANT**: A story marked "DONE" with incomplete items is technical debt. 
Debt compounds. Do it right or formally track it.
```

**Acceptance Criteria:**
- [x] Definition of Done added to AGENTS.md
- [ ] Team trained on new requirements
- [ ] Applied to all future stories

---

#### Task 5: Sprint Status Updates
**File**: `sprint-status.yaml` (already updated)

**Changes:**
- Marked `epic-2-retrospective: done`
- Added `cleanup-sprint: in-progress`
- Added 3 cleanup stories: `ready-for-dev`

---

## Defer to Epic 3 (Lower Priority)

These items are NOT part of the cleanup sprint:

### P2 Items
- Transaction-level discounts (Story 2.2 incomplete)
- Discount code validation system (Story 2.2 incomplete)

### P3 Items  
- 7-day sync warning UI (Story 2.4 enhancement)
- Promo table integration (Story 2.2 enhancement)
- Configuration defaults template (Epic 1 commitment - lower impact)

**Rationale**: Focus on critical gaps. These can be addressed in Epic 3 planning.

---

## Execution Plan

### Week Schedule

**Monday** (8h)
- Morning: Notification service setup & provider integration
- Afternoon: Template system & retry logic

**Tuesday** (4h)
- Morning: Finish notification service
- Afternoon: Testing & documentation

**Wednesday** (8h)
- Morning: Duplicate check API endpoint
- Afternoon: Database migration & unique constraints

**Thursday** (12h)
- Morning: Stock validation - schema & sync
- Afternoon: Cart validation logic
- Evening: Server-side stock validation

**Friday** (4h)
- Morning: Testing all 3 cleanup tasks
- Afternoon: Documentation & sprint status updates
- Team training on new Definition of Done

---

## Resource Allocation

**Recommended**: 2 developers full-time for 1 week

**Why Dedicated Focus:**
- Partial attention = partial results
- Clean foundation enables faster Epic 3 execution
- Debt compounds if not addressed

**Alternative**: 1 developer full-time for 2 weeks (lower pressure)

---

## Success Criteria

**Cleanup Sprint Complete When:**

1. **Notification Service**
   - [ ] Emails sending successfully (proof of delivery)
   - [ ] All 3 templates working
   - [ ] Retry logic tested
   - [ ] Integration tests passing

2. **Duplicate Check API**
   - [ ] Endpoint responding correctly
   - [ ] Duplicates prevented in testing
   - [ ] Database constraints applied
   - [ ] Tenant isolation verified

3. **Stock Validation**
   - [ ] Stock sync working
   - [ ] Validation preventing oversells
   - [ ] Stock decremented after sales
   - [ ] Edge cases handled

4. **Process**
   - [ ] Definition of Done documented
   - [ ] Team understands new requirements
   - [ ] Sprint status updated

**Total**: 24 hours estimated

---

## Risk Mitigation

### Risk: Takes Longer Than 1 Week
**Mitigation**: 
- Scope is limited to P0/P1 only
- If behind, cut scope further (defer stock validation to P1.5)
- Daily standups to catch blockers early

### Risk: Breaks Existing Functionality
**Mitigation**:
- All changes additive (no breaking changes)
- Feature flags available if needed
- Rollback plan: disable validation via config

### Risk: Team Resists "Cleanup" Work
**Mitigation**:
- Frame as "foundation for Epic 3" not "fixing mistakes"
- Show dependency graph: Epic 3 blocks until this is done
- Rotate developers so everyone sees the value

---

## Post-Cleanup: Epic 3 Readiness

After cleanup sprint completes:

✅ Notification service available for features requiring emails  
✅ Data integrity protected (duplicate prevention)  
✅ Overselling prevented (stock validation)  
✅ Clear Definition of Done for all future work  
✅ Clean slate for Epic 3  

**Then**: Begin Epic 3 planning with confidence

---

## Files Created

1. `_bmad-output/implementation-artifacts/cleanup-1-notification-service.md`
2. `_bmad-output/implementation-artifacts/cleanup-2-duplicate-check-api.md`
3. `_bmad-output/implementation-artifacts/cleanup-3-stock-validation.md`
4. `_bmad-output/implementation-artifacts/CLEANUP_PLAN.md` (this file)
5. `AGENTS.md` (updated with Definition of Done)
6. `sprint-status.yaml` (updated with cleanup sprint tracking)

---

## Next Steps

1. **Review this plan** - Confirm scope and timeline
2. **Assign developers** - 2 devs for 1 week, or 1 dev for 2 weeks
3. **Begin implementation** - Start with notification service
4. **Daily standups** - Track progress, unblock issues
5. **Completion verification** - Run through all acceptance criteria
6. **Proceed to Epic 3** - Only after cleanup complete

---

**Ahmad**: Ready to proceed with cleanup sprint?

Execute with: `bmad-dev-story cleanup-1-notification-service`
