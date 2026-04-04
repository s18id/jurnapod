---
epic: 28
epic_title: "Sales Payments Extraction"
status: done
completed_date: 2026-04-04
stories_completed: 5
stories_total: 5
completion_rate: 100%
retrospective_date: 2026-04-04
facilitator: Bob (Scrum Master)
participants:
  - Bob (Scrum Master)
  - Alice (Product Owner)
  - Charlie (Senior Dev)
  - Dana (QA Engineer)
  - Elena (Junior Dev)
  - Ahmad (Project Lead)
overall_grade: "A"
---

# Epic 28 Retrospective: Sales Payments Extraction

**Epic Status:** ✅ Complete
**Stories:** 5/5 completed
**Completion Date:** 2026-04-04
**Retrospective Date:** 2026-04-04
**Format:** Full Team Retrospective (Party Mode)

---

## Executive Summary

Epic 28 completed the API Detachment work for the sales payments boundary, making `@jurnapod/modules-sales` the canonical owner of payment domain logic. The transaction-safe posting hook pattern was successfully applied, preserving atomicity between payment writes and journal postings.

**Overall Grade: A**

*Grade reflects excellent delivery with proven transaction-safe hook pattern. Minor concern: parity methodology from Epic 27 still not formally documented (E27-A1).*

---

## Epic Summary

| Metric | Value |
|--------|-------|
| Stories Completed | 5/5 (100%) |
| Files Deleted | 2 (`payment-service.ts`, `payment-allocation.ts`) |
| LOC Removed | ~971 (763 + 208) |
| Packages Affected | modules-sales, api |
| Validation Gates | ✅ All passed |
| Behavior Regression | ✅ None |
| Pattern Applied | PaymentPostingHook (transaction-safe) |

---

## What Worked Well

### 1. Transaction-Safe Hook Pattern (Story 28.3)
- Defined `PaymentPostingHook` interface
- Injected into `PaymentService`
- Called from within module's transaction context
- **Impact:** Payment journal posting remains atomic with payment write

### 2. Permission Map Fixes (Story 28.1)
- Found payments:* scope was incomplete in access-scope-checker
- Fixed before route flip
- **Impact:** Tenant/outlet scoping preserved correctly

### 3. Behavioral Parity on Complex Scenarios (Story 28.2)
- Split payments, shortfall, and overpayment behaviors compared
- API semantics locked in (do not change behavior)
- Gap fixes applied to module to match API
- **Impact:** Zero behavior change for complex payment scenarios

### 4. Proven Pattern for Future Extractions
- Hook pattern same as what will be used for fixed assets in Epic 29
- Transaction-safe injection is now a documented technique
- **Impact:** Team has confidence to apply pattern again

### 5. Code Elimination
- payment-service.ts (763 LOC) deleted
- payment-allocation.ts (208 LOC) deleted
- **Impact:** Real API-local code elimination

---

## What Was Challenging

### 1. E27-A1 Still Not Addressed
- Epic 27 identified need to document parity check methodology
- Epic 28 used the same methodology but still no formal documentation
- **Impact:** P2 action item remains open
- **Lesson:** Process improvements need dedicated attention, not just implicit adoption

### 2. Sequential Story Dependencies
- All 5 stories were sequential (28.1 → 28.2 → 28.3 → 28.4 → 28.5)
- Each story builds directly on previous
- **Impact:** No parallel work possible, longer critical path

### 3. Complex Payment Scenarios
- Split payments, shortfall/overpayment required careful comparison
- Idempotency semantics had to be preserved exactly
- **Impact:** Story 28.2 required more time than estimated

---

## Key Insights

1. **Transaction-safe hook pattern is proven** - PaymentPostingHook follows same pattern as planned for other extractions

2. **Permission scoping must be verified early** - Story 28.1 found payments:* scope issue before it caused problems

3. **Complex domain logic requires thorough parity checks** - Split payments, shortfall, overpayment are nuanced

4. **Sequential dependencies are acceptable for extraction work** - Each story builds understanding needed for next

5. **API Detachment pattern is now standardized** - Hook injection + route flip + library deletion

---

## Previous Retro Follow-Through (Epic 27)

| Action Item | Committed | Actual | Status |
|-------------|-----------|--------|--------|
| E27-A1: Document parity check methodology | P2 | 0% | ⏳ Open |

**Analysis:** E27-A1 remains open. Epic 28 used the methodology implicitly but formal documentation is still needed.

---

## Action Items

### Process Improvements

| ID | Action | Owner | Due Date | Priority | Status |
|----|--------|-------|----------|----------|--------|
| E27-A1 | Document parity check methodology for duplicate code deletion | Charlie | End of week | P2 | ⏳ Open |

### Technical Debt

None introduced in Epic 28.

---

## Epic 29 Preparation

### Critical Path (Must Complete Before Epic 29)

Epic 29 extracts fixed assets and depreciation:
- Largest source: fixed-assets-lifecycle.ts (1868 LOC)
- Lifecycle events (acquire/transfer/impair/dispose/void) + journal posting
- Same transaction-safe pattern will apply

### Technical Prerequisites

- Epic 28 validation results (all passed) - ✅ Confirmed
- modules-sales PaymentPostingHook pattern documented - ⚠️ Still informal

---

## Grade Breakdown

| Dimension | Grade | Weight | Contribution |
|-----------|-------|--------|--------------|
| **Delivery** | A+ | 25% | 5/5 stories, 100% completion, all gates pass |
| **Quality** | A | 25% | Zero behavior regression, atomicity preserved |
| **Technical Debt** | A | 25% | No new TD, code eliminated |
| **Process Improvement** | B+ | 15% | Hook pattern proven; E27-A1 still open |
| **Knowledge Transfer** | A | 10% | Pattern documented in code; ready for Epic 29 |

### **Overall Grade: A**

### Verdict Summary

Epic 28 delivered excellent results following the established API Detachment pattern. Transaction-safe hook injection preserved atomicity. Permission scoping was verified early. 971 LOC of API-local code eliminated.

**Positive:**
- 100% story completion
- 971 LOC eliminated
- Zero behavior regression
- Transaction atomicity preserved
- Hook pattern proven for future extractions

**Needs Attention:**
- E27-A1 (parity methodology documentation) still open
- Sequential dependencies extended timeline

---

## Participant Closing Thoughts

> **Bob:** "Epic 28 shows the API Detachment pattern is now standardized. The team knows how to do this."

> **Alice:** "The transaction-safe hook is a reusable pattern. We'll use it again for fixed assets."

> **Charlie:** "Permission scoping caught early was good. Better to fix in 28.1 than during 28.4 route flip."

> **Dana:** "Payment idempotency is critical. The parity checks preserved semantics exactly."

> **Elena:** "Sequential dependencies made sense here. Each story built on the previous."

> **Ahmad:** [Project Lead - Epic 28 completes another major extraction. Pattern is proven.]

---

## Links & References

- Epic 28 epic plan: `_bmad-output/implementation-artifacts/stories/epic-28/epic-28.md`
- Sprint Plan: `_bmad-output/planning-artifacts/epic-28-sprint-plan.md`
- Epic 27 retrospective: `_bmad-output/implementation-artifacts/stories/epic-27/epic-27.retrospective.md`
- Epic 29 plan: `_bmad-output/planning-artifacts/epic-29-sprint-plan.md`
- Sprint Status: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Action Items: `_bmad-output/implementation-artifacts/action-items.md`

---

## Story Summary

| Story | Title | Risk | Status | Key Notes |
|-------|-------|------|--------|-----------|
| 28.1 | Contract & permission alignment | MEDIUM | ✅ Done | PaymentService exported, permissions fixed |
| 28.2 | Payment service parity hardening | HIGH | ✅ Done | Split/shortfall/overpayment matched |
| 28.3 | Payment posting hook (transaction-safe) | HIGH | ✅ Done | Hook injected, atomicity preserved |
| 28.4 | API route flip + library cleanup | MEDIUM | ✅ Done | payment-service.ts deleted (763 LOC) |
| 28.5 | Full validation gate | P1 | ✅ Done | All packages validated |

---

*Document generated via Party Mode Retrospective on 2026-04-04*  
*Facilitated by: Bob (Scrum Master)*  
*Participants: Bob, Alice, Charlie, Dana, Elena, Ahmad*  
*Grade: A*
