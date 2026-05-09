# Story 59.6: Auditability & Epic Gate Automation

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-6 --status done --title auditability-epic-gate-automation`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **story owner and reviewer**,  
I want **machine-verifiable close-gate evidence for Epic 59**,  
So that **close/no-close decisions are objective and block unresolved P0/P1 risk**.

## Context

- Source: Epic 59
- Depends on: Stories 59.1–59.5
- Scope: gate automation, audit evidence, and close criteria reporting

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist
- [x] Happy paths identified
- [x] Error paths identified
- [x] Edge cases identified
- [x] Fixture needs identified
- [x] Integration-test coverage planned

### Review Outcome

| Scenario | Type | Coverage Plan |
|---|---|---|
| All gates pass => script exit 0 | Happy | Integration/Script |
| Any gate fails => script exit non-zero with diagnostics | Error | Integration/Script |
| Audit evidence includes success+tenant context | Happy | Integration |

**Sign-off:** Scenario set approved before implementation.

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

- [x] Verify `instanceof` handling for listed producer errors.
- [x] Verify `error.name` fallback handling for the same errors.
- [x] Verify gate/audit failure response mapping is deterministic across both detection paths.

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|---|---|---|---|---|
| `APExceptionError` | `apps/api/lib/accounting/ap-exceptions` | `apps/api` | Yes | Yes |
| `PeriodCloseError` | `apps/api/lib/accounting/ap-period-close-guardrail` | `apps/api` | Yes | No |
| `FiscalYearClosedError` | `@jurnapod/modules-accounting` | `apps/api` | Yes | No |

## Acceptance Criteria

**AC1: Close gate script behavior**  
**Given** Epic 59 validation execution,  
**When** all gate conditions pass,  
**Then** gate script MUST exit 0 and emit machine-readable gate lines.

**AC2: Failure diagnostics**  
**Given** at least one failed gate condition,  
**When** gate script completes,  
**Then** it MUST exit non-zero and report failing condition(s) clearly.

**AC3: Audit evidence contract**  
**Given** critical operation logs,  
**When** evidence is generated,  
**Then** audit filtering MUST use `success` semantics and include tenant context.

**AC4: E58-A2 closure evidence contract**  
**Given** Option A is selected for E58-A2,  
**When** Epic 59 gate evidence is generated,  
**Then** the output MUST include deadlock-mitigation verification status and references to Story 59.3 completion evidence.

## Tasks / Subtasks

- [x] Create/update Epic 59 gate validation script
- [x] Add parsing assertions for gate output format
- [x] Add audit evidence validation checks
- [x] Add E58-A2 Option A verification signal to gate output contract
- [x] Link gate report to Story 59.3 concurrency evidence
- [x] Define fail condition if mitigation evidence is missing

## Files to Modify

| File | Action | Description |
|---|---|---|
| scripts/validate-epic-59-gates.ts | Create/Modify | Emit and validate close-gate evidence |
| apps/api integration tests (audit/gate support) | Modify/Create | Verify AC1–AC3 evidence paths |
| _bmad-output/planning-artifacts/epic-59-concurrent-posting-deadlock-decision-note.md | Reference | Option A decision source for E58-A2 evidence linkage |

## E58-A2 Gate Output Contract (MANDATORY)

Story 59.6 MUST emit an explicit E58-A2 verification signal in gate output.

Minimum required machine-readable line:

```text
__EPIC59_GATE__ {"version":1,"gate":"E58_A2_OPTION_A","decision":"OPTION_A","story_59_3_evidence_present":true,"pass":true}
```

Gate behavior requirements:

- If `story_59_3_evidence_present` is false, gate output MUST set `pass:false` for `E58_A2_OPTION_A`.
- Epic 59 close gate MUST NOT pass when E58-A2 decision is Option A and this signal is missing or failing.

## Risk Level

P2 — automation quality risk; does not change business logic directly.

_Last Updated: 2026-05-08_
