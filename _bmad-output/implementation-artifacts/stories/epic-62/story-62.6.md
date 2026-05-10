# Story 62.6: Gate Validation Automation + Exit Evidence

**Status:** review

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 62 --story 62-6 --title gate-validation-automation-exit-evidence --status done`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **CI/CD pipeline operator**,
I want **automated gate validation that parses `__EPIC62_GATE__` JSON evidence from test output and exits with pass/fail**,
so that **projection correctness is machine-verifiable on every CI run**.

## Context

- **Source:** Epic 62 (FR3, FR7, NFR4) — Projection Correctness Hardening
- **Predecessor:** Stories 62.1–62.5 (all reconciliation tests emit `__EPIC62_GATE__` evidence)
- **Scope:** `scripts/validate-epic-62-gates.ts`
- **Risk:** P2 — infrastructure utility; blocked on gate evidence from prior stories

## Acceptance Criteria

**AC1: Gate validation script parses `__EPIC62_GATE__` from test stdout**
**Given** integration test output containing `__EPIC62_GATE__` JSON lines,
**When** `npx tsx scripts/validate-epic-62-gates.ts` is executed,
**Then** the script extracts all gate evidence lines,
**And** parses the JSON payload from each.

**AC2: All gates must pass for exit code 0**
**Given** parsed gate evidence,
**When** any gate has `pass: false` or `variance != 0`,
**Then** the script exits with code 1 and prints the failing gate details.

**AC3: Missing gates cause failure**
**Given** an expected set of gates (GATE1–GATE4 per the epic),
**When** any expected gate is not found in the evidence,
**Then** the script exits with code 1 and reports missing gates.

**AC4: 3× consecutive green required for epic exit**
**Given** the exit criteria,
**When** the script is run 3 consecutive times against the critical test suite,
**Then** all 3 runs must exit 0 for the epic exit gate to be considered met.

**AC5: Script is CI-compatible**
**Given** the CI pipeline configuration,
**When** the script is invoked,
**Then** it reads from stdin or a specified log file,
**And** produces machine-parseable output (JSON or text with exit code).

## Tasks / Subtasks

- [x] Task 1: Design gate schema (AC: 1, 2)
  - [x] Schema: gate, projection, variance, timestamp (+ optional test/gl_revenue fields)
  - [x] 8 expected projections: ar-aging, ap-aging, gl-trial-balance, inventory-valuation, cogs-posting, treasury-balance, sales-revenue, cash-flow-consistency
- [x] Task 2: Implement gate parser (AC: 1)
  - [x] Script: `scripts/validate-epic-62-gates.ts`
  - [x] Parses `{"gate":"__EPIC62_GATE__",...}` lines from log file
  - [x] Validates JSON structure, handles malformed lines with warnings
- [x] Task 3: Implement gate checker (AC: 2, 3)
  - [x] Checks all 8 expected projections are present
  - [x] Checks all variance == "0.0000"
  - [x] Reports missing projections and non-zero variances
- [x] Task 4: Add to CI configuration — N/A (script usable standalone via pipe or --input=)
- [x] Task 5: 3× green verification (AC: 4)
  - [x] Verified: all 8 reporting tests pass, all 24 gates present, all variance 0.0000
  - [x] Script exits 0

## Files to Create

| File | Description |
|------|-------------|
| `scripts/validate-epic-62-gates.ts` | Gate validation script |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Add | `validate-epic-62-gates` script entry |

## Estimated Effort

1 day

## Risk Level

P2 — Infrastructure utility. Not blocking other stories. Must be complete before epic exit.

## Dev Notes

### Gate evidence format (canonical)

```json
{
  "version": 1,
  "gate": "GATE1",
  "projection": "ar-aging",
  "variance": "0.0000",
  "threshold": "0.0000",
  "pass": true,
  "timestamp": "2026-05-10T12:00:00.000Z"
}
```

### Expected gates (Epic 62)

| Gate | Projection | Source Story |
|------|-----------|--------------|
| GATE1 | AR Aging vs subledger | 62.1 |
| GATE2 | AP Aging vs subledger | 62.1 |
| GATE3 | GL Trial Balance vs journal | 62.1 |
| GATE4 | Inventory/COGS vs subledger | 62.2 |
| GATE5 | Treasury balance vs cash/bank | 62.3 |
| GATE6 | Sales revenue vs GL revenue | 62.3 |

### Script usage

```bash
# Pipe test output directly
npm run test:integration -w @jurnapod/api 2>&1 | npx tsx scripts/validate-epic-62-gates.ts

# Or read from log file
npx tsx scripts/validate-epic-62-gates.ts --input logs/test-int-v8.log
```

### Script exit codes

| Code | Meaning |
|------|---------|
| 0 | All gates present and passing |
| 1 | One or more gates missing or failing |
| 2 | Invalid input (no gate evidence found) |

## Dependencies

- Stories 62.1–62.3 — gate evidence emitted by reconciliation tests
- Story 62.2 — inventory/COGS gate evidence
- `npx tsx` — TypeScript execution runtime

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
