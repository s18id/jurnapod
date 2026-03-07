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