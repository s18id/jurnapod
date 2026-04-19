# Epic 47 Micro-Scope Delegation Pack

**Date:** 2026-04-19  
**Purpose:** Delegate Epic 47 in narrow scopes with explicit P0/P1 guardrails.  
**Mode:** Execution-ready prompts (copy/paste).

---

## Wave sequencing (hard gates)

1. **Wave 0** (A1/A2/A3) must pass first
2. `@bmad-review` gate must report **no unresolved P0/P1**
3. Only then begin **Wave 1** (Story 47.1 scopes)

**Stop rule:** any unresolved P0/P1 blocks next scope/wave.

---

## Global guardrails (attach to every delegation)

- Tenant isolation is mandatory (`company_id` on all reads/writes)
- ACL must be explicit resource-level (`module.resource`)
- Journals remain financial source of truth for reconciliation
- Money precision: no FLOAT/DOUBLE, no lossy conversions
- Finalized financial records are immutable
- Migrations must be rerunnable and MySQL/MariaDB portable
- Integration tests required for all accounting/period-close boundaries

---

## Wave 0 Prompts

### W0-1 — MS-47-A1 Contract Lock
**Owner:** `@bmad-architect`

```text
Execute MS-47-A1 for Epic 47.

Goal:
Freeze reconciliation settings contract with no P0/P1 leakage.

Required output:
1) Canonical storage model and API contract
2) Validation constraints and tenant ownership rules for account_ids
3) Absent-setting behavior and compatibility bridge behavior
4) P0/P1 risks + mitigations
5) Go/No-Go

Guardrails:
- company-scoped settings only
- fail-closed on unresolved setting
- no implicit financial fallback
- explicit ACL resource requirements
```

---

### W0-2 — MS-47-A2 Schema/Migration Blockers
**Owner:** `@bmad-architect`

```text
Execute MS-47-A2 for Epic 47.

Goal:
Deliver schema/migration blocker package for:
- fiscal_periods
- supplier_statements
- ap_exceptions

Required output:
1) Required columns/constraints/indexes per table
2) Migration sequencing by dependency
3) Rerunnable MySQL/MariaDB strategy using guarded DDL
4) P1/P2 coupling risks across stories
5) Go/No-Go

Guardrails:
- company_id mandatory on new business tables
- deterministic idempotency keys where repeated detection exists
- no non-portable DDL shortcuts
```

---

### W0-3 — MS-47-A3 ER + Temporal/Immutability
**Owner:** `@bmad-analyst`

```text
Execute MS-47-A3 for Epic 47.

Goal:
Eliminate AC ambiguity that causes P0/P1 defects.

Required output:
1) AP↔GL↔period-close ER map
2) Locked-at-posting vs mutable-settings matrix
3) Cutoff/timezone precedence and inclusion rules
4) AC contradictions + clarifications
5) P0/P1 risk register + mitigations
6) Go/No-Go

Guardrails:
- no UTC fallback for business cutoff logic
- historical results must not be reinterpreted by later config changes
```

---

### W0-4 — Hard Gate Review
**Owner:** `@bmad-review`

```text
Review Wave 0 package (A1/A2/A3).

Return:
- P0/P1 findings only (with file/decision references)
- required fixes
- final gate status: PASS/FAIL

Rule:
If any unresolved P0/P1 remains, mark FAIL and block Wave 1.
```

---

## Wave 1 Prompts (Story 47.1)

### W1-1 — Settings API + ACL
**Owner:** `@bmad-dev`

```text
Implement Story 47.1 scope: settings API + ACL.

Checklist:
- implement config read/write for AP reconciliation account set
- enforce resource-level ACL on settings endpoints
- enforce account ownership/type validation
- fail-closed if setting unresolved

Evidence required:
- integration tests: 401/403/200 + tenant isolation
- typecheck/build pass
```

---

### W1-2 — Reconciliation Summary Engine
**Owner:** `@bmad-dev`

```text
Implement Story 47.1 scope: reconciliation summary calculator.

Checklist:
- AP balance + GL control balance + variance
- as_of_date company-local cutoff behavior
- company-scoped query boundaries
- journals as source of truth

Evidence required:
- integration tests for cutoff boundaries and variance correctness
```

---

### W1-3 — FX Normalization
**Owner:** `@bmad-dev`

```text
Implement Story 47.1 scope: currency normalization.

Checklist:
- enforce formula: base = original * effective_rate_on_transaction_date
- use deterministic decimal handling
- no float precision leakage in assertions

Evidence required:
- integration test asserting formula with non-base currency
- edge test for rounding and date-effective rate selection
```

---

### W1-4 — QA Integration Pack
**Owner:** `@bmad-qa`

```text
Create Story 47.1 integration test matrix and test set.

Must include:
- ACL negative tests with low-privilege roles
- tenant isolation tests
- cutoff/timezone boundary tests
- currency conversion regression tests

Output:
- AC-to-test traceability list
- uncovered-risk list (P1/P2)
```

---

### W1-5 — Pre-merge Risk Gate
**Owner:** `@bmad-review`

```text
Review Story 47.1 implementation package.

Return:
- P0/P1 findings (if any)
- concrete required fixes
- PASS/FAIL

Rule:
Any unresolved P0/P1 => FAIL.
```

---

## Definition of ready to start coding (Wave 1)

- [ ] Wave 0 review gate PASS
- [ ] Schema blocker package accepted
- [ ] Contract lock accepted
- [ ] Temporal/immutability checklist attached to 47.1 implementation
