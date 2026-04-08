# AGENTS.md

## Scope
Backoffice ERP rules for invoices, journals, payments, reports, configuration, and accounting-facing workflows.

## Review guidelines

### Priority
- Be strict on accounting correctness, report trustworthiness, and admin safety.
- Treat regressions in financial visibility or posting flows as high severity.

### Financial workflows
- Verify invoice, payment, journal, and related flows preserve accounting invariants.
- Flag any path that lets a finalized business document drift from its journal consequences.
- Prefer auditable correction flows over silent mutation.

### Reporting
- Reports should derive from journals and chart-of-accounts logic, not ad hoc duplicated financial state.
- Flag report logic that can produce inconsistent totals across screens or exports.
- Flag missing filters or scoping that can leak another company or outlet’s data.

### Settings and administration
- Review module enablement, tax defaults, company settings, and outlet settings for proper scoping and authorization.
- Flag admin flows that allow unsafe cross-company edits or missing elevated permission checks.

### Backoffice sync
- The backoffice sync path is separate from POS sync.
- Flag changes that blur those responsibilities or introduce duplicate document effects across the two sync paths.

### UX expectations
- Prefer explicit financial states and traceability over convenience edits.
- Flag hidden destructive actions, silent recalculation, or status transitions that weaken auditability.

### Testing expectations
- Expect tests when changing:
  - invoice posting
  - payment posting
  - journals
  - reports
  - settings/config
  - tax default logic

---

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.