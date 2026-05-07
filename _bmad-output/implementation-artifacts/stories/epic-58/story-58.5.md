# Story 58.5: Gate Validation Automation & Evidence Scripts

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 58 --story 58-5 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

---

## Story

As a **release engineer**,  
I want **automated, machine-verifiable gate evidence that proves all exit criteria are met**,  
So that **Sprint 58 can close with confidence and without manual gate validation**.

---

## Context

**Source:** Epic 58 kickoff; Sprint 58 baseline

**Background:** Stories 58.1–58.4 implement the inventory/costing correctness proofs. Story 58.5 implements the gate validation script that automates evidence collection for Sprint 58 exit. The script is a prerequisite for sprint close.

**Key facts:**
- Three exit gates: Gate 1 (inventory↔GL reconciliation ≤$0.01), Gate 2 (COGS reconciliation ≤$0.01), Gate 3 (sprint health: no P0/P1, 3× consecutive green critical suites)
- Test suites emit `__EPIC58_GATE__` JSON lines to stdout
- Gate script parses output, recomputes pass/fail from numeric values
- Script must exit 0 only when all gates pass

**Predecessor:** Stories 58.1, 58.2, 58.3, 58.4 complete

**Scope note:** Story 58.5 implements only `scripts/validate-epic-58-gates.ts`. Defining the npm test scripts (`test:unit:costing`, `test:integration:inventory`, etc.) is an Epic 58 startup prerequisite (Precondition #5) — see epic-58.md.

**Required function:** `getAllItemsCostSummary(companyId: number, db: Kysely): Promise<AggregatedCostSummary>` MUST be added to `@jurnapod/modules-inventory-costing` to support NFR2 cross-module comparison. This function is a prerequisite for NFR2 evidence.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:**
  1. All gates pass: script exits 0, summary to stdout
  2. Gate 1 variance ≤ threshold: recomputed pass/fail from numeric values
  3. Gate 2 variance ≤ threshold: recomputed pass/fail from numeric values
  4. NFR2 cross_module_diff = 0: exactly zero required
  5. Gate 3 sprint health: p0_count=0, p1_count=0, critical_suites_green=true
- [ ] **Error paths identified:**
  1. Gate 1 variance > threshold: exit 1, diagnostic to stderr
  2. Gate 2 variance > threshold: exit 1, diagnostic to stderr
  3. NFR2 cross_module_diff ≠ 0: exit 1, diagnostic to stderr
  4. Gate 3 unresolved P0/P1: exit 1, diagnostic to stderr
  5. Gate 3 critical suites not green: exit 1, diagnostic to stderr
  6. Unknown/malformed version: exit 1 with diagnostic
- [ ] **Edge cases identified:**
  1. Version mismatch: `version` field doesn't match expected value
  2. Missing `__EPIC58_GATE__` lines: exit 1 with diagnostic
  3. Numeric precision: use string representation for variance to avoid floating-point comparison issues
- [ ] **Test fixture needs identified:** None (script testing uses existing test suites)
- [ ] **Integration test scope:** Script integration tests with mocked test suite output

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| All gates pass: exit 0 | Happy | Integration |
| Gate 1 fail: exit 1, stderr diagnostic | Error | Integration |
| Gate 2 fail: exit 1, stderr diagnostic | Error | Integration |
| NFR2 diff ≠ 0: exit 1, stderr diagnostic | Error | Integration |
| Gate 3 P0/P1 unresolved: exit 1 | Error | Integration |
| Gate 3 suites not green: exit 1 | Error | Integration |
| Version mismatch: exit 1 | Error | Integration |
| Missing gate lines: exit 1 | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Acceptance Criteria

**AC1: Script runs critical test suites**
**Given** `scripts/validate-epic-58-gates.ts` is executed,
**When** it runs,
**Then** the script MUST run all three critical test suites and parse their `__EPIC58_GATE__` output lines:
  - `test:unit:costing`
  - `test:integration:inventory`
  - `test:integration:inventory:posting`

**AC2: Gate 1 variance recomputed**
**Given** the gate script parses a `__EPIC58_GATE__` line for Gate 1,
**When** it evaluates the variance,
**Then** it MUST recompute pass/fail from numeric values (`variance ≤ threshold`) — the `pass` field is informational only.

**AC3: Gate 2 variance recomputed**
**Given** the gate script parses a `__EPIC58_GATE__` line for Gate 2,
**When** it evaluates the COGS variance,
**Then** it MUST recompute pass/fail from numeric values (`variance ≤ threshold`).

**AC4: NFR2 cross-module diff exactly zero**
**Given** the gate script parses a `__EPIC58_GATE__` line for NFR2 (cross-module),
**When** it evaluates `cross_module_diff`,
**Then** it MUST require `cross_module_diff` to be exactly zero.

**AC5: Gate 3 sprint health recomputed**
**Given** the gate script parses a `__EPIC58_GATE__` line for Gate 3 (sprint health),
**When** it evaluates `p0_count`, `p1_count`, and `critical_suites_green`,
**Then** it MUST compute `pass` as `p0_count == 0 && p1_count == 0 && critical_suites_green == true`.

**AC6: Failure exits with diagnostic**
**Given** any gate fails,
**When** the script runs,
**Then** it MUST exit with code 1 and emit diagnostic output to stderr listing which gate failed and by how much.

**AC7: Success exits 0**
**Given** all gates pass,
**When** the script runs,
**Then** it MUST exit with code 0 and emit a summary line to stdout.

**AC8: CI integration**
**Given** the script is integrated into CI,
**When** a sprint tries to close without the script passing,
**Then** the CI job MUST fail and the sprint MUST NOT close.
**CI step:** Add `npx tsx scripts/validate-epic-58-gates.ts` as a required job in the sprint-close pipeline. The job MUST exit 0 for the sprint to close. Example GitHub Actions configuration fragment:
```yaml
name: epic-58-gate
on:
  push:
    branches: [main]
jobs:
  validate-epic-58-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx tsx scripts/validate-epic-58-gates.ts
```
**Command:** `npx tsx scripts/validate-epic-58-gates.ts` — the canonical command for CI gate validation. The sprint-close gate MUST invoke this command and require exit 0.

---

## Test Coverage Criteria

- [ ] Coverage target: all gate paths + error paths
- [ ] Happy paths to test:
  - [ ] All gates pass: exit 0
  - [ ] Summary line emitted to stdout
- [ ] Error paths to test:
  - [ ] Gate 1 fail: exit 1, stderr contains "GATE1" and variance
  - [ ] Gate 2 fail: exit 1, stderr contains "GATE2" and variance
  - [ ] NFR2 fail: exit 1, stderr contains "NFR2" and diff value
  - [ ] Gate 3 P0/P1: exit 1, stderr contains P0/P1 count
  - [ ] Gate 3 suites not green: exit 1, stderr contains suite names
  - [ ] Version mismatch: exit 1, stderr contains version diagnostic
  - [ ] Missing gate line: exit 1, stderr contains missing gate name

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified: `__EPIC58_GATE__` JSON output format
- [ ] Existing canonical fixtures reviewed: N/A (script testing)
- [ ] Fixture location: N/A

### Fixture Creation/Update
- [ ] **New fixtures needed:** None
- [ ] **Test setup method:** Mock test suite output with `__EPIC58_GATE__` lines

---

## Tasks / Subtasks

- [ ] Add `getAllItemsCostSummary(companyId, db)` to `@jurnapod/modules-inventory-costing`
- [ ] Implement `scripts/validate-epic-58-gates.ts` with:
  - [ ] Test suite runner (spawn child processes for three suites)
  - [ ] `__EPIC58_GATE__` line parser (regex: `__EPIC58_GATE__ \{.*"gate":".*".*\}`)
  - [ ] Numeric recomputation for each gate
  - [ ] Version validation (expected: version 1)
  - [ ] Exit code logic (0 = all pass, 1 = any fail)
  - [ ] Diagnostic output to stderr on failure
  - [ ] Summary output to stdout on success
- [ ] Implement `__EPIC58_GATE__` output in `test:unit:costing` suite
- [ ] Implement `__EPIC58_GATE__` output in `test:integration:inventory` suite
- [ ] Implement `__EPIC58_GATE__` output in `test:integration:inventory:posting` suite
- [ ] Write integration tests for gate script
- [ ] Verify script exits 0 when all gates pass
- [ ] Verify script exits 1 with diagnostic when any gate fails
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `scripts/validate-epic-58-gates.ts` | Gate validation script for Epic 58 exit |
| `apps/api/__test__/integration/scripts/gate-validation-script.test.ts` | Integration tests for gate script |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/inventory-costing/src/index.ts` | Modify | Add `getAllItemsCostSummary(companyId, db)` function |
| `packages/modules/inventory-costing/src/index.ts` | Modify | Export `getAllItemsCostSummary` |
| `packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts` | Modify | Add `__EPIC58_GATE__` output lines |
| `apps/api/__test__/integration/inventory/inventory-gl-reconciliation.test.ts` | Modify | Add `__EPIC58_GATE__` output lines for NFR2 |
| `apps/api/__test__/integration/inventory/inventory-posting.test.ts` | Create | Add `__EPIC58_GATE__` output lines for inventory posting suite |

---

## Estimated Effort

2 days (gate script + NFR2 function + `__EPIC58_GATE__` output in test suites)

## Risk Level

Medium (P2 — automation only; correctness proven in Stories 58.1–58.4)

---

## Dev Notes

- **Script location:** `scripts/validate-epic-58-gates.ts` (not in `packages/`)
- **Test suite execution:** Use `spawn` or `execFile` to run npm test scripts, capture stdout
- **`__EPIC58_GATE__` regex:** `__EPIC58_GATE__ \{.*"gate":".*".*\}`
- **Version field:** Expected `version: 1`. If unknown, malformed, or mismatched, exit 1 with diagnostic.
- **Numeric recomputation:** Parse `variance`, `threshold`, `cross_module_diff`, `p0_count`, `p1_count` as numbers from JSON. Compare appropriately:
  - Gate 1/2: `Math.abs(parseFloat(variance)) <= parseFloat(threshold)`
  - NFR2: `parseInt(cross_module_diff) === 0`
  - Gate 3: `p0_count == 0 && p1_count == 0 && critical_suites_green == true`
- **String representation:** Use string for variance to avoid floating-point comparison issues in test output
- **CI integration:** Add script to CI pipeline before sprint close gate

---

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events: N/A (script is CI automation, not business event)
- [ ] Audit fields: N/A
- [ ] Audit tier: N/A

### Idempotency
- [ ] Idempotency key field: N/A
- [ ] Duplicate handling: N/A

### Validation Rules
- [ ] Script must be runnable without arguments
- [ ] Script must work from repo root
- [ ] Script must handle missing test suite gracefully

### Error Handling
- [ ] Test suite failure: propagate failure, exit 1
- [ ] Missing `__EPIC58_GATE__` lines: exit 1 with diagnostic
- [ ] Version mismatch: exit 1 with diagnostic
- [ ] JSON parse error: exit 1 with diagnostic

---

## Dependencies

- Story 58.1 complete
- Story 58.2 complete
- Story 58.3 complete
- Story 58.4 complete

---

## Required Function: getAllItemsCostSummary

```typescript
// In packages/modules/inventory-costing/src/index.ts

interface AggregatedCostSummary {
  companyId: number;
  totalQuantity: number;
  totalCost: string; // DECIMAL(18,4) as string to avoid float issues
  averageCost: string;
  itemCount: number;
}

/**
 * Aggregates cost summary across ALL items for a company.
 * Used for NFR2 cross-module comparison.
 *
 * NFR2: Consistent valuation across all inventory modules —
 * cross-module diff MUST be zero (two modules computing the same
 * quantity from the same data must agree exactly).
 */
export async function getAllItemsCostSummary(
  companyId: number,
  db: Kysely<any>
): Promise<AggregatedCostSummary> {
  // Implementation: aggregate across all stock items
  // - SUM(remaining_qty * unit_cost) for PRODUCTS and INGREDIENTS
  // - Exclude SERVICE and RECIPE items (not stock-tracked)
}
```

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] No `as any` casts added without justification
- [ ] Integration tests included (not deferred)
- [ ] All new debt items added to registry

---

## Notes

**Why this story exists:** Without automated gate validation, sprint close requires manual evidence collection. This is error-prone and delays sprint close. The script provides machine-verifiable proof that all gates passed.

**NFR2 prerequisite:** The `getAllItemsCostSummary` function must be added before `test:integration:inventory:posting` can emit valid `__EPIC58_GATE__` lines for NFR2. This is documented as a required function for Story 58.5.

**Version field purpose:** The `version` field in `__EPIC58_GATE__` lines allows the script to detect when test suite output format has changed. If version is unknown/malformed, the script exits 1 rather than potentially misinterpreting the output.

_Last Updated: 2026-05-07_
