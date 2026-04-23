# CI Gates — Policy & Operations

> **Effective:** 2026-04-23  
> **Story:** 49.6 — CI Pipeline Reliability Enforcement  
> **Scope:** All pull requests to `main` and release branches  
> **Policy:** This document uses RFC-style keywords (`MUST`, `MUST NOT`, `SHOULD`) per file-structure-standard-v1.md Section 5a Policy E.

---

## 1. Overview

The CI pipeline enforces three classes of gates:

| Gate Class | Blocking? | Description |
|------------|-----------|-------------|
| **Critical Gates** | ✅ YES — required for merge | Lint, typecheck, critical suite pass |
| **Advisory Checks** | ❌ NO — informational | Build, extended test suites, sprint status integrity |
| **Ratchet Checks** | ❌ NO — informational | Structure conformance (new violations only) |

---

## 2. Critical Gates (Required — No Bypass)

Critical gates **MUST** pass (exit 0) before any PR can be merged. There is no mechanism to bypass a critical gate without an explicit emergency exception approved by the architect role.

### 2.1 AC1: Lint Gate

**Job:** `lint-api`  
**Command:** `npm run lint -w @jurnapod/api`  
**Policy:** Non-zero lint exit **MUST** result in CI failure. Warnings are acceptable; errors are not.

```
Lint Gate Contract:
- exit 0  → PASS (0 errors, any number of warnings)
- exit 1 with errors → FAIL (blocks merge)
- exit 1 with warnings only → PASS (still exit 1 due to eslint --max-warnings=0, but current baseline is 178 warnings so this is NOT triggered)
```

**Note:** Current baseline is **0 errors, 178 warnings**. The lint gate is green at exit 0.

### 2.2 AC2: Typecheck Gate

**Job:** `typecheck-api`  
**Command:** `npm run typecheck -w @jurnapod/api`  
**Policy:** Non-zero `tsc` exit **MUST** result in CI failure.

### 2.3 AC3: Critical Suites Integration Gate

**Job:** `test-critical`  
**Command:** Isolated `test:single` runs per critical suite (17 suites)  
**Policy:** All critical suites **MUST** pass (0 failures) for CI to be green.

**Critical Suites List:**

| Suite | Source |
|-------|--------|
| `accounting/fiscal-year-close.test.ts` | Epic 48 hardened |
| `accounting/period-close-guardrail.test.ts` | Epic 48 hardened |
| `purchasing/ap-reconciliation.test.ts` | Epic 48 hardened |
| `purchasing/ap-reconciliation-snapshots.test.ts` | Epic 48 hardened |
| `accounting/ap-exceptions.test.ts` | Story 49.2 |
| `sync/idempotency.test.ts` | Story 49.5 |
| `sync/push.test.ts` | Story 49.5 |
| `purchasing/purchase-orders.test.ts` | Story 49.3 |
| `purchasing/goods-receipts.test.ts` | Story 49.3 |
| `purchasing/purchase-invoices.test.ts` | Story 49.3 |
| `purchasing/ap-payments.test.ts` | Story 49.3 |
| `purchasing/purchase-credits.test.ts` | Story 49.3 |
| `purchasing/po-order-no.concurrency.test.ts` | Story 49.3 |
| `purchasing/suppliers-tenant-isolation.test.ts` | Story 49.3 |
| `users/tenant-scope.test.ts` | Story 49.4 |
| `outlets/tenant-scope.test.ts` | Story 49.4 |
| `packages/auth/resource-level-acl.integration.test.ts` | Story 49.4 |

**Deferred suites (non-blocking — not yet in `test-critical`):**
The following suites have 3× green evidence but are **not yet promoted** to the blocking `test-critical` job. They are tracked in `test-extended` and will be promoted incrementally as stability is confirmed:
- `admin-dashboards/reconciliation.test.ts` (Story 49.2)
- `admin-dashboards/trial-balance.test.ts` (Story 49.2)
- `accounting/period-close.test.ts` (Story 49.2 — distinct from `period-close-guardrail`)
- `sales/invoices-discounts.test.ts`, `sales/invoices-update.test.ts`, `sales/orders.test.ts`, `sales/credit-notes-customer.test.ts` (Story 49.2)
- Additional Story 49.3 suites: `purchasing/suppliers.test.ts`, `purchasing/supplier-statements.test.ts`, `purchasing/exchange-rates.test.ts`, `purchasing/ap-aging-report.test.ts`, `purchasing/supplier-soft-delete.regression.test.ts`, `purchasing/supplier-contacts.test.ts`

**Evidence:** 3-consecutive-green runs are documented per story in:
- `_bmad-output/planning-artifacts/epic-49-3consecutive-green-evidence.md`
- Individual story completion files (`story-49.2.completion.md`, etc.)

---

## 3. Advisory Checks (Non-Blocking)

Advisory checks run in parallel but **MUST NOT** block PR merge. Failures are logged and reported but do not prevent merge.

### 3.1 Build Check

**Job:** `build`  
**Purpose:** Monorepo build + all-workspace typecheck  
**Note:** `typecheck-api` is the authoritative type gate; `build` runs `typecheck --workspaces --if-present` for full coverage but is non-blocking.

### 3.2 Extended Test Suites

**Job:** `test-extended`  
**Purpose:** Runs all non-critical suites (inventory, stock, recipes, POS, etc.)  
**Policy:** Failures here **MUST NOT** block merge. Tracked as advisory signal for test health.

### 3.3 Sprint Status Integrity

**Job:** `sprint-status`  
**Purpose:** Detects accidental sprint-status.yaml overwrites (file-integrity check)  
**Policy:** Failures indicate a regression requiring immediate recovery.

### 3.4 Structure Conformance (Ratchet)

**Job:** `structure-conformance`  
**Purpose:** Catches new structure violations in active scope  
**Policy:** FAIL only on new violations not in baseline. Baseline violations are tolerated debt.

---

## 4. Evidence Artifact Retention

**Retention Policy:**

| Artifact | Retention | Purpose |
|----------|-----------|---------|
| `lint-results` | 7 days | AC1 lint output |
| `test-critical-results` | 7 days | AC3/AC4 critical suite logs |
| `test-results` | 7 days | Extended suite logs |
| `build-artifacts` | 1 day | Build output |

**Log paths for critical suites:** `apps/api/logs/s49-6-critical-*.log` (current CI run)

**Historical evidence:** `_bmad-output/planning-artifacts/epic-49-3consecutive-green-evidence.md`

---

## 5. Option A Rollout — Critical-Only Required Gates

Story 49.6 implements **Option A** (critical-only required gates). Under Option A:

1. **Required blocking jobs:** `lint-api`, `typecheck-api`, `test-critical` — all MUST pass
2. **Advisory jobs:** `build`, `test-extended`, `sprint-status`, `structure-conformance` — non-blocking
3. **Extended suites** may be added to `test-critical` incrementally as they achieve 3× green stability

**Rationale:** Running all ~77 critical suites 3× per CI run would exceed runner time limits. Option A ensures:
- Financial/ACL correctness gates are always enforced
- Non-critical suite flakiness does not block delivery
- Extended suites provide signal without blocking

---

## 6. Troubleshooting

### Lint Gate Failures

**Symptom:** `lint-api` exits non-zero  
**Check:** `npm run lint -w @jurnapod/api` locally — fix all errors before pushing

**Common causes:**
- Unused variable/import introduced in changed file
- New `@typescript-eslint/no-unused-vars` violation

### Typecheck Gate Failures

**Symptom:** `typecheck-api` exits non-zero  
**Check:** `npm run typecheck -w @jurnapod/api` locally — fix all type errors

### Critical Suite Failures

**Symptom:** `test-critical` fails (0 failures required)  
**Check:** Download `test-critical-results` artifact — find failing suite log

**Common causes:**
- Time-dependent test introduced new `Date.now()` or `Math.random()`
- Pool cleanup missing (`afterAll` without `pool.end()`)
- RWLock not acquired in suite that shares test server

**Recovery:**
1. Identify failing suite(s) from CI log
2. Run suite locally 3× consecutively: `npm run test:single -- <path> -w @jurnapod/api`
3. If flakiness confirmed, move suite from `test-critical` to `test-extended` until hardened
4. Document flakiness in epic-49-risk-register.md

### Structure Conformance Failures

**Symptom:** `structure-conformance` fails on new violation  
**Check:** `npx tsx scripts/validate-structure-conformance.ts` locally  
**Policy:** New violations in active scope MUST be fixed before merge. Baseline violations are tolerated.

---

## 7. Job Dependency Graph

```
lint-api ───────────────────────┐
typecheck-api ──────────────────┼──► test-critical ──► (merge allowed)
                                 │
build ──────────────────────────┤
test-extended ──────────────────┤
sprint-status ─────────────────┤  (advisory only — no merge blocking)
structure-conformance ─────────┘
```

All jobs run on `push` and `pull_request` events. Critical gates (`lint-api`, `typecheck-api`, `test-critical`) form the merge contract.

---

## 8. References

- CI workflow: `.github/workflows/ci.yml`
- Evidence manifest: `_bmad-output/planning-artifacts/epic-49-3consecutive-green-evidence.md`
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Structure standard: `_bmad-output/planning-artifacts/file-structure-standard-v1.md`
- Epic 49 risk register: `_bmad-output/planning-artifacts/epic-49-risk-register.md`