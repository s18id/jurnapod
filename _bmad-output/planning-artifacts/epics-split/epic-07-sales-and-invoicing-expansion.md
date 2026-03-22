## Epic 7: Sales and Invoicing Expansion

Teams can execute broader sales/invoicing flows while preserving posting correctness and financial traceability.

### Story 7.1: Draft Invoice Creation
As a sales admin,
I want to create draft invoices with customer, items, and terms,
So that I can prepare billable sales before finalization.

**Acceptance Criteria:**

**Given** an authorized user enters invoice header and line details
**When** save-draft is submitted
**Then** invoice is persisted in `DRAFT` status only (no GL posting yet)
**And** totals, taxes, discounts, due date, and currency are computed deterministically

**Given** draft numbering is configured
**When** draft is created
**Then** a unique reference number is assigned according to company sequence policy

**Given** required fields are missing or line math is invalid
**When** validation runs
**Then** save is rejected with actionable field-level errors and no partial writes

**Given** concurrent updates happen on the same draft
**When** save conflicts are detected
**Then** conflict is handled explicitly (version/updated_at check) to prevent silent overwrite

**Given** draft save succeeds/fails
**When** audit is queried
**Then** actor, action, invoice id/reference, and outcome are recorded

### Story 7.2: Invoice Finalization and Ledger Posting
As an accountant,
I want finalized invoices to post to GL automatically,
So that receivables and revenue stay synchronized with source documents.

**Acceptance Criteria:**

**Given** a valid `DRAFT` invoice is ready for issuance
**When** finalization is requested
**Then** invoice status transition and GL posting occur in one atomic transaction boundary
**And** finalized invoice cannot return to mutable draft fields

**Given** posting lines are generated
**When** journal is created
**Then** debit/credit totals are balanced and linked to invoice id/reference with immutable metadata

**Given** posting fails (validation/infra)
**When** finalization transaction ends
**Then** invoice remains in recoverable pre-final state
**And** no partial journal artifacts exist

**Given** finalization request is retried/replayed
**When** the same invoice finalization key/action is received
**Then** operation is idempotent and does not create duplicate postings

**Given** finalization succeeds/fails
**When** audit is reviewed
**Then** transition details, actor, timestamp, and linked batch ids are captured

### Story 7.3: Invoice Payment Application and Balance Tracking
As a cashier or AR clerk,
I want to apply partial and full payments to invoices,
So that outstanding balances are tracked accurately.

**Acceptance Criteria:**

**Given** an issued invoice has open balance
**When** a payment is applied with valid method/reference/date
**Then** payment record is persisted and invoice balance updates exactly
**And** status transitions follow rules (`ISSUED` -> `PARTIALLY_PAID` -> `PAID`)

**Given** payment would exceed allowed balance policy
**When** validation runs
**Then** overpayment is rejected (or handled per explicit overpayment policy) without corrupting balance state

**Given** duplicate/replayed payment request is received
**When** idempotency key/reference matches prior success
**Then** system returns existing result and does not double-apply payment

**Given** payment posting to GL is required
**When** payment is committed
**Then** AR/cash journal impact is posted atomically with payment record
**And** failures roll back both accounting and operational writes

**Given** payments are created/voided/reversed
**When** audit trail is reviewed
**Then** all balance-affecting events are traceable with actor, reason, and linkage to invoice/payment ids

### Story 7.4: Invoice List, History, and Sales Visibility
As a business owner,
I want to view and filter invoice history,
So that I can monitor billed sales alongside POS activity.

**Acceptance Criteria:**

**Given** invoices exist across statuses and periods
**When** filters/search/sort are applied
**Then** list results are scoped to authorized tenant/outlet rules with stable pagination

**Given** a user opens invoice detail from list
**When** detail loads
**Then** it shows customer, lines, totals, payments, outstanding balance, and journal links

**Given** invoices are voided/canceled/adjusted
**When** history is viewed
**Then** those states remain visible with clear reason and timestamps for auditability
**And** records are never silently removed from operational history

**Given** summary totals are shown in list views
**When** filtered dataset changes
**Then** displayed totals reconcile with visible records and preserve decimal precision

**Given** unauthorized access is attempted
**When** another tenant's invoice id/reference is queried
**Then** access is denied without metadata leakage

