# Epic 35 Retrospective: Route Library Extraction + Kysely Compliance

**Date:** 2026-04-09  
**Participants:** Winston (Architect), Amelia (Dev), Quinn (QA), Mary (Analyst), Bob (Scrum Master)  
**Epic Goal:** Extract all route business logic to domain packages, replacing raw SQL with Kysely query builder calls. Resolve 27 lint violations across 12 route files.

---

## ✅ Epic Completion Summary

| Field | Value |
|-------|-------|
| **Epic Status** | DONE |
| **Completion Date** | 2026-04-08 |
| **Total Stories** | 6 (35.1 through 35.6) |
| **Routes Processed** | 12 files |
| **Lint Violations Resolved** | 27 violations → 0 errors |
| **Validation** | Commit evidence + repository static checks verified; lint rerun captured on 2026-04-09 (0 errors, 62 warnings); build rerun captured on 2026-04-09 (`npm run build -w @jurnapod/api` passed); typecheck log not separately captured |

### Stories Completed

| Story | Description | Status |
|-------|-------------|--------|
| 35.1 | Extract accounts.ts to modules-accounting | ✅ DONE |
| 35.2 | Extract companies.ts, outlets.ts, admin-runbook.ts to modules-platform | ✅ DONE |
| 35.3 | Extract admin-dashboards/*, audit.ts, reports.ts to modules-reporting | ✅ DONE |
| 35.4 | Extract cash-bank-transactions.ts to modules-treasury | ✅ DONE |
| 35.5 | Extract sales/invoices.ts, orders.ts, payments.ts to modules-sales | ✅ DONE |
| 35.6 | Final lint validation | ✅ DONE |

---

## 📊 Executive Summary

**Epic 35 successfully completed** - All 27 lint violations across 12 route files were resolved through systematic library extraction in commit `67e2ec1e7d04965b56ee0d43789215f60fff8a0f` (`25 files changed, 1105 insertions, 174 deletions`).

**Key outcome:** Routes now delegate to domain packages following ADR-0012 (Library-First Architecture) and ADR-0009 (Kysely Query Builder).

---

## Start / Stop / Continue

### ✅ START
- Running lint gate (`npm run lint -w @jurnapod/api`) before marking stories complete
- Cross-cutting concerns checklist in every story template
- Route complexity factor in estimates (service dependencies, not just line count)
- Evidence-based status updates (AC verification required for "done")

### 🛑 STOP
- Underestimating extraction complexity based on line counts alone
- Marking stories done without all ACs verified

### 🔄 CONTINUE
- ADR-0012/ADR-0009 compliance pattern (proven in Epic 32, reused here)
- Kysely query builder adoption for new/migrated queries
- Tenant isolation enforcement in all extracted services
- Adapter shim cleanup immediately after route migration
- Sequential package-by-package extraction workflow

---

## Four Agile Questions

### 1. What did we do well?

**Winston (Architecture):**  
The extraction pattern established in Epic 32's ADR-0014 held up consistently across all 6 packages. Library interfaces were well-defined, route-to-package boundaries were clear, and ADR compliance was maintained throughout. 27 violations across 12 routes processed without architectural drift.

**Amelia (Implementation):**  
The extraction mechanics work as designed. `getDb()` calls centralized to packages, service instantiations moved to factories in domain packages. 12 route files processed with consistent patterns. Kysely adoption in migrated services remained consistent.

**Quinn (Quality):**  
Testing approach solid. AC verification via grep patterns reliably caught violations: `grep -n "getDb\|pool.execute" <route-file>` as success signal. We now have post-commit reruns: lint (`npm run lint -w @jurnapod/api`) showing 0 errors and 62 warnings, and build (`npm run build -w @jurnapod/api`) passing; typecheck was not run separately in this validation pass.

### 2. What could we have done better?

**Mary (Pattern Recognition):**  
Status tracking during implementation - initial retrospective captured status drift risk (stories marked "done" without verification). The corrective action (evidence-based status updates) was implemented and Epic 35 completed successfully.

**Bob (Process):**  
Complexity estimation for cross-domain routes (like fiscal year close) could have been flagged earlier. However, the sequential approach (story by story, package by package) allowed course correction without major impact.

### 3. What have we learned?

| Learning | Implication |
|----------|-------------|
| Extraction pattern is reusable | Epic 32 pattern → Epic 35 execution without major adaptation |
| ADR compliance is systematic | 27 violations resolved via lint-first approach |
| Sequential processing works | Package-by-package extraction maintained clean boundaries |
| Adapter seam policy must be explicit | Some adapter seams were retained intentionally (`fiscal-years.ts`, `companies.ts`, `admin-dashboards.ts`, `audit.ts`, `treasury-adapter.ts`) |

### 4. What still puzzles us?

- **Coordination overhead:** With 12 route files across 6 packages, sequencing was correct but could be optimized for parallel execution in future
- **Complexity classification:** More precise upfront complexity assessment would improve estimates
- **Automated violation detection:** Could we detect these violations at PR stage automatically?

---

## Action Items (for Future Epics)

### Process Improvements

| # | Action | Owner | Notes |
|---|--------|-------|-------|
| 1 | Evidence-based status updates | All | "Done" = all ACs verified, not started |
| 2 | Pre-completion lint gate | All | Run before marking stories done |
| 3 | Story template with cross-cutting checklist | Mary | Kysely, tenant isolation, adapter cleanup |
| 4 | Route complexity classification | Winston | Simple/Medium/Complex upfront |

### Technical Improvements

| # | Action | Owner | Notes |
|---|--------|-------|-------|
| 5 | Automated ADR violation detection in CI | Quinn | Pre-merge gate for ADR-0012 |
| 6 | Kysely migration playbook by route archetype | Winston | Pattern A/B/C for read-only/transactional/batch |

---

## Route Violation Breakdown (Final)

| Route | Package | Violations | Final Status |
|-------|---------|------------|--------------|
| `accounts.ts` | `@jurnapod/modules-accounting` | 2 | ✅ Resolved |
| `companies.ts` | `@jurnapod/modules-platform` | 1 | ✅ Resolved |
| `outlets.ts` | `@jurnapod/modules-platform` | 1 | ✅ Resolved |
| `admin-runbook.ts` | `@jurnapod/modules-platform` | 1 | ✅ Resolved |
| `admin-dashboards/reconciliation.ts` | `@jurnapod/modules-reporting` | 2 | ✅ Resolved |
| `admin-dashboards/trial-balance.ts` | `@jurnapod/modules-reporting` | 4 | ✅ Resolved |
| `audit.ts` | `@jurnapod/modules-reporting` | 5 | ✅ Resolved |
| `cash-bank-transactions.ts` | `@jurnapod/modules-treasury` | 4 | ✅ Resolved |
| `reports.ts` | `@jurnapod/modules-reporting` | 1 | ✅ Resolved |
| `sales/invoices.ts` | `@jurnapod/modules-sales` | 3 | ✅ Resolved |
| `sales/orders.ts` | `@jurnapod/modules-sales` | 3 | ✅ Resolved |
| `sales/payments.ts` | `@jurnapod/modules-sales` | 2 | ✅ Resolved |

**Total: 12 files, 27 violations → 0 errors**

---

## Cross-Cutting Concerns (Verified)

All stories completed with these concerns addressed:

1. ✅ **Kysely Query Builder** - All extracted queries use Kysely's typed query builder
2. ✅ **Raw SQL Preservation** - Complex GL aggregations preserved per ADR-0009
3. ✅ **Tenant Isolation** - All queries enforce `company_id` scoping
4. ✅ **Adapter Boundary Handling** - Route-facing adapter seams retained where used by routes (`apps/api/src/lib/fiscal-years.ts`, `companies.ts`, `admin-dashboards.ts`, `audit.ts`, `treasury-adapter.ts`)
5. ✅ **Lint Gate Integration** - Violations cleared by implementation commit; command output logs were not captured in commit artifacts

---

## Validation Results (Story 35.6)

| Check | Result |
|-------|--------|
| `npm run lint -w @jurnapod/api` | ✅ Captured on 2026-04-09: 0 errors, 62 warnings |
| `npm run typecheck -w @jurnapod/api` | ⚠️ Not captured in commit log artifacts |
| `npm run build -w @jurnapod/api` | ✅ Captured on 2026-04-09: pass (`tsc --noEmit`) |
| Sprint tracking updated | ✅ `sprint-status.yaml` shows `epic-35: done` and stories `35.1`–`35.6` done |
| Epic index updated | ✅ `epics.md` lists Epic 35 under completed epics |
| Route static checks | ✅ No route-level `getDb(` / `pool.execute` / `db.execute` matches in `apps/api/src/routes/*.ts` |

---

## Retrospective Facilitator Notes

**Bob:** Epic 35 completed successfully with concrete commit evidence and repository static verification. Post-commit reruns confirm no blocking lint errors (0 errors, 62 warnings) and build pass (`npm run build -w @jurnapod/api`). The extraction pattern is proven and reusable. Key lesson: systematic lint-first approach works for ADR compliance migrations, and validation logs must be preserved as explicit build artifacts.

The initial retrospective session (during implementation) caught a status drift risk that was corrected before completion. This validates the evidence-based status update practice.

**Recommendation:** Use Epic 35 as template for future library extraction epics. Pattern is sound, estimates are realistic, validation is clear.

---

*Retrospective conducted in Party Mode with Winston 🏗️, Amelia 💻, Quinn 🧪, Mary 📊, and Bob 🏃*
