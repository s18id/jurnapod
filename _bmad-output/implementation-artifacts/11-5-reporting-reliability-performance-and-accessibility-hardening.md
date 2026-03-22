# Story 11.5: Reporting Reliability, Performance, and Accessibility Hardening

**Epic:** Operational Trust and Scale Readiness  
**Status:** done  
**Priority:** High  
**Created:** 2026-03-22  
**Type:** Reliability Hardening  

---

## Story

As a **backoffice user**,  
I want **trial balance and ledger reports to be fast, reliable, and accessible**,  
So that **financial oversight works consistently for all users**.

---

## Context

Epic 11 focuses on reliability hardening for operational trust. Stories 11.1-11.4 established SLO instrumentation, POS performance hardening, sync idempotency, and reconciliation guardrails. Story 11.5 completes the epic by ensuring financial reports (Trial Balance and General Ledger) meet performance, reliability, and accessibility standards.

**Existing Foundation:**
- `packages/telemetry/src/slo.ts` defines SLO targets for `trial_balance` and `general_ledger` (p95 latency < 5s)
- `packages/telemetry/src/metrics.ts` defines metric names: `trial_balance_latency_seconds`, `trial_balance_errors_total`, `general_ledger_latency_seconds`, `general_ledger_errors_total`
- `apps/api/src/lib/reports.ts` implements `getTrialBalance()` and `getGeneralLedgerDetail()` functions
- API routes at:
  - `apps/api/app/api/reports/trial-balance/route.ts`
  - `apps/api/app/api/reports/general-ledger/route.ts`
- `apps/backoffice/e2e/accessibility.spec.ts` uses axe-core for WCAG 2.1 AA compliance testing
- Story 11.1 (SLO instrumentation) provides telemetry infrastructure

**What's missing for report reliability:**
1. No latency tracking per request for report endpoints ✅ Address via telemetry middleware
2. No timeout/cancellation handling for long-running queries ✅ Implement query timeout patterns
3. No dataset size bucket metrics for reports ✅ Add size bucketing to telemetry
4. No retry outcome tracking for failed reports ✅ Implement retry counting
5. No error classification for report failures ✅ Classify errors (timeout, validation, system)
6. No explicit timeout on SQL queries ✅ Add query timeout patterns
7. Accessibility tests only on `/reports/sales` - not on Trial Balance or General Ledger pages ✅ Add accessibility tests
8. No keyboard navigation tests for report filters ✅ Add keyboard interaction tests
9. No color-blind validation for report status indicators ✅ Verify non-color-only indicators

---

## Acceptance Criteria

### 1. Report Performance (p95 < 5s) ✅

**Given** realistic large datasets and concurrent report usage  
**When** users run Trial Balance and General Ledger reports  
**Then** report generation meets p95 latency target (< 5s for standard range/profile) and defined success-rate SLO  
**And** repeated identical queries return consistent totals and balances  

**Sub-criteria:**
- [ ] Telemetry middleware captures `trial_balance_latency_seconds` and `general_ledger_latency_seconds` per request
- [ ] Telemetry middleware captures `trial_balance_errors_total` and `general_ledger_errors_total` with error classification
- [ ] Report queries use appropriate indexes (verified via EXPLAIN)
- [ ] Repeated identical queries with same date range return bit-identical totals
- [ ] Dataset size bucket metric emitted (`dataset_size_bucket`: small/medium/large/xlarge)

### 2. Report Reliability and Error Handling ✅

**Given** timeout, cancellation, or transient backend failures  
**When** report requests fail  
**Then** users receive deterministic, non-ambiguous error states with safe retry actions  
**And** no partial/corrupt financial output is presented as final  

**Sub-criteria:**
- [ ] SQL queries have configurable timeout (default 30s)
- [ ] Timeout errors return HTTP 504 with clear message: "Report generation timed out. Please try a smaller date range."
- [ ] Validation errors return HTTP 400 with specific field issues
- [ ] System errors return HTTP 500 with generic message (no internal details leaked)
- [ ] Partial results are never returned on error - empty state with error context
- [ ] Retry attempts are counted and emitted in telemetry
- [ ] Idempotent GET requests - safe to retry

### 3. Accessibility (WCAG 2.1 AA) ✅

**Given** report UI and exported interactions are audited for accessibility  
**When** keyboard/screen-reader users apply filters, run reports, and inspect tables  
**Then** interaction patterns, announcements, and contrast meet WCAG 2.1 AA  
**And** critical status and validation information is not conveyed by color alone  

**Sub-criteria:**
- [ ] Accessibility tests exist for Trial Balance report page (`/#/reports/trial-balance`)
- [ ] Accessibility tests exist for General Ledger report page (`/#/reports/general-ledger`)
- [ ] All report tables have proper `<th>` with `scope` attributes
- [ ] All filter controls have associated `<label>` elements
- [ ] Error states are announced via `aria-live` regions
- [ ] Loading states are announced via `aria-live` regions
- [ ] Status indicators (success/error/loading) use text labels, not color alone
- [ ] Keyboard navigation works for: date pickers, outlet selectors, run report button, table sorting
- [ ] Focus management when report completes (focus moves to report content)
- [ ] Color contrast ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text

### 4. Report Observability and Alerting ✅

**Given** report observability is enabled  
**When** requests execute in production  
**Then** telemetry captures latency, error class, dataset size bucket, and retry outcomes per report type  
**And** alerts detect sustained degradations before violating report SLO commitments  

**Sub-criteria:**
- [ ] Metrics include labels: `report_type`, `company_id`, `dataset_size_bucket`, `error_class`
- [ ] Error class labels: `timeout`, `validation`, `system`, `auth`
- [ ] Alerts fire when p95 latency exceeds 5s for 5 consecutive minutes
- [ ] Alerts fire when error rate exceeds 5% over 10-minute window
- [ ] Structured logs include `report_type`, `latency_ms`, `row_count`, `error_class`

---

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Report Request Flow                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Client                                                                  │
│    │                                                                    │
│    ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Telemetry Middleware                                             │  │
│  │  - Start timer on request                                          │  │
│  │  - Extract report_type from route                                  │  │
│  │  - Extract company_id from auth                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│    │                                                                    │
│    ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Report Route Handler                                              │  │
│  │  - Validate inputs (Zod schema)                                    │  │
│  │  - Check permissions (RBAC)                                        │  │
│  │  - Resolve date range                                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│    │                                                                    │
│    ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Report Service (reports.ts)                                       │  │
│  │  - Execute query with timeout                                      │  │
│  │  - Map results                                                     │  │
│  │  - Calculate totals                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│    │                                                                    │
│    ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Telemetry Middleware (response)                                   │  │
│  │  - Record latency metric                                           │  │
│  │  - Record error metric (if applicable)                             │  │
│  │  - Log structured info                                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│    │                                                                    │
│    ▼                                                                    │
│  Client                                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Design

#### Telemetry Middleware (`apps/api/src/middleware/telemetry.ts`)

Extend existing middleware to handle report-specific metrics:

```typescript
interface ReportTelemetryData {
  reportType: 'trial_balance' | 'general_ledger' | 'profit_loss' | 'other';
  companyId: number;
  datasetSizeBucket: 'small' | 'medium' | 'large' | 'xlarge';
  errorClass?: 'timeout' | 'validation' | 'system' | 'auth';
  latencyMs: number;
  rowCount?: number;
  retryCount?: number;
}
```

**Metrics to emit:**
- `report_latency_seconds` (histogram) - labels: report_type, company_id, dataset_size_bucket
- `report_errors_total` (counter) - labels: report_type, company_id, error_class
- `report_rows_total` (gauge) - labels: report_type, company_id, dataset_size_bucket

#### Query Timeout Pattern

Add timeout wrapper to report queries:

```typescript
async function withQueryTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new QueryTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

class QueryTimeoutError extends Error {
  constructor() {
    super('Query execution exceeded timeout threshold');
    this.name = 'QueryTimeoutError';
  }
}
```

#### Error Response Format

```typescript
interface ReportErrorResponse {
  success: false;
  error: {
    code: 'TIMEOUT' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR' | 'FORBIDDEN';
    message: string;  // User-friendly message
    retryable: boolean;
    retryAfterMs?: number;  // For rate limiting
  };
}
```

### File Structure

```
apps/api/src/
├── lib/
│   └── reports.ts                    # Existing - add timeout wrapper
├── middleware/
│   └── telemetry.ts                  # Existing - extend for reports

apps/api/app/api/reports/
├── trial-balance/route.ts            # Existing - add error handling
├── general-ledger/route.ts           # Existing - add error handling
├── profit-loss/route.ts              # Existing - add error handling
├── worksheet/route.ts                # Existing - add error handling
└── (other reports)

apps/backoffice/e2e/
└── accessibility.spec.ts             # Existing - add TB/GL tests

docs/
├── runbooks/
│   └── report-performance-runbook.md  # NEW - performance troubleshooting
└── checklists/
    └── report-accessibility-checklist.md  # NEW - WCAG checklist
```

### Dependencies

- **Story 11.1** (SLO instrumentation) - For telemetry infrastructure
- **Story 11.4** (reconciliation) - For consistency patterns

---

## Dev Notes

### Project Structure Notes

- Follow existing telemetry patterns in `packages/telemetry/src/metrics.ts`
- Use existing response envelope format from `apps/api/src/lib/response.ts`
- Report routes follow REST conventions in `apps/api/app/api/reports/*/route.ts`
- Use node:test runner for unit tests (not vitest)

### Database Patterns

- Use `DECIMAL(18,2)` for all monetary values (already enforced in schema)
- Report queries must be tenant-scoped (`company_id`, optionally `outlet_id`)
- Add query timeout to prevent long-running queries blocking resources
- EXPLAIN should verify indexes are used for date range queries

### API Patterns

- Follow REST conventions for report endpoints
- Use existing Zod validation schemas for query parameters
- Include structured logging for latency and error tracking
- Error responses must be deterministic and user-friendly

### Testing Standards

- Unit tests for timeout/error handling with mocked DB
- Integration tests for API endpoints with telemetry verification
- Accessibility tests using axe-core (existing pattern)
- Test report consistency (repeated queries return same totals)

### Accessibility Requirements

Based on WCAG 2.1 AA:
- 1.3.1 Info and Relationships - proper table markup
- 1.3.2 Meaningful Sequence - logical reading order
- 1.4.1 Use of Color - status not conveyed by color alone
- 1.4.3 Contrast Minimum - 4.5:1 for text
- 1.4.4 Resize Text - readable at 200% zoom
- 2.1.1 Keyboard - all functions available by keyboard
- 2.4.3 Focus Order - logical focus movement
- 2.4.7 Focus Visible - visible focus indicator
- 3.3.1 Error Identification - errors identified and described
- 4.1.2 Name, Role, Value - form controls properly labeled

### References

- [Source: packages/telemetry/src/slo.ts](file:///home/ahmad/jurnapod/packages/telemetry/src/slo.ts) - SLO definitions for reports
- [Source: packages/telemetry/src/metrics.ts](file:///home/ahmad/jurnapod/packages/telemetry/src/metrics.ts) - Metric definitions
- [Source: apps/api/src/lib/reports.ts](file:///home/ahmad/jurnapod/apps/api/src/lib/reports.ts) - Report implementations
- [Source: apps/api/app/api/reports/trial-balance/route.ts](file:///home/ahmad/jurnapod/apps/api/app/api/reports/trial-balance/route.ts) - TB route
- [Source: apps/api/app/api/reports/general-ledger/route.ts](file:///home/ahmad/jurnapod/apps/api/app/api/reports/general-ledger/route.ts) - GL route
- [Source: apps/backoffice/e2e/accessibility.spec.ts](file:///home/ahmad/jurnapod/apps/backoffice/e2e/accessibility.spec.ts) - Accessibility test pattern
- [Source: apps/api/src/middleware/telemetry.ts](file:///home/ahmad/jurnapod/apps/api/src/middleware/telemetry.ts) - Telemetry middleware
- [Source: docs/project-context.md](file:///home/ahmad/jurnapod/docs/project-context.md) - Project conventions

---

## Tasks / Subtasks

- [x] Task 1 (AC: #1 - Performance)
  - [x] Subtask 1.1: Extend telemetry middleware for report-specific metrics
  - [x] Subtask 1.2: Add dataset size bucketing logic
  - [x] Subtask 1.3: Add latency histogram and error counter metrics
  - [x] Subtask 1.4: Verify query performance with EXPLAIN

- [x] Task 2 (AC: #2 - Reliability)
  - [x] Subtask 2.1: Create query timeout wrapper function
  - [x] Subtask 2.2: Add timeout handling to report routes (HTTP 504)
  - [x] Subtask 2.3: Ensure no partial results on error
  - [x] Subtask 2.4: Add retry count tracking in telemetry

- [x] Task 3 (AC: #3 - Accessibility)
  - [x] Subtask 3.1: Add accessibility tests for Trial Balance page
  - [x] Subtask 3.2: Add accessibility tests for General Ledger page
  - [x] Subtask 3.3: Add keyboard navigation tests for report filters
  - [x] Subtask 3.4: Verify non-color status indicators

- [x] Task 4 (AC: #4 - Observability)
  - [x] Subtask 4.1: Define alert rules for report SLO violations
  - [x] Subtask 4.2: Document runbook for report performance troubleshooting
  - [x] Subtask 4.3: Add structured log templates for reports

---

## Dev Agent Record

### Agent Model Used

kimi-k2.5

### Debug Log References

### Completion Notes List

- ✅ Created `report-telemetry.ts` module with timeout wrapper, error classification, dataset size bucketing
- ✅ Created `report-telemetry.test.ts` with 26 passing unit tests (node:test runner)
- ✅ Updated `trial-balance/route.ts` with timeout handling and telemetry
- ✅ Updated `general-ledger/route.ts` with timeout handling and telemetry
- ✅ Added accessibility tests for Trial Balance and General Ledger pages
- ✅ Added keyboard navigation tests for report filters
- ✅ Created `report-performance-runbook.md` with SLO targets, diagnostic steps, and escalation
- ✅ Created `report-accessibility-checklist.md` with WCAG 2.1 AA requirements
- ✅ All 26 unit tests passing
- ✅ API type check: PASS
- ✅ API build: PASS
- ✅ API lint: PASS (0 warnings)
- ✅ Code review completed - all critical issues fixed
- ✅ Context parameter handling fixed in telemetry calls
- ✅ Database cleanup hook added to test file for consistency

### File List

**Created:**
- `apps/api/src/lib/report-telemetry.ts` - Report telemetry module
- `apps/api/src/lib/report-telemetry.test.ts` - Unit tests (26 passing)
- `docs/runbooks/report-performance-runbook.md` - Performance troubleshooting runbook
- `docs/checklists/report-accessibility-checklist.md` - WCAG 2.1 AA checklist

**Modified:**
- `apps/api/app/api/reports/trial-balance/route.ts` - Added timeout and telemetry
- `apps/api/app/api/reports/general-ledger/route.ts` - Added timeout and telemetry
- `apps/backoffice/e2e/accessibility.spec.ts` - Added TB/GL accessibility and keyboard tests
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated story status to done

