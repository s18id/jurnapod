# ADR-XXX: Period Close Architecture (Epic 32)

## Status
Proposed

## Date
2026-04-05

## Context
Epic 32 introduces fiscal period close and reconciliation workflows. Financial close is high-risk because retries, concurrent operators, and partial writes can create duplicate or inconsistent closing effects.

We need explicit architecture decisions for:
- idempotency of close approval
- lock/concurrency strategy
- atomic transaction boundary
- closing entry document typing
- approval workflow and audit trail

## Decision

### 1) Idempotency Key for Close Approval

- Endpoint: `POST /accounts/fiscal-years/:id/close/approve`
- Require header or body `idempotency_key`.
- Scope uniqueness by `(company_id, fiscal_year_id, action='PERIOD_CLOSE_APPROVE', idempotency_key)`.
- On retry with same key:
  - if prior attempt succeeded: return previous success payload
  - if prior attempt failed before commit: safe re-execution allowed

### 2) Lock Strategy (`FOR UPDATE`)

Within close transaction, acquire locks in fixed order to avoid deadlock:
1. fiscal year row (`fiscal_years`) via `SELECT ... FOR UPDATE`
2. associated period rows (`fiscal_periods`) via `SELECT ... FOR UPDATE ORDER BY period_number`
3. optional close-request/idempotency row (`period_close_requests`) via `SELECT ... FOR UPDATE`

Lock coverage ensures only one close approval can proceed per fiscal year at a time.

### 3) Atomic Transaction Boundary

Must run in one DB transaction (single commit/rollback unit):
1. validate preconditions (period sequence, prerequisites, authorization)
2. acquire locks
3. generate + insert closing journals/lines
4. apply period/fiscal-year status transitions
5. write audit log event(s)
6. persist idempotency completion status

If any step fails, rollback entire transaction.

### 4) Closing Entry Journal Doc Types

Use explicit document types for close lifecycle:
- `PERIOD_CLOSE_PREVIEW` (non-posting preview artifacts or simulation payload)
- `PERIOD_CLOSE_FINAL` (approved posted closing entries)

Rationale: reporting and audit can differentiate simulation from legally effective close postings.

### 5) Approval Workflow

Workflow is explicit and role-restricted:

1. **Prepare** (`close-preview`): generate checklist + draft close impact
2. **Review**: reconcile GL-vs-subledger variances and trial balance gates
3. **Approve** (`close/approve` with idempotency key): execute atomic close transaction
4. **Record**: immutable audit event with actor, timestamp, pre/post states, journal references

Only authorized accounting roles may approve close.

## Subledger Reconciliation Contract (Required for 32.2/32.3/32.5)

Define explicit mapping contract per account family:
- Cash GL ↔ bank transaction subledger
- Inventory GL ↔ stock valuation subledger
- Receivable GL ↔ AR subledger
- Payable GL ↔ AP subledger

Each mapping must specify:
- source tables/views
- balance computation formula
- period cutoff semantics
- variance classification (`RECONCILED`, `VARIANCE`, `UNRECONCILED`)

## Consequences

### Positive
- Retry-safe close approval under unstable network/client retries
- No partial close (journal without audit, audit without lock, etc.)
- Deterministic concurrency behavior
- Cleaner audit/compliance evidence

### Trade-offs
- Higher implementation complexity
- Additional lock contention during close windows
- Requires consistent idempotency storage and retention policy

## Rollout / Migration Notes

1. Ship idempotency table/index (if not present) before enabling approval endpoint.
2. Release close-preview first (read-only) to validate checklist quality.
3. Enable close-approve behind role checks and staged rollout.
4. Monitor lock waits and close latency in initial periods.

## Verification Checklist

- [ ] duplicate approval requests with same idempotency key are safe
- [ ] concurrent approval requests do not produce duplicate closing journals
- [ ] transaction rollback leaves no partial period-close artifacts
- [ ] audit query returns complete event trail for each close
- [ ] GL trial balance and reconciliation checks are mandatory gates before approval
