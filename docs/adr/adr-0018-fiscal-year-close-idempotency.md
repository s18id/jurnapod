# ADR-0018: Fiscal Year Close Idempotency

**Date:** 2026-04-05
**Status:** Accepted
**Deciders:** Ahmad, Architect

## Context

Fiscal year close is a critical financial operation that:
1. Locks all periods in the fiscal year
2. Generates closing entries
3. Finalizes financial data for compliance

Without idempotency, network failures during close could leave the system in an unknown state.

## Decision

We implement idempotency via a dedicated `fiscal_year_close_requests` table.

### Idempotency Table Schema

```sql
CREATE TABLE fiscal_year_close_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL,
  fiscal_year_id BIGINT NOT NULL,
  close_request_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL, -- PENDING, IN_PROGRESS, SUCCEEDED, FAILED
  fiscal_year_status_before VARCHAR(32) NOT NULL,
  fiscal_year_status_after VARCHAR(32) NOT NULL,
  result_json JSON NULL,
  failure_code VARCHAR(64) NULL,
  failure_message TEXT NULL,
  requested_by_user_id BIGINT NOT NULL,
  requested_at_ts BIGINT NOT NULL,
  started_at_ts BIGINT NULL,
  completed_at_ts BIGINT NULL,
  UNIQUE KEY uq_fy_close_idem (company_id, fiscal_year_id, close_request_id),
  KEY idx_fy_close_status (company_id, fiscal_year_id, status)
);
```

### State Machine

```
PENDING → IN_PROGRESS → SUCCEEDED
                       → FAILED
```

### Idempotency Contract

- `closeRequestId` is provided by caller (UUID/ULID recommended)
- Duplicate `(company_id, fiscal_year_id, close_request_id)` returns stored result
- Same request always returns same terminal state

### Lock Ordering (Deadlock Prevention)

1. Lock `fiscal_year` row FIRST
2. Then lock `period` rows ordered by `period_start_date` ASC

### Retry Logic

- Lock timeout: exponential backoff, 3 attempts
- Deadlock: rollback and retry, 3 attempts

## Consequences

**Positive:**
- Safe retries on network failure
- Observable close operation lifecycle
- Clear audit trail of close attempts

**Negative:**
- Additional database table
- Complexity in error handling

**Neutral:**
- Unique constraint prevents duplicate close operations
