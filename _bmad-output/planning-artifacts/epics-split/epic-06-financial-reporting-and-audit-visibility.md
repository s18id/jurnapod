## Epic 6: Financial Reporting and Audit Visibility

Owners and accountants can view core financial reports and export data for oversight and compliance.

### Story 6.1: Trial Balance Report
As an accountant,
I want to run trial balance by date range,
So that I can verify debits and credits remain balanced.

**Acceptance Criteria:**

**Given** a valid company scope and date range
**When** trial balance is generated
**Then** opening, movement, and closing balances are computed from posted journal entries only
**And** total debits equal total credits at report precision

**Given** filters include outlet/dimension constraints
**When** report runs
**Then** results reflect only authorized scoped data
**And** cross-tenant data is never included

**Given** no activity exists in period
**When** report is requested
**Then** the API returns a valid empty-state report (not an error) with explicit zero totals

**Given** invalid date ranges or malformed filters
**When** validation runs
**Then** request fails with clear field-level guidance and consistent error envelope

**Given** the same filters are re-run
**When** report is regenerated
**Then** totals and row ordering are deterministic and reproducible for audit use

### Story 6.2: General Ledger Report with Drill-Down
As an accountant,
I want to view general ledger movements per account,
So that I can inspect transaction-level posting activity.

**Acceptance Criteria:**

**Given** an authorized user selects account and period filters
**When** the report is generated
**Then** each account view includes opening balance, ordered movements, and closing balance
**And** opening + net movement equals closing

**Given** movement rows are returned
**When** user drills down
**Then** each row links to source journal batch/line and originating business document where available
**And** debit/credit signage is consistent with chart-of-accounts rules

**Given** pagination is required
**When** pages are requested
**Then** result order is stable (date, batch, line tie-breakers) and audit-safe across page boundaries

**Given** unauthorized account or tenant scope is requested
**When** access check runs
**Then** request is denied without exposing account existence in other tenants

**Given** report generation hits transient failure
**When** error is returned
**Then** no partial/corrupt dataset is cached as success
**And** user receives a recoverable retry path

### Story 6.3: Sales Report by Date Range
As a business owner,
I want sales summaries for chosen date ranges,
So that I can monitor outlet performance and trends.

**Acceptance Criteria:**

**Given** valid date/outlet filters in authorized scope
**When** sales report runs
**Then** gross sales, discounts, taxes, net sales, payments, and void/refund impact are computed deterministically
**And** totals tie back to underlying finalized POS/invoice records

**Given** an outlet comparison view is requested
**When** grouped totals are returned
**Then** each outlet subtotal and grand total reconcile exactly

**Given** finalized records are corrected via void/refund flows
**When** period totals are recalculated
**Then** report reflects correction semantics explicitly (not silent mutation)

**Given** invalid filter combinations (future-only range, start > end, unauthorized outlet)
**When** request is validated
**Then** report is rejected with clear UX guidance and no server error

**Given** report values are displayed
**When** user inspects monetary fields
**Then** formatting and rounding are consistent with accounting precision and locale rules

### Story 6.4: Accountant-Friendly Report Export
As an accountant,
I want to export reports in common formats,
So that I can share and reconcile data externally.

**Acceptance Criteria:**

**Given** a report view is already filtered in UI/API
**When** export is requested
**Then** exported rows and totals match the on-screen dataset exactly
**And** export metadata includes report type, filters, generated_at, and tenant context

**Given** CSV/XLSX (or supported formats) are provided
**When** file is generated
**Then** column schema, signs, decimal precision, and date formats are stable and documented

**Given** large datasets are exported
**When** generation runs
**Then** operation completes within platform limits or fails gracefully with retry instructions
**And** no partial file is marked successful

**Given** unauthorized export is attempted
**When** permission and scope checks run
**Then** request is denied consistently with report-access rules

**Given** export succeeds/fails
**When** audit is reviewed
**Then** audit log includes actor, report type, filter hash/summary, format, and outcome

### Story 6.5: POS Transaction History and Search
As an auditor,
I want to search POS transaction history,
So that I can investigate operational and financial events.

**Acceptance Criteria:**

**Given** transaction data exists in user scope
**When** filters are applied (date, outlet, status, reference, cashier, amount range)
**Then** matching records are returned with stable pagination and deterministic sort

**Given** a transaction row is opened
**When** detail view loads
**Then** it shows payment breakdown, tax/discount components, sync state, and posting/journal linkage fields

**Given** offline/retry behavior occurred
**When** history is inspected
**Then** duplicate-safe semantics are visible via `client_tx_id` and server transaction references

**Given** a user requests unauthorized tenant/outlet records
**When** query executes
**Then** those records are excluded and direct-id access is denied safely

**Given** history supports audit workflows
**When** values are exported or copied
**Then** identifiers and monetary totals remain consistent with ledger-linked records

