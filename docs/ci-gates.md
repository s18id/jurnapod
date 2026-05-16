# CI Gates — Policy & Operations

> **Effective:** 2026-04-23
> **Last Updated:** 2026-05-16
> **Story:** 49.6 — CI Pipeline Reliability Enforcement
> **Scope:** All pull requests to `main` and release branches
> **Policy:** This document uses RFC-style keywords (`MUST`, `MUST NOT`, `SHOULD`, `MAY`) per file-structure-standard-v1.md Section 5a Policy E.

---

## 1. Overview

The CI pipeline enforces three classes of gates:

| Gate Class | Blocking? | Description |
|------------|-----------|-------------|
| **Critical Gates** | ✅ YES — required for merge | API lint, API typecheck, fixture-flow policy, migration lint, critical matrix suites |
| **Advisory Checks** | ❌ NO — informational | Monorepo build, MySQL-only extended suites, sprint status integrity |
| **Ratchet Checks** | ❌ NO — informational | Structure conformance for new violations only |

---

## 2. Critical Gates (Required — No Bypass)

Critical gates **MUST** pass (exit 0) before any PR can be merged. There is no bypass mechanism without an explicit emergency exception approved by the architect role.

### 2.1 API Lint Gate

**Job:** `lint-api`
**Command:** `npm run lint -w @jurnapod/api`
**Policy:** Non-zero lint exit **MUST** result in CI failure. ESLint warnings are advisory unless the command exits non-zero.

### 2.2 API Typecheck Gate

**Job:** `typecheck-api`
**Commands:**

```bash
npm run build:libs
npm run typecheck -w @jurnapod/api
```

**Policy:** `build:libs` **MUST** run before API typecheck so workspace consumers resolve current package `dist` exports. Non-zero `tsc` exit **MUST** result in CI failure.

### 2.3 Fixture-Flow Policy Gate

**Job:** `fixture-flow`
**Command:** `npm run lint:fixture-flow`
**Policy:** Fixture setup **MUST** follow owner-package fixture flow. New fixture-flow violations are P0/P1 process risks and **MUST** block merge.

### 2.4 Migration Trigger Lint Gate

**Job:** `lint-migrations`
**Command:** `npm run lint:migrations`
**Policy:** Migrations **MUST NOT** introduce business-logic triggers unless explicitly annotated and reviewed by architecture.

### 2.5 Critical Suites Integration Gate

**Job:** `test-critical`
**Database matrix:** `mysql:8.0` (`db_key=mysql8`) and `mariadb:11.8` (`db_key=mariadb118`)
**Command shape:** Isolated workspace `test:single` runs per critical suite
**Policy:** All critical suites **MUST** pass (0 failures) on both database engines for CI to be green.

**API command pattern:**

```bash
npm run test:single -w @jurnapod/api -- __test__/integration/<suite>.test.ts
```

**Auth command pattern:**

```bash
npm run test:single -w @jurnapod/auth -- __test__/integration/resource-level-acl.integration.test.ts
```

**Auth DB environment:** the `test-critical` job **MUST** set `AUTH_TEST_USE_DB=1` and `AUTH_TEST_DB_*` values that point at the CI service database (`127.0.0.1:3306`, user `root`, password `testdb`, database `jurnapod`). These values override package-local `.env.test.db` defaults.

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

**Extended suites:** Non-critical workspace tests run as an advisory MySQL-only step inside `test-critical` after the blocking critical suites pass. The step uses `continue-on-error: true` and explicitly excludes the 17 critical suite files to prevent redundant execution.

**Evidence:** 3-consecutive-green historical evidence is documented in:
- `_bmad-output/planning-artifacts/epic-49-3consecutive-green-evidence.md`
- Individual story completion files (`story-49.2.completion.md`, etc.)

---

## 3. Advisory Checks (Non-Blocking)

Advisory checks **MUST NOT** block PR merge. Failures are logged and reported as health signals.

### 3.1 Build Check

**Job:** `build`
**Purpose:** Monorepo build plus all-workspace typecheck
**Policy:** `typecheck-api` is the authoritative API type gate. The build job provides broader workspace signal and remains advisory.

### 3.2 Extended Test Suites

**Location:** `test-critical` job, `Run extended suites (advisory — MySQL only, excludes critical)` step
**Purpose:** Runs non-critical workspace tests once against MySQL after the blocking critical suites pass
**Policy:** Failures in this step **MUST NOT** block merge. The step **MUST** exclude the 17 critical suite files because those files already run as blocking isolated suites on both MySQL and MariaDB.

### 3.3 Sprint Status Integrity

**Job:** `sprint-status`
**Purpose:** Detects accidental `sprint-status.yaml` overwrites
**Policy:** Failures indicate a sprint-tracking integrity regression and require immediate recovery.

### 3.4 Structure Conformance (Ratchet)

**Job:** `structure-conformance`
**Purpose:** Catches new structure violations in active scope
**Policy:** New violations in active scope **MUST** fail this check. Baseline violations remain tolerated debt.

---

## 4. Evidence Artifact Retention

| Artifact | Retention | Purpose |
|----------|-----------|---------|
| `lint-results` | 7 days | API lint output |
| `test-api-results-${{ matrix.db_key }}` | 7 days | Critical suite logs plus any generated test result or coverage files for the database matrix leg |
| `build-artifacts` | 1 day | Build output |

**Critical suite log path:** `apps/api/logs/s49-6-critical-*.log`
**Extended suite evidence:** GitHub job log plus any generated `test-results*.json` or coverage artifact files
**Historical evidence:** `_bmad-output/planning-artifacts/epic-49-3consecutive-green-evidence.md`

---

## 5. Option A Rollout — Critical-Only Required Gates

Story 49.6 implements **Option A** (critical-only required gates). Under Option A:

1. **Required blocking jobs:** `lint-api`, `typecheck-api`, `fixture-flow`, `lint-migrations`, `test-critical` — all **MUST** pass.
2. **Advisory jobs/signals:** `build`, MySQL-only extended suite step, `sprint-status`, `structure-conformance` — these **MUST NOT** block merge.
3. **Extended suites** **MAY** be promoted to the critical suite list after they achieve documented stability and owner approval.

**Rationale:** Running every integration suite across both database engines on every CI run exceeds runner budgets. Option A enforces financial, ACL, sync, fixture-flow, and migration correctness while retaining advisory signal for the broader test surface.

---

## 6. Troubleshooting

### Lint Gate Failures

**Symptom:** `lint-api` exits non-zero
**Check:** `npm run lint -w @jurnapod/api` locally. Fix all lint errors before pushing.

### Typecheck Gate Failures

**Symptom:** `typecheck-api` exits non-zero
**Check:** Run the same sequence locally:

```bash
npm run build:libs
npm run typecheck -w @jurnapod/api
```

### Fixture-Flow Failures

**Symptom:** `fixture-flow` exits non-zero
**Check:** `npm run lint:fixture-flow` locally. Move setup writes to owner-package fixture helpers instead of bypassing the validator.

### Critical Suite Failures

**Symptom:** `test-critical` fails
**Check:** Download `test-api-results-${{ matrix.db_key }}` and inspect `apps/api/logs/s49-6-critical-*.log`.

**Recovery:**

1. Identify failing suite(s) from CI logs.
2. Run the suite locally 3× consecutively with workspace syntax, for example:

   ```bash
   npm run test:single -w @jurnapod/api -- __test__/integration/accounting/fiscal-year-close.test.ts
   ```

3. If flakiness is confirmed, suite demotion from the critical list **MUST** be approved by the test owner and tracked as a P1/P2 hardening item. Demoted coverage remains advisory through the MySQL-only extended suite step until stability evidence exists.
4. Document confirmed CI flakiness in `_bmad-output/planning-artifacts/epic-49-risk-register.md` or the active epic risk register.

### Structure Conformance Failures

**Symptom:** `structure-conformance` fails on a new violation
**Check:** `npx tsx scripts/validate-structure-conformance.ts` locally
**Policy:** New violations in active scope **MUST** be fixed before merge. Baseline violations are tolerated debt.

---

## 7. Job Dependency Graph

```
lint-api ───────────────────────┐
typecheck-api ──────────────────┼──► test-critical ──► blocking matrix gate
fixture-flow ───────────────────┤

lint-migrations ────────────────┐
build ──────────────────────────┤
sprint-status ──────────────────┤  advisory/independent signal jobs
structure-conformance ──────────┘

test-critical/mysql8 ───────────► critical suites (blocking) ─► extended suites (advisory)
test-critical/mariadb118 ───────► critical suites (blocking)
```

All jobs run on `push` and `pull_request` events. Critical gates (`lint-api`, `typecheck-api`, `fixture-flow`, `lint-migrations`, `test-critical`) form the merge contract.

---

## 8. References

- CI workflow: `.github/workflows/ci.yml`
- Evidence manifest: `_bmad-output/planning-artifacts/epic-49-3consecutive-green-evidence.md`
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Structure standard: `_bmad-output/planning-artifacts/file-structure-standard-v1.md`
- Epic 49 risk register: `_bmad-output/planning-artifacts/epic-49-risk-register.md`
