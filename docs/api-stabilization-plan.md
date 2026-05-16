# Jurnapod API Stabilization Plan — Phase 1–4

**Status:** Draft  
**Scope:** API contract stabilization before declaring the API release-stable  
**Target state:** Move from **pilot-stable** to **release-stable candidate**  
**Primary API areas:** Auth, POS sync, sales, purchasing, accounting/reporting, import/export, settings, inventory, tenant/outlet ACL

---

## Stability Goal

The API should be considered **release-stable** only when:

1. Stable endpoints are explicitly classified and documented.
2. A contract baseline exists and can be diffed in CI.
3. Critical workflows pass a smoke pack against a fresh migrated database.
4. High-risk contracts are hardened around sync, auth, errors, datetime, and money.
5. Future breaking changes are detectable and intentionally approved.

---

# Phase 1 — Define What “Stable” Means

## Objective

Create a clear API stability boundary so the team does not accidentally promise stability for every endpoint.

The goal is to classify each endpoint as:

| Stability Level | Meaning | Breaking Changes Allowed? |
|---|---|---|
| `stable` | Safe for production clients and internal app contracts | No, unless versioned or explicitly migrated |
| `beta` | Usable internally, but still allowed to change | Yes, with release notes |
| `internal` | Not part of the client-facing contract | Yes |
| `deprecated` | Still available, but scheduled for removal | Only for removal timeline / compatibility |

---

## Deliverable

Create:

```text
docs/api-stability-matrix.md
```

---

## Endpoint Classification Rules

Classify an endpoint as **stable** only if all are true:

- The endpoint is used by POS, backoffice, accounting workflows, or production operations.
- Request and response shapes are documented.
- Auth and role requirements are explicit.
- Error response shape is predictable.
- Tenant and outlet boundaries are enforced where applicable.
- Tests or smoke checks cover the main behavior.
- The endpoint is not known to be a temporary adapter, stub, or migration bridge.

Classify an endpoint as **beta** if:

- It is usable but still under active design.
- The response schema may still change.
- It is admin-facing or backoffice-only and not yet contract-frozen.
- It has partial OpenAPI coverage but weak workflow coverage.

Classify an endpoint as **internal** if:

- It is only for metrics, runbooks, debugging, internal dashboards, or development.
- It is not intended for POS/backoffice client contracts.
- It should not be documented as public API.

Classify an endpoint as **deprecated** if:

- A replacement exists.
- Clients should stop using it.
- Removal requires a planned migration window.

---

## Stable Candidate Endpoint Groups

Initial stable candidates:

| Group | Candidate Stability | Notes |
|---|---:|---|
| Auth | `stable` | Login, refresh, logout/session behavior |
| POS sync pull | `stable` | Core offline-first contract |
| POS sync push | `stable` | Highest-risk contract; must be locked down |
| Dine-in sessions | `stable` | If actively used by POS |
| Sales invoices | `stable` | Accounting-facing workflow |
| Sales payments | `stable` | Financial correctness critical |
| Purchasing suppliers / PO / GRN / invoices / payments | `stable` | AP lifecycle critical |
| Reports | `stable` | Trial balance, GL, P&L, journals |
| Import/export | `stable` or `beta` | Stable if UI depends on current contract |
| Settings modules/config/tax rates | `stable` or `beta` | Stable for required setup flows |
| Inventory item/price master data | `stable` | Required by POS sync |
| Admin dashboards | `internal` or `beta` | Do not freeze too early |
| Metrics / health / runbook endpoints | `internal` | Operational, not client contract |

---

## Stability Matrix Template

Use this structure in `docs/api-stability-matrix.md`:

```markdown
# API Stability Matrix

| Method | Path | Stability | Owner | Client(s) | Auth Required | Role / Permission | Request Contract | Response Contract | Idempotency | Pagination / Cursor | Notes |
|---|---|---|---|---|---:|---|---|---|---|---|---|
| POST | /api/auth/login | stable | API/Auth | Backoffice, POS | No | Public | LoginRequest | LoginResponse | No | N/A | Must keep token shape stable |
| GET | /api/sync/pull | stable | API/Sync | POS | Yes | pos:read / outlet access | SyncPullQuery | SyncPullResponse | N/A | since_version | Core POS contract |
| POST | /api/sync/push | stable | API/Sync | POS | Yes | pos:transactions:create / outlet access | SyncPushRequest | SyncPushResponse | client_tx_id | N/A | Highest-risk endpoint |
```

---

## Phase 1 Task Checklist

### Inventory endpoints

- [ ] Export or list all registered Hono routes.
- [ ] Compare route list with `docs/API.md`.
- [ ] Compare route list with `/swagger.json`.
- [ ] Identify undocumented routes.
- [ ] Identify documented routes that no longer exist.
- [ ] Identify duplicate or legacy route paths.

### Classify endpoints

- [ ] Mark each endpoint as `stable`, `beta`, `internal`, or `deprecated`.
- [ ] Assign an owner for each endpoint group.
- [ ] Identify which client uses each endpoint: POS, backoffice, reporting, admin, external.
- [ ] Mark which endpoints are tenant-scoped.
- [ ] Mark which endpoints are outlet-scoped.
- [ ] Mark which endpoints require idempotency.

### Confirm contract metadata

- [ ] Request schema exists.
- [ ] Response schema exists.
- [ ] Auth rule is documented.
- [ ] Error codes are documented.
- [ ] Pagination or cursor behavior is documented.
- [ ] Idempotency behavior is documented where applicable.
- [ ] Known breaking-change risk is documented.

---

## Phase 1 Exit Gate

Phase 1 is complete when:

- [ ] `docs/api-stability-matrix.md` exists.
- [ ] Every route is classified.
- [ ] Every `stable` route has an owner.
- [ ] Every `stable` route has documented auth, request, response, and error behavior.
- [ ] All undocumented `stable` routes are added to the docs backlog.
- [ ] All questionable endpoints are downgraded to `beta` or `internal`.

---

# Phase 2 — Freeze the Contract Baseline

## Objective

Create a versioned API contract snapshot so future breaking changes can be detected before merge.

---

## Deliverables

Create:

```text
docs/api-contracts/openapi-0.3-stability-baseline.json
docs/api-contracts/CHANGELOG.md
docs/api-contracts/stable-endpoints.json
scripts/check-api-contract-diff.ts
```

Optional package script:

```json
{
  "scripts": {
    "lint:api-contracts": "tsx scripts/check-api-contract-diff.ts"
  }
}
```

---

## Contract Baseline Process

### Step 1 — Generate OpenAPI baseline

Generate or fetch the current OpenAPI document from the non-production API:

```bash
curl http://localhost:3001/swagger.json \
  > docs/api-contracts/openapi-0.3-stability-baseline.json
```

If the API is not running, use the OpenAPI aggregator directly through a script.

---

### Step 2 — Define stable endpoints list

Create:

```text
docs/api-contracts/stable-endpoints.json
```

Example:

```json
{
  "version": "0.3-stability-baseline",
  "stableEndpoints": [
    "POST /api/auth/login",
    "POST /api/auth/refresh",
    "GET /api/sync/pull",
    "POST /api/sync/push",
    "GET /api/reports/trial-balance",
    "GET /api/reports/general-ledger",
    "GET /api/reports/profit-loss",
    "POST /api/sales/invoices",
    "POST /api/sales/invoices/{id}/post",
    "POST /api/sales/payments",
    "POST /api/sales/payments/{id}/post",
    "POST /api/purchasing/orders",
    "POST /api/purchasing/goods-receipts",
    "POST /api/purchasing/invoices",
    "POST /api/purchasing/payments",
    "POST /api/import/{entityType}/upload",
    "POST /api/import/{entityType}/validate",
    "POST /api/import/{entityType}/apply",
    "POST /api/export/{entityType}"
  ]
}
```

---

### Step 3 — Add contract changelog

Create:

```text
docs/api-contracts/CHANGELOG.md
```

Template:

```markdown
# API Contract Changelog

## 0.3 Stability Baseline

Baseline created for pilot-to-release stabilization.

### Stable Contract Rules

Breaking changes to stable endpoints require:

1. A changelog entry.
2. Migration notes.
3. Approval from API owner.
4. Versioning decision.

### Breaking Changes

None yet.

### Additive Changes

None yet.

### Deprecated Endpoints

None yet.
```

---

## What Counts as a Breaking Change?

For `stable` endpoints, the following are breaking:

| Change | Breaking? |
|---|---:|
| Remove endpoint | Yes |
| Change method | Yes |
| Change path | Yes |
| Remove request field support | Yes |
| Make optional field required | Yes |
| Rename request field | Yes |
| Rename response field | Yes |
| Remove response field | Yes |
| Change response field type | Yes |
| Change enum meaning | Yes |
| Remove enum value | Yes |
| Change success status code | Usually yes |
| Change error code | Yes |
| Change idempotency behavior | Yes |
| Change pagination/cursor behavior | Yes |
| Tighten validation | Usually yes |
| Add optional request field | No |
| Add response field | Usually no |
| Add new endpoint | No |
| Add enum value | Maybe; depends on clients |

---

## Contract Diff Check Requirements

The contract diff script should:

- Load the baseline OpenAPI JSON.
- Load the current generated OpenAPI JSON.
- Load `stable-endpoints.json`.
- Compare only stable endpoints.
- Fail on breaking changes.
- Warn on additive changes.
- Require a changelog entry for any stable endpoint change.

Pseudo-rules:

```text
For each stable endpoint:
  - method + path must exist
  - request body schema must not remove fields
  - required fields must not increase without approval
  - response schema must not remove fields
  - response field types must not change
  - documented status codes must not disappear
  - auth/security metadata must not disappear
```

---

## Phase 2 Task Checklist

### Baseline creation

- [ ] Generate `/swagger.json`.
- [ ] Save baseline OpenAPI JSON.
- [ ] Create `stable-endpoints.json`.
- [ ] Create API contract changelog.
- [ ] Add baseline generation instructions.

### Documentation reconciliation

- [ ] Compare `docs/API.md` to baseline OpenAPI.
- [ ] Fix missing endpoint docs.
- [ ] Fix stale endpoint docs.
- [ ] Fix request/response mismatches.
- [ ] Fix documented error code mismatches.
- [ ] Mark beta/internal endpoints clearly.

### CI protection

- [ ] Add contract diff script.
- [ ] Add npm script.
- [ ] Add CI job or include in existing lint gate.
- [ ] Require changelog entry for stable endpoint changes.
- [ ] Allow explicit override only with approval.

---

## Phase 2 Exit Gate

Phase 2 is complete when:

- [ ] OpenAPI baseline is committed.
- [ ] Stable endpoints list is committed.
- [ ] Contract changelog exists.
- [ ] Stable endpoint changes are detectable.
- [ ] CI fails on unapproved breaking changes.
- [ ] `docs/API.md` matches the stable contract baseline.

---

# Phase 3 — Run the Stable API Smoke Pack

## Objective

Prove the real production workflows end-to-end against a fresh migrated database.

This smoke pack is not a replacement for integration tests. It is a **release gate** that verifies the API behaves correctly from the perspective of POS, backoffice, and accounting workflows.

---

## Deliverable

Create:

```text
apps/api/__test__/smoke/stable-api-smoke.test.ts
```

Optional package script:

```json
{
  "scripts": {
    "test:smoke:stable-api": "vitest run __test__/smoke/stable-api-smoke.test.ts"
  }
}
```

Optional root script:

```json
{
  "scripts": {
    "test:api:stable-smoke": "npm run test:smoke:stable-api -w @jurnapod/api"
  }
}
```

---

## Smoke Test Environment

The smoke pack must run against:

- Fresh migrated database.
- Seeded company.
- Seeded owner/admin user.
- Seeded outlet.
- Seeded POS cashier.
- Seeded chart of accounts.
- Seeded fiscal year and open period.
- Seeded POS master data.
- Seeded tax/account mappings.

Required setup sequence:

```bash
npm run db:migrate
npm run db:seed
npm run db:seed:test-data
npm run db:smoke
npm run test:api:stable-smoke
```

---

## Smoke Flow 1 — Auth

### Purpose

Confirm clients can authenticate and unauthorized requests are blocked.

### Checks

- [ ] Login succeeds with valid owner/admin credentials.
- [ ] Login fails with invalid credentials.
- [ ] Protected endpoint without token returns `401`.
- [ ] Protected endpoint with malformed token returns `401`.
- [ ] Auth response includes access token.
- [ ] User payload includes company identity.

### Required endpoints

```http
POST /api/auth/login
```

---

## Smoke Flow 2 — POS Sync Pull

### Purpose

Confirm POS can pull master data for an outlet.

### Checks

- [ ] Pull succeeds for authorized cashier.
- [ ] Pull rejects unauthorized outlet.
- [ ] Response includes current sync version.
- [ ] Response includes items.
- [ ] Response includes prices.
- [ ] Response includes tax rates/defaults if configured.
- [ ] `since_version` behavior returns deterministic payload.
- [ ] Datetimes are RFC3339-compatible where returned.

### Required endpoint

```http
GET /api/sync/pull?outlet_id={outletId}&since_version=0
```

---

## Smoke Flow 3 — POS Sync Push

### Purpose

Confirm POS can push completed offline transactions safely and idempotently.

### Checks

- [ ] Push succeeds for valid transaction.
- [ ] Duplicate push with same `client_tx_id` returns duplicate/idempotent result.
- [ ] Result order matches input order.
- [ ] Invalid `client_tx_id` returns validation error.
- [ ] Wrong outlet returns forbidden.
- [ ] Transaction creates expected server-side record.
- [ ] Stock deduction happens where applicable.
- [ ] GL posting happens where applicable.
- [ ] Push response uses stable success/error envelope.

### Required endpoint

```http
POST /api/sync/push
```

### Minimum idempotency assertions

```text
Given a transaction with client_tx_id = X
When it is pushed once
Then result is OK

When the same payload is pushed again
Then result is DUPLICATE or equivalent idempotent success

When the same client_tx_id is reused with conflicting payload
Then result is ERROR or CONFLICT according to documented contract
```

---

## Smoke Flow 4 — POS Correction

### Purpose

Confirm correction flows do not corrupt revenue, inventory, or GL.

### Checks

- [ ] VOID or REFUND request is accepted only for valid original transaction.
- [ ] Correction is rejected for invalid lifecycle transition.
- [ ] Correction creates reversal journal where required.
- [ ] Correction is idempotent.
- [ ] Corrected transaction remains auditable.
- [ ] Finalized transaction immutability rules are enforced.

### Required endpoint

```http
POST /api/sync/push
```

---

## Smoke Flow 5 — Sales Invoice and Payment

### Purpose

Confirm AR workflow from invoice creation to payment posting.

### Checks

- [ ] Create invoice succeeds.
- [ ] Post invoice succeeds.
- [ ] Posted invoice creates GL journal.
- [ ] Create payment succeeds.
- [ ] Post payment succeeds.
- [ ] Invoice open amount updates correctly.
- [ ] Overpayment/underpayment behavior matches documented contract.
- [ ] Closed fiscal period blocks posting.
- [ ] Wrong company/outlet access is forbidden.

### Candidate endpoints

```http
POST /api/sales/invoices
POST /api/sales/invoices/{id}/post
POST /api/sales/payments
POST /api/sales/payments/{id}/post
```

---

## Smoke Flow 6 — Purchasing Lifecycle

### Purpose

Confirm AP workflow from supplier to payment.

### Checks

- [ ] Create supplier succeeds.
- [ ] Create purchase order succeeds.
- [ ] Receive goods succeeds.
- [ ] Create purchase invoice succeeds.
- [ ] Post purchase invoice succeeds.
- [ ] Create AP payment succeeds.
- [ ] Post AP payment succeeds.
- [ ] AP open amount updates correctly.
- [ ] Journal batches are balanced.
- [ ] Closed fiscal period blocks posting.
- [ ] Tenant isolation is enforced.

### Candidate endpoints

```http
POST /api/purchasing/suppliers
POST /api/purchasing/orders
POST /api/purchasing/goods-receipts
POST /api/purchasing/invoices
POST /api/purchasing/invoices/{id}/post
POST /api/purchasing/payments
POST /api/purchasing/payments/{id}/post
```

---

## Smoke Flow 7 — Reports

### Purpose

Confirm accounting reports respond and reflect posted activity.

### Checks

- [ ] Trial balance returns success.
- [ ] General ledger returns success.
- [ ] Profit and loss returns success.
- [ ] Journal report returns success.
- [ ] Reports respect company scope.
- [ ] Reports reject unauthorized users.
- [ ] Report totals are internally consistent for smoke-created transactions.

### Required endpoints

```http
GET /api/reports/trial-balance
GET /api/reports/general-ledger
GET /api/reports/profit-loss
GET /api/reports/journals
```

---

## Smoke Flow 8 — Import / Export

### Purpose

Confirm bulk data operations work with stable contracts.

### Checks

- [ ] Download import template succeeds.
- [ ] Upload CSV/XLSX succeeds.
- [ ] Validate mapped data succeeds.
- [ ] Apply import succeeds.
- [ ] Invalid import returns row-level errors.
- [ ] Export CSV succeeds.
- [ ] Export selected columns succeeds.
- [ ] Large export guardrails return documented errors.

### Candidate endpoints

```http
GET /api/import/{entityType}/template
POST /api/import/{entityType}/upload
POST /api/import/{entityType}/validate
POST /api/import/{entityType}/apply
POST /api/export/{entityType}
GET /api/export/{entityType}/columns
```

---

## Smoke Flow 9 — Tenant and Outlet ACL

### Purpose

Confirm data leakage is blocked.

### Checks

- [ ] Company A user cannot read Company B data.
- [ ] User without outlet access cannot access outlet-scoped data.
- [ ] Cashier cannot perform accountant/admin-only actions.
- [ ] Accountant cannot perform owner-only admin actions.
- [ ] Forbidden response is consistent.
- [ ] No leaked entity metadata appears in forbidden/not-found responses.

---

## Smoke Flow 10 — Error Envelope

### Purpose

Confirm stable clients can parse errors consistently.

### Required error cases

| Case | Expected Status |
|---|---:|
| Missing token | `401` |
| Invalid token | `401` |
| Missing required field | `400` |
| Invalid field type | `400` |
| Forbidden outlet | `403` |
| Entity not found | `404` |
| Conflict / duplicate / lifecycle violation | `409` |
| Invalid business state | `400` or `409`, according to contract |

### Expected shape

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data"
  }
}
```

---

## Phase 3 Task Checklist

### Test creation

- [ ] Create stable API smoke test file.
- [ ] Add helper for login and authenticated requests.
- [ ] Add fixture setup for company/outlet/user/accounts.
- [ ] Add helper for asserting standard success response.
- [ ] Add helper for asserting standard error response.
- [ ] Add deterministic `client_tx_id` generator.
- [ ] Add cleanup or isolated fixture strategy.

### Flow coverage

- [ ] Auth smoke flow.
- [ ] Sync pull smoke flow.
- [ ] Sync push smoke flow.
- [ ] POS correction smoke flow.
- [ ] Sales invoice/payment smoke flow.
- [ ] Purchasing lifecycle smoke flow.
- [ ] Reports smoke flow.
- [ ] Import/export smoke flow.
- [ ] Tenant/outlet ACL smoke flow.
- [ ] Error envelope smoke flow.

### CI integration

- [ ] Add npm script.
- [ ] Add CI job for stable smoke pack.
- [ ] Run against MySQL 8.
- [ ] Run against MariaDB.
- [ ] Upload smoke logs as artifacts.
- [ ] Fail release candidate if smoke pack fails.

---

## Phase 3 Exit Gate

Phase 3 is complete when:

- [ ] Stable smoke pack exists.
- [ ] Smoke pack passes locally.
- [ ] Smoke pack passes in CI on MySQL 8.
- [ ] Smoke pack passes in CI on MariaDB.
- [ ] Failures are deterministic and actionable.
- [ ] Smoke logs are available as CI artifacts.

---

# Phase 4 — Harden the Highest-Risk Contracts

## Objective

Lock down the contracts most likely to cause data loss, accounting errors, security issues, or client breakage.

Priority order:

1. POS sync push/pull
2. Auth and ACL
3. Error response format
4. Datetime and money handling
5. Contract documentation and examples

---

# Phase 4A — Harden POS Sync Pull / Push

## Why This Is Highest Risk

POS sync is the core offline-first contract. If it breaks:

- Offline sales may not reach the server.
- GL posting may be incomplete.
- Inventory deductions may be missing.
- Duplicate transactions may be recorded.
- Cashier operations may appear successful locally but fail centrally.

---

## Sync Contract Rules

### `client_tx_id`

Rules:

- Required for every pushed transaction.
- Must be globally unique per client operation.
- Must be idempotency key for retry.
- Same `client_tx_id` + same payload must not create duplicate records.
- Same `client_tx_id` + conflicting payload must not silently succeed.
- Validation error must be stable and documented.

Checklist:

- [ ] Missing `client_tx_id` returns stable validation error.
- [ ] Invalid `client_tx_id` returns stable validation error.
- [ ] Duplicate transaction is idempotent.
- [ ] Conflicting duplicate is rejected.
- [ ] Cross-tenant duplicate does not collide.
- [ ] Cross-outlet duplicate behavior is documented.

---

### Result ordering

Rules:

- Response results must map to input order.
- Partial failures must not reorder results.
- Each result must include enough client correlation data.

Checklist:

- [ ] Multi-transaction push preserves result order.
- [ ] Mixed OK/DUPLICATE/ERROR responses preserve order.
- [ ] Empty push returns stable empty response.
- [ ] Unknown result states are normalized or documented.

---

### Transaction atomicity

Rules:

- Each transaction must be atomic.
- One transaction failure must not corrupt another.
- DB transaction boundaries must be documented.
- Posting side effects must be all-or-nothing per transaction.

Checklist:

- [ ] Header insert failure rolls back lines.
- [ ] Line insert failure rolls back header.
- [ ] Posting failure rolls back transaction where required.
- [ ] Stock deduction failure rolls back transaction where required.
- [ ] Partial batch failure leaves successful transactions valid and failed transactions clean.

---

### Sync concurrency

Rules:

- Concurrency must have safe default.
- Production rollout must start conservatively.
- Max concurrency must be capped.
- Order-sensitive operations should remain sequential where needed.

Checklist:

- [ ] Default concurrency documented.
- [ ] Max concurrency documented.
- [ ] Production recommended value documented.
- [ ] DB pool impact documented.
- [ ] Deadlock retry behavior documented.
- [ ] Sequential operations are identified.

---

### Sync observability

Checklist:

- [ ] Log correlation ID.
- [ ] Log company ID.
- [ ] Log outlet ID.
- [ ] Record push latency.
- [ ] Record OK count.
- [ ] Record duplicate count.
- [ ] Record error count.
- [ ] Classify error reason.
- [ ] Emit metrics for sync failure rate.
- [ ] Emit metrics for duplicate rate.

---

## Phase 4A Deliverable

Create:

```text
docs/api-contracts/sync-contract.md
```

Suggested outline:

```markdown
# POS Sync API Contract

## Endpoints

- GET /api/sync/pull
- POST /api/sync/push

## Idempotency

## Result Ordering

## Atomicity

## Error Codes

## Retry Rules

## Concurrency Rules

## Observability

## Breaking Change Policy
```

---

# Phase 4B — Harden Auth and ACL

## Objective

Ensure stable endpoints cannot leak data across tenants, outlets, roles, or modules.

---

## Auth Rules

Every `stable` endpoint must declare:

| Field | Required |
|---|---:|
| Public or protected | Yes |
| Required role(s) | Yes |
| Required module permission | Yes, where applicable |
| Company scope | Yes |
| Outlet scope | Yes, where applicable |
| Resource-level permission | Yes, where applicable |

---

## ACL Checklist

- [ ] All stable routes have explicit auth behavior.
- [ ] All protected routes reject missing token.
- [ ] All protected routes reject invalid token.
- [ ] All company-scoped queries filter by `company_id`.
- [ ] All outlet-scoped queries validate outlet access.
- [ ] All role-restricted actions reject insufficient role.
- [ ] All resource-level ACL routes test both allow and deny.
- [ ] Forbidden responses do not leak data.
- [ ] Not-found responses do not reveal cross-tenant existence.
- [ ] Admin/internal endpoints are not accidentally exposed as stable.

---

## Required Negative Tests

For each stable endpoint group:

| Test | Required |
|---|---:|
| Missing token returns `401` | Yes |
| Invalid token returns `401` | Yes |
| Wrong company returns `403` or safe `404` | Yes |
| Wrong outlet returns `403` | Yes |
| Insufficient role returns `403` | Yes |
| Deactivated user behavior documented | Yes |
| Deactivated cashier sync behavior documented | Yes, for POS |

---

## Phase 4B Deliverable

Create:

```text
docs/api-contracts/auth-acl-contract.md
```

Suggested outline:

```markdown
# Auth and ACL Contract

## Auth Model

## Role Model

## Module Permission Model

## Company Scoping

## Outlet Scoping

## Resource-Level ACL

## Error Codes

## Negative Test Requirements

## Breaking Change Policy
```

---

# Phase 4C — Harden Error Response Format

## Objective

Make stable client error handling predictable.

---

## Standard Error Envelope

All stable endpoints should return:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": []
  }
}
```

`details` may be omitted only if the contract explicitly allows it.

---

## Standard Success Envelope

All stable JSON endpoints should return one of:

```json
{
  "success": true,
  "data": {}
}
```

or:

```json
{
  "success": true,
  "data": [],
  "meta": {}
}
```

For legacy endpoints that do not use this shape, document the exception or normalize before declaring stable.

---

## Standard Error Codes

| Code | Meaning | Typical Status |
|---|---|---:|
| `VALIDATION_ERROR` | Invalid request shape or field | `400` |
| `INVALID_REQUEST` | Business-level invalid request | `400` |
| `UNAUTHORIZED` | Missing or invalid auth | `401` |
| `FORBIDDEN` | Authenticated but not allowed | `403` |
| `NOT_FOUND` | Entity not found or safely hidden | `404` |
| `CONFLICT` | Optimistic lock, duplicate, state conflict | `409` |
| `INVALID_TRANSITION` | Lifecycle transition not allowed | `409` |
| `PERIOD_CLOSED` | Fiscal period blocks operation | `400` or `409` |
| `FISCAL_YEAR_CLOSED` | Fiscal year blocks operation | `400` or `409` |
| `INTERNAL_SERVER_ERROR` | Unexpected server failure | `500` |

---

## Error Hardening Checklist

- [ ] All stable endpoints use standard error envelope.
- [ ] All stable endpoints use standard success envelope or documented exception.
- [ ] Zod validation errors are normalized.
- [ ] Auth errors are normalized.
- [ ] ACL errors are normalized.
- [ ] Conflict errors are normalized.
- [ ] Fiscal period/year errors are normalized.
- [ ] Internal errors do not expose stack traces.
- [ ] Cross-tenant errors do not leak entity existence.
- [ ] Error examples exist in docs.

---

## Phase 4C Deliverable

Create:

```text
docs/api-contracts/error-contract.md
```

Suggested outline:

```markdown
# API Error Contract

## Success Envelope

## Error Envelope

## Error Code Registry

## HTTP Status Mapping

## Validation Errors

## Auth Errors

## Conflict Errors

## Fiscal Period Errors

## Security / Non-Leakage Rules

## Breaking Change Policy
```

---

# Phase 4D — Harden Datetime and Money Contracts

## Objective

Prevent client breakage and accounting bugs from inconsistent datetime or money formats.

---

## Datetime Rules

Stable API datetime fields must use:

```text
RFC3339 / ISO 8601 with timezone
```

Preferred format:

```text
2026-03-19T10:00:00.000Z
```

Rules:

- Response datetimes must include timezone.
- Request datetimes must document accepted timezone behavior.
- Date-only fields must be documented as date-only.
- Jakarta-local business dates must be clearly distinguished from UTC instants.
- Cursor timestamps must be stable and monotonic where applicable.

Checklist:

- [ ] All stable response datetimes use RFC3339.
- [ ] All stable request datetime fields document timezone handling.
- [ ] Date-only fields are not confused with instants.
- [ ] Fiscal/reporting date ranges define inclusivity.
- [ ] POS timestamps define canonical storage and response format.

---

## Money Rules

Rules:

- Persisted financial values must never use floating-point storage.
- API request/response money format must be consistent per endpoint.
- Rounding rules must be documented.
- Currency behavior must be documented.
- Multi-currency base/original amount behavior must be documented.

Preferred contract:

```json
{
  "amount": "100000.00",
  "currency": "IDR"
}
```

If numeric values are currently returned, document them and avoid changing without versioning.

Checklist:

- [ ] Money fields are documented as string or number.
- [ ] Decimal precision is documented.
- [ ] Rounding behavior is documented.
- [ ] Currency fields are documented.
- [ ] FX fields are documented.
- [ ] Base/original amount behavior is documented.
- [ ] Reports and journals use consistent money representation.

---

## Phase 4D Deliverable

Create:

```text
docs/api-contracts/datetime-money-contract.md
```

Suggested outline:

```markdown
# Datetime and Money API Contract

## Datetime Format

## Date-Only Fields

## Timezone Rules

## Reporting Date Range Rules

## Money Format

## Decimal Precision

## Rounding

## Currency and FX Rules

## Breaking Change Policy
```

---

# Phase 4E — Stable Contract Rules

## Objective

Create one concise document that defines what future contributors may or may not change.

---

## Deliverable

Create:

```text
docs/api-contracts/stable-contract-rules.md
```

---

## Suggested Content

```markdown
# Stable API Contract Rules

## Allowed Without Version Bump

- Add a new endpoint.
- Add an optional request field.
- Add a response field, unless the endpoint documents strict response shape.
- Add a new error detail field.
- Relax validation.
- Add a new beta endpoint.

## Requires Contract Changelog

- Add a new enum value.
- Add a new documented error code.
- Change an undocumented endpoint to stable.
- Deprecate a stable endpoint.
- Add pagination to a previously unpaginated stable endpoint.

## Requires Versioning or Migration Plan

- Remove endpoint.
- Rename endpoint.
- Change HTTP method.
- Remove request field.
- Make optional request field required.
- Rename request field.
- Remove response field.
- Rename response field.
- Change response field type.
- Change success status code.
- Change error code.
- Change idempotency behavior.
- Change tenant or outlet scoping.
- Change datetime format.
- Change money format.
- Change pagination or cursor semantics.
```

---

## Phase 4 Task Checklist

### Sync

- [ ] Create `sync-contract.md`.
- [ ] Lock down `client_tx_id` behavior.
- [ ] Lock down duplicate/conflict behavior.
- [ ] Lock down result ordering.
- [ ] Lock down partial failure semantics.
- [ ] Document concurrency rules.
- [ ] Add missing sync negative tests.

### Auth / ACL

- [ ] Create `auth-acl-contract.md`.
- [ ] Audit every stable endpoint for auth behavior.
- [ ] Add missing ACL negative tests.
- [ ] Confirm cross-tenant non-leakage behavior.
- [ ] Confirm outlet access behavior.

### Errors

- [ ] Create `error-contract.md`.
- [ ] Define error code registry.
- [ ] Normalize validation errors.
- [ ] Normalize auth errors.
- [ ] Normalize conflict errors.
- [ ] Normalize fiscal errors.
- [ ] Add examples to `docs/API.md`.

### Datetime / Money

- [ ] Create `datetime-money-contract.md`.
- [ ] Audit all stable datetime fields.
- [ ] Audit all stable money fields.
- [ ] Document timezone behavior.
- [ ] Document rounding behavior.
- [ ] Document FX/base/original amount behavior.

### Stable change policy

- [ ] Create `stable-contract-rules.md`.
- [ ] Link rules from `docs/API.md`.
- [ ] Link rules from PR template or contribution docs.
- [ ] Add CI reminder for contract changes.

---

## Phase 4 Exit Gate

Phase 4 is complete when:

- [ ] Sync contract is documented and tested.
- [ ] Auth/ACL contract is documented and tested.
- [ ] Error contract is documented and tested.
- [ ] Datetime/money contract is documented.
- [ ] Stable contract change rules are documented.
- [ ] All stable endpoint docs link to the relevant contract rules.
- [ ] No P0/P1 gaps remain in stable API behavior.
- [ ] The stable smoke pack still passes after hardening changes.

---

# Phase 1–4 Completion Gate

Phases 1–4 are complete when all of the following are true:

| Gate | Required |
|---|---:|
| API stability matrix exists | Yes |
| All endpoints classified | Yes |
| Stable endpoint owners assigned | Yes |
| OpenAPI baseline committed | Yes |
| Stable endpoint list committed | Yes |
| API contract changelog committed | Yes |
| Contract diff check exists | Yes |
| Stable smoke pack exists | Yes |
| Stable smoke pack passes on MySQL | Yes |
| Stable smoke pack passes on MariaDB | Yes |
| Sync contract documented | Yes |
| Auth/ACL contract documented | Yes |
| Error contract documented | Yes |
| Datetime/money contract documented | Yes |
| Stable change policy documented | Yes |
| `docs/API.md` reconciled with implementation | Yes |

---

# Recommended Phase 1–4 Work Order

| Order | Task | Output |
|---:|---|---|
| 1 | Generate route inventory | Route list |
| 2 | Create stability matrix | `docs/api-stability-matrix.md` |
| 3 | Classify all endpoints | Stable / beta / internal / deprecated |
| 4 | Generate OpenAPI baseline | `openapi-0.3-stability-baseline.json` |
| 5 | Create stable endpoint list | `stable-endpoints.json` |
| 6 | Create contract changelog | `CHANGELOG.md` |
| 7 | Reconcile `docs/API.md` | Updated docs |
| 8 | Add contract diff script | `scripts/check-api-contract-diff.ts` |
| 9 | Add stable smoke pack | `stable-api-smoke.test.ts` |
| 10 | Harden sync contract | `sync-contract.md` |
| 11 | Harden auth/ACL contract | `auth-acl-contract.md` |
| 12 | Harden error contract | `error-contract.md` |
| 13 | Harden datetime/money contract | `datetime-money-contract.md` |
| 14 | Add stable change rules | `stable-contract-rules.md` |
| 15 | Run full Phase 1–4 gate | Release-stability readiness |

---

# Definition of Done

The API can move from **pilot-stable** to **release-stable candidate** when:

- The stable API surface is explicitly defined.
- Contract drift is protected by CI.
- Critical workflows pass end-to-end smoke tests.
- High-risk contracts are documented and tested.
- Future breaking changes require a deliberate versioning or migration decision.