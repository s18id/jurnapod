# Story 62.6: Gate Validation Automation + Exit Evidence

**Status:** ready-for-dev

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

- [ ] Task 1: Design gate schema (AC: 1, 2)
  - [ ] 1.1 Define `EPIC62_GATE` JSON schema (gate name, projection name, variance, timestamp, pass)
  - [ ] 1.2 Define expected gates list (GATE1: AR aging, GATE2: AP aging, GATE3: GL trial balance, GATE4: inventory/COGS)
- [ ] Task 2: Implement gate parser (AC: 1)
  - [ ] 2.1 Create `scripts/validate-epic-62-gates.ts`
  - [ ] 2.2 Parse stdin or log file for `__EPIC62_GATE__` lines
  - [ ] 2.3 Validate JSON structure of each gate line
  - [ ] 2.4 Handle malformed lines gracefully (warn, don't crash)
- [ ] Task 3: Implement gate checker (AC: 2, 3)
  - [ ] 3.1 Check all expected gates are present
  - [ ] 3.2 Check all gates have `pass: true` and `variance == 0`
  - [ ] 3.3 Report failures with gate name, variance, and expected vs actual
- [ ] Task 4: Add to CI configuration (AC: 5)
  - [ ] 4.1 Add `validate-epic-62-gates` as a CI step after integration tests
  - [ ] 4.2 Pipe test output to gate validator
  - [ ] 4.3 Verify CI integration works end-to-end
- [ ] Task 5: 3× green verification (AC: 4)
  - [ ] 5.1 Run critical suites 3 times
  - [ ] 5.2 Document all 3 runs in story completion notes
  - [ ] 5.3 Verify exit 0 on all 3

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
