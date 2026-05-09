# Story 59.7: POS VOID/REFUND Reversal Journal Linkage Correctness

**Status:** review (implementation complete; awaiting reviewer GO + story owner sign-off)

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-7 --status done --title pos-void-refund-reversal-journal-linkage-correctness`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As an **accountant and auditor**,  
I want **POS VOID/REFUND correction flows to produce linked, balanced reversal journals without mutating the original finalized effect**,  
So that **financial reversals are correct, immutable, and audit-traceable**.

## Context

- Source: Epic 59
- Dependency source: Story 59.1 AC4 deferred handoff
- Scope: POS correction reversal posting + linkage evidence only
- Non-goal: no net-new POS feature scope outside reversal correctness

## Dependency Note (from Story 59.1)

- Story 59.1 closed AC2/AC3 in `@jurnapod/pos-sync` finalized immutability/correction guard path.
- AC4 was deferred because current correction path allows `VOID`/`REFUND` but does not produce reversal-journal linkage evidence in the same path.

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist
- [ ] Happy paths identified
- [ ] Error paths identified
- [ ] Edge cases identified
- [ ] Fixture needs identified
- [ ] Integration-test coverage planned

### Review Outcome

| Scenario | Type | Coverage Plan |
|---|---|---|
| FINALIZED sale corrected via VOID creates reversal journal batch | Happy | Integration |
| FINALIZED sale corrected via REFUND creates reversal journal batch | Happy | Integration |
| Original completed journal remains unchanged after correction | Error/Integrity | Integration |
| Reversal batch remains balanced (debit == credit) | Integrity | Integration |
| Reversal journal links to original finalized sale/journal reference | Integrity | Integration |

**Sign-off:** Scenario set approved before implementation.

## Acceptance Criteria

**AC1: Reversal posting on VOID/REFUND correction**  
**Given** a finalized POS transaction with posted financial effect,  
**When** correction is submitted as `VOID` or `REFUND`,  
**Then** the system MUST create reversal journal effects through canonical posting flow.

**AC2: Original finalized journal immutability**  
**Given** an original finalized POS journal effect,  
**When** VOID/REFUND correction is executed,  
**Then** original journal rows MUST remain unchanged and correction MUST be represented as additive reversal entries.

**AC3: Balanced reversal integrity**  
**Given** a reversal posting generated from VOID/REFUND,  
**When** journal lines are inspected,  
**Then** reversal debits and credits MUST balance exactly.

**AC4: Reversal linkage for audit traceability**  
**Given** an original finalized POS effect and its correction reversal,  
**When** audit references are queried,  
**Then** reversal journal batch MUST be linkable to the original transaction/journal reference using deterministic identifiers.

**AC5: Integration evidence closure**  
**Given** AC1–AC4 implementation,  
**When** integration tests are executed with real DB,  
**Then** evidence MUST include assertions for (a) correction success, (b) original immutability, (c) reversal balance, and (d) reversal linkage.

## Tasks / Subtasks

- [ ] Implement POS VOID/REFUND reversal posting path via canonical posting flow
- [ ] Add linkage metadata/assertable reference path between original and reversal entries
- [ ] Add integration tests for VOID/REFUND reversal balance and immutability
- [ ] Add integration tests for deterministic reversal linkage evidence
- [ ] Document AC evidence in `story-59.7.completion.md`

## Files to Modify (expected)

| File | Action | Description |
|---|---|---|
| `packages/pos-sync/src/push/index.ts` | Modify | Route VOID/REFUND correction flow to reversal posting hook path |
| `packages/modules/accounting/src/posting/*` | Modify/Create | Add canonical POS reversal posting/linkage implementation |
| `packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts` | Modify | Add AC5-required integration assertions |

## Dependency & Handoff Links

- Upstream story: `_bmad-output/implementation-artifacts/stories/epic-59/story-59.1.md`
- Upstream completion prep: `_bmad-output/implementation-artifacts/stories/epic-59/story-59.1.completion.md`

## Risk Level

P0 — financial reversal integrity and audit linkage are correctness-critical.

_Last Updated: 2026-05-09_
