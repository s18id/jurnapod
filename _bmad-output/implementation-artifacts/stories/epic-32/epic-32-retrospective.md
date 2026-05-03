# Epic 32 Retrospective

**Date:** 2026-04-05
**Epic:** Financial Period Close & Reconciliation Workspace
**Status:** ✅ Complete (8/8 stories)
**Commits:** `b9305ca` → `dc05502` (7 commits)

---

## Participants

| Agent | Role | Focus Area |
|-------|------|------------|
| Bob | Scrum Master | Process, administration, sprint tracking |
| Amelia | Developer | Implementation experience, code quality |
| Winston | Architect | Architecture decisions, boundary violations |
| Reviewer | Code Reviewer | Quality gates, findings, gotchas |

---

## What Went Well

1. **Full sprint delivery** — All 8 stories completed (32.0, 32.1, 32.2, 32.3, 32.4, 32.6, 32.7, 32.8) in a single sprint, per epic-32.md story table and coordination file.

2. **ADR-0014 compliance achieved** — Fiscal-year domain successfully extracted from `apps/api/src/lib/fiscal-years.ts` (1317 lines) to `packages/modules/accounting/src/fiscal-year/`. Boundary is now clean. All 4 services (ReconciliationDashboard, TrialBalance, PeriodTransitionAudit, FiscalYear) moved to proper packages per epic-32-service-migration.md.

3. **Parallel development without conflicts** — Coordination file (epic-32-coordination.md) shows Dev 1/2/3 worked simultaneously on different files with no file conflicts anticipated or experienced.

4. **Roll-forward workspace hit all acceptance criteria** — Story 32.5 completion report shows all 10 ACs implemented, 8 integration tests passing, typecheck and build clean.

5. **Epic 30 observability integration worked as designed** — Story 32.2 completion confirms `gl_imbalance_detected_total` metric visible in reconciliation dashboard. Story 32.3 wired GL imbalance check into pre-close validation.

6. **Idempotency fix delivered cleanly** — P0-001 (`executeCloseWithLocking` returning wrong `closeRequestId`) fixed in same commit (`dc05502`) as the ADR-0014 extraction.

---

## What Could Have Gone Better

1. **P0 idempotency blocker discovered late** — `executeCloseWithLocking` returned `context.requestedAtEpochMs.toString()` as `closeRequestId` instead of caller-provided ID, breaking idempotency for retry scenarios. Caught by bmad-review, fixed in `dc05502`. Per epic-32-coordination.md P0-001, this should have been caught earlier via contract tests.

2. **ADR-0014 boundary violation should have been caught during story scoping** — A 1317-line domain module sitting in `apps/api/src/lib/` is a clear architectural violation. Per epic-32.md: "This should have been flagged during story breakdown, not after." Extracted post-story in `dc05502`.

3. **6 error classes missing machine-readable codes** — Per epic-32-coordination.md P1-001 and epic-32-p2-fixes.md: `FiscalYearCodeExistsError`, `FiscalYearDateRangeError`, `FiscalYearOverlapError`, `FiscalYearOpenConflictError`, `FiscalYearNotOpenError`, `FiscalYearSelectionError` all lacked `code` properties. Fixed in `dc05502`.

4. **Adapter singleton risk required post-story refactoring** — Per epic-32-coordination.md P1-002: Lazy singleton `_serviceInstance` in API adapter could bind to stale `getDb()` context. Fixed by replacing with per-call `createFiscalYearService()` factory in `dc05502`.

5. **Post-implementation extraction added unnecessary churn** — Moving `fiscal-years.ts` after stories 32.1–32.5 were "done" created extra work. Per epic-32.md: "Moving `fiscal-years.ts` after stories were done created unnecessary churn."

6. **Multiple P1 bugs found post-implementation** — Per epic-32-p2-fixes.md and epic-32.md post-implementation fixes table:
   - Math.abs() bug in net income closing entries (`8c2e1cc`)
   - Audit trail chicken-and-egg: `checkAuditTrail` returned "passed" for IN_PROGRESS with no audit (`8c2e1cc`)
   - Idempotency race condition: `closeFiscalYearWithTransaction` read-then-write in separate transactions (`8c2e1cc`)
   - GL imbalance tenant scoping: `checkGlImbalanceByBatchId` missing `companyId` filter (`8c2e1cc`)

---

## Risks Discovered

| Risk | Severity | Description | Status |
|------|----------|-------------|--------|
| Idempotency failures | P0 | `executeCloseWithLocking` returned timestamp instead of caller ID | Fixed in `dc05502` — always return caller's ID |
| State leakage | P1 | Singleton adapter holds state across requests | Fixed in `dc05502` — per-call factory pattern |
| Error handling gaps | P1 | Missing machine-readable codes prevent automated recovery | Fixed in `dc05502` — all error classes now have codes |
| Boundary drift | P2 | Domain logic accumulating in API layer | Fixed in `dc05502` — extracted to modules-accounting |
| Net income sign bug | P1 | Math.abs() in closing entries | Fixed in `8c2e1cc` |
| Audit trail race | P1 | IN_PROGRESS with no audit reported passed | Fixed in `8c2e1cc` |
| Idempotency race | P1 | Read-then-write in separate transactions | Fixed in `8c2e1cc` |
| Tenant scope gap | P1 | Missing companyId in GL imbalance check | Fixed in `8c2e1cc` |

---

## Key Findings

### Post-Implementation Fixes (Documented in epic-32-p2-fixes.md)

| Fix | Severity | Description | Commit |
|-----|----------|-------------|--------|
| closeRequestId return value | P0 | `executeCloseWithLocking` returned timestamp instead of caller ID | `dc05502` |
| Error code consistency | P1 | Added machine-readable codes to 6 fiscal-year error classes | `dc05502` |
| Adapter singleton risk | P1 | Replaced lazy singleton with per-call factory in API adapter | `dc05502` |
| Fiscal-year extraction | ADR-0014 | Domain logic moved from API lib to modules-accounting | `dc05502` |
| Net income calculation | P1 | Math.abs() bug in closing entries | `8c2e1cc` |
| Audit trail chicken-and-egg | P1 | `checkAuditTrail` returned "passed" for IN_PROGRESS with no audit | `8c2e1cc` |
| Idempotency race condition | P1 | `closeFiscalYearWithTransaction` read-then-write in separate transactions | `8c2e1cc` |
| GL imbalance tenant scoping | P1 | `checkGlImbalanceByBatchId` missing `companyId` filter | `8c2e1cc` |

---

## Recommendations for Next Epic (Epic 35 or 36)

### Process Improvements

1. **Package-First Design Mandate**
   - Any file over 500 lines in `apps/api/src/lib/` requires written justification
   - Architectural sign-off required before story kickoff
   - Enforcement: CI import-boundary lint (no `packages/** -> apps/api/**`)

2. **Idempotency Contract Testing**
   - For idempotency-critical paths (fiscal close, payments, inventory), require explicit unit tests for:
     - Return value contracts
     - Retry behavior
     - Duplicate request handling

3. **Error Code Standards**
   - Add machine-readable error codes to Definition of Done
   - CI check: All error classes must have `code` property
   - Document error code taxonomy in `packages/shared`

### Technical Debt Priority

| Item | Priority | Owner | Timeline |
|------|----------|-------|----------|
| Audit existing error classes for missing codes | P1 | Amelia | Before Epic 35 |
| Add import-boundary lint to CI | P2 | Winston | Before Epic 35 |
| Document idempotency testing patterns | P2 | Reviewer | Before Epic 35 |

### Architecture Reminders

- **Boundary Vigilance**: ADR-0014 compliance is non-negotiable. Domain logic belongs in `packages/modules/**`, not `apps/api/src/lib/`.
- **Adapter Patterns**: Prefer per-call factories over singletons for stateful adapters. Singletons leak state and create race conditions.
- **Return Value Contracts**: Always return caller-provided identifiers in idempotent operations, never generated values.

---

## Action Items

| # | Action | Owner | Deadline | Success Criteria | Status |
|---|--------|-------|----------|------------------|--------|
| 1 | Add package-first design checkpoint to sprint planning template | Bob | 2026-04-08 | Template updated, team trained | (TBD — no evidence of completion in artifacts) |
| 2 | Implement CI lint for import boundaries (packages → apps) | Winston | 2026-04-12 | CI fails on violation | (TBD — no evidence of completion in artifacts) |
| 3 | Create error code taxonomy document | Amelia | 2026-04-10 | Doc in `packages/shared/docs/errors.md` | (TBD — no evidence of completion in artifacts) |
| 4 | Audit all fiscal-year error classes for consistency | Amelia | 2026-04-09 | All classes have machine-readable codes | (TBD — no evidence of completion in artifacts) |
| 5 | Add idempotency contract testing guidelines | Reviewer | 2026-04-11 | Guidelines in testing playbook | (TBD — no evidence of completion in artifacts) |

---

## Deferred Items

The following items were identified but not actioned during Epic 32:

| Item | Rationale | Owner |
|------|-----------|-------|
| Floating-point epsilon comparison for monetary values (`> 0.001`) | P2 — tracked for future decimal precision hardening (epic-32-p2-fixes.md P2-001) | Amelia |
| Sign convention documentation in closing entries | P2 — balance sign convention assumed consistent with AGENTS.md debit-positive rule (epic-32-p2-fixes.md P2-002) | Amelia |

---

## Team Insights

**Bob (Scrum Master):** *"We delivered on velocity but paid a tax on quality gates. The P0 bug and boundary violation tell me we need tighter architectural review during story breakdown, not after."*

**Amelia (Developer):** *"Working with a 1300-line file in the wrong place was painful. Extraction is necessary but doing it post-story adds overhead. Let's catch this at design time."*

**Winston (Architect):** *"ADR-0014 exists for a reason. When domain logic accumulates in the API layer, we get singleton risks, testability problems, and coupling. The extraction was correct but late."*

**Reviewer:** *"Six error classes without codes is a pattern, not a one-off. We need automated enforcement. The P0 idempotency bug was a close call—it should have been caught in review or by contract tests."*

---

## Significant Discoveries

⚠️ **Epic Update Required**: No significant architectural discoveries requiring Epic 35/36 plan changes. The boundary violation was resolved; no new dependencies or constraints identified.

---

## Next Steps

1. **Execute action items** — 5 items across 4 owners, all due before Epic 35 kickoff
2. **Update sprint planning template** — Add package-first checkpoint
3. **Schedule Epic 35 planning** — Ensure architectural review is first agenda item
4. **Follow up in next standup** — Review action item progress

---

*Retrospective completed. Document archived at `_bmad-output/implementation-artifacts/stories/epic-32/epic-32.retrospective.md`*