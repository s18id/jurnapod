## Epic 5: Accounting and Journal Operations

Accounting users can post business events to GL, create journals, and maintain ledger integrity.

### Story 5.1: Automatic POS-to-Journal Posting
As a finance owner,
I want each finalized POS sale to create journal entries automatically,
So that the ledger is always up to date without manual re-entry.

**Acceptance Criteria:**

**Given** a POS transaction is finalized in company/outlet scope and has a unique `client_tx_id`
**When** posting is triggered
**Then** exactly one journal batch is created for that business event (idempotent by source reference)
**And** the batch is linked to the POS transaction with immutable source metadata (document id, outlet, cashier, posted_at)

**Given** posting creates journal lines
**When** lines are persisted
**Then** total debits equal total credits using deterministic decimal math
**And** no `FLOAT`/`DOUBLE` values are used for money fields

**Given** an infrastructure or validation failure occurs during posting
**When** the transaction boundary completes
**Then** all posting writes are rolled back atomically
**And** no partial batch, orphan lines, or half-linked source references remain

**Given** a replay/retry arrives for the same source POS transaction
**When** posting is re-invoked
**Then** the system returns the existing posting result without creating duplicate batches or lines

**Given** posting succeeds or fails
**When** audit is recorded
**Then** audit logs contain actor/system identity, source reference, outcome, and error class (if failed)
**And** logs exclude sensitive payload data and preserve tenant isolation

### Story 5.2: Manual Journal Entry Creation
As an accountant,
I want to create manual journal entries,
So that I can record non-POS financial adjustments.

**Acceptance Criteria:**

**Given** an authorized accounting user submits a manual journal payload
**When** validation runs
**Then** account ids, company scope, posting date, and line schema are validated before write
**And** cross-company or unauthorized account references are rejected

**Given** journal lines are valid
**When** totals are computed
**Then** debit total must equal credit total exactly at configured precision
**And** zero-value or logically invalid lines are rejected with clear validation messages

**Given** the entry passes validation
**When** posting is committed
**Then** batch header, lines, and source metadata are persisted in one atomic database transaction
**And** the resulting batch status is `POSTED` only after all writes succeed

**Given** posting fails at any point
**When** commit is attempted
**Then** no journal header/line artifacts are left behind
**And** the API returns a consistent error envelope with a recoverable message

**Given** a manual journal is posted
**When** audit is queried
**Then** audit records include actor, reason/narration, account set, and timestamp
**And** subsequent edits to posted lines are blocked by immutability rules

### Story 5.3: Journal Batch History and Detail View
As an accountant,
I want to browse journal batch history and inspect details,
So that I can trace financial changes over time.

**Acceptance Criteria:**

**Given** journal batches exist for a tenant
**When** the user opens history
**Then** list results are filtered strictly by authorized company (and outlet, where applicable)
**And** each row shows batch id, posting date, source type/reference, status, totals, and creator

**Given** a user opens a batch detail
**When** detail is loaded
**Then** header and line data reconcile (sum of lines equals batch totals)
**And** source-link navigation to originating document is available when reference exists

**Given** filters/pagination are applied
**When** the user navigates pages
**Then** ordering and pagination are stable and deterministic
**And** no records are skipped or duplicated between pages under the same filter set

**Given** unauthorized access is attempted
**When** a user requests another tenant's batch id
**Then** access is denied without leaking batch existence or metadata

**Given** history/detail views are used for audit workflows
**When** exported/printed values are reviewed
**Then** displayed monetary values retain ledger precision and sign conventions consistently

### Story 5.4: Journal Correction via Reversal/Adjustment Flow
As a finance admin,
I want corrections to happen through explicit reversal/adjustment entries,
So that finalized journals remain immutable and auditable.

**Acceptance Criteria:**

**Given** a posted journal requires correction
**When** an authorized user initiates correction
**Then** the original posted batch remains immutable
**And** correction is performed only through linked reversal and/or adjustment entries

**Given** a full reversal is selected
**When** reversal is posted
**Then** new lines mirror original accounts with opposite debit/credit directions and equal amounts
**And** reversal metadata links to the original batch id and correction reason code

**Given** an adjustment is selected
**When** adjustment is posted
**Then** only net corrective impact is posted in a new batch
**And** the chain original -> reversal/adjustment remains queryable end-to-end

**Given** required correction reason/reference fields are missing
**When** correction is submitted
**Then** the request is rejected before any write occurs

**Given** correction posting succeeds or fails
**When** audit is reviewed
**Then** audit includes actor, correction type, reason, linked batch ids, and outcome
**And** duplicate correction requests for the same action are handled idempotently

