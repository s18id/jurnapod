# Story 69-3-a: Accounting Contract + Fixture Readiness

Status: done

## Review Sign-Offs

- Backoffice unfreeze: Ahmad wrote `unfreeze` on 2026-05-19 for Story 69-3-a contract/fixture readiness work.
- QA re-review: Quinn GO on 2026-05-20 after confirming the P0 fiscal-year tenant leak fix, error-boundary matrix, validation evidence, and documented child blockers.
- Owner sign-off: Ahmad wrote `sign-off` on 2026-05-20.

## Story

As a **story owner preparing accounting UI work**,  
I want **verified accounting API contracts, ACL expectations, fixture ownership, and validation commands**,  
So that **later accounting screen stories can pass readiness review before implementation starts**.

## Scope

This story is a readiness and contract-verification slice only. It MUST NOT implement accounting screens. It MUST produce child-story-ready evidence for accounts, journals, fiscal years, and reports.

## Dependencies

- Story 69-1 (ReviewPanel staged forms) — MUST be complete.
- Epic 65 (Backoffice foundation, typed API client, TanStack Query patterns) — MUST be complete.
- Epic 66 (permission-aware navigation and ACL UX patterns) — MUST be complete.
- Epic 32 fiscal close backend — MUST be complete for close-flow verification.
- Explicit backoffice unfreeze authorization — MUST be recorded before any `apps/backoffice` implementation work in later child stories.

## Backoffice Unfreeze Gate

- [x] Explicit unfreeze authorization recorded by story owner — Ahmad wrote `unfreeze` on 2026-05-19.
- [x] Authorization scope includes Story 69-3-a evidence work and later child UI readiness for contract/fixture planning.
- [x] If authorization is absent, this story remains backlog and MUST NOT become ready-for-dev — authorization is now recorded for 69-3-a readiness work.

## Acceptance Criteria

**AC1: Accounting endpoint inventory verified**  
Given the existing accounting backend routes, when contract verification is performed, then all accounts, journals, fiscal years, and report endpoints needed by 69-3-b through 69-3-f are inventoried with method, path, request shape, response shape, auth resource, and error shape.

**AC2: ACL resource matrix verified**  
Given Epic 39 resource-level ACL, when accounting operations are mapped, then required permissions use explicit `accounting.accounts`, `accounting.journals`, `accounting.fiscal_years`, and `accounting.reports` resources with correct permission bits.

**AC3: Error boundary matrix completed**  
Given cross-package errors from accounting/auth/shared packages, when consumers map errors, then both `instanceof` and `error.name` fallback behavior are documented for closed-period, unbalanced-journal, validation, auth, and conflict errors.

**AC4: Fixture ownership plan completed**  
Given integration tests require accounting data, when fixture needs are reviewed, then canonical owner-package fixtures are identified or created in `@jurnapod/modules-accounting` and no app-layer parallel write path is introduced.

**AC5: Child story readiness blockers documented**  
Given the child split, when readiness review completes, then each child story has explicit contract gaps, blockers, and validation commands recorded.

## API Contract Verification Requirements

Before any child story becomes ready-for-dev, verify and record these endpoint facts using direct API calls or typed API client tests:

| Area | Endpoint(s) | Verification Required | Result |
|------|-------------|-----------------------|--------|
| Accounts | `GET /api/accounts`, `GET /api/accounts/tree`, `GET /api/accounts/:id`, `POST /api/accounts`, `PUT /api/accounts/:id`, `GET /api/accounts/types` | List/create/update/detail response envelopes, balance fields, active/inactive behavior, 400/401/403/404 errors | Verified by read-only contract inventory. `PATCH /api/accounts/:id` does not exist. Hierarchy uses `/tree`. Balance and journal-line history are not returned by account responses. |
| Journals | `GET /api/journals`, `POST /api/journals`, `GET /api/journals/:id` | Draft/create/post/void shapes, line schema, posted immutability, reversal link fields, conflict errors | Verified by read-only contract inventory. Draft, edit, post, and void endpoints do not exist. Current POST creates an immediate journal batch. |
| Fiscal years | `POST /api/accounts/fiscal-years`, `GET /api/accounts/fiscal-years`, `GET /api/accounts/fiscal-years/:id/status`, `GET /api/accounts/fiscal-years/:id/close-preview`, `POST /api/accounts/fiscal-years/:id/close`, `POST /api/accounts/fiscal-years/:id/close/approve` | Period/year list shape, close request reason, close response entries, elevated auth, closed-period conflicts | Verified by read-only contract inventory. Public path is `/api/accounts/fiscal-years`, not `/api/fiscal-years`. Close workflow is preview → initiate → approve. Tenant-list P0 was fixed in this story. |
| Reports | `GET /api/reports/trial-balance`, `GET /api/reports/general-ledger`, `GET /api/purchasing/reports/ap-aging`, `GET /api/purchasing/reports/ap-aging/:supplierId/detail`, `GET /api/reports/receivables-ageing`, `GET /api/reports/receivables-ageing/customer/:customerId` | Filter params, pagination, row schemas, totals, CSV/export path if present | Verified by read-only contract inventory. AP aging is under purchasing. AR aging path is `receivables-ageing`. No CSV/export endpoint was found for these reports. |

## Verified Contract Findings

### Accounts

| Method | Path | ACL | Contract Result |
|--------|------|-----|-----------------|
| GET | `/api/accounts` | `accounting.accounts.READ` | Returns `{ success: true, data: AccountResponse[] }`. Supports `is_active`, `is_payable`, `report_group`, `parent_account_id`, `search`, and `include_children`. No pagination and no balance fields. |
| GET | `/api/accounts/tree` | `accounting.accounts.READ` | Returns nested `AccountTreeNode[]`. This is the hierarchy source for Story 69-3-b. |
| GET | `/api/accounts/:id` | `accounting.accounts.READ` | Returns `{ success: true, data: AccountResponse }`; route was constrained to numeric IDs during P0 fix validation so `/fiscal-years` is not captured by account detail. |
| POST | `/api/accounts` | `accounting.accounts.CREATE` | Creates account; rejects cross-tenant `company_id` with `COMPANY_MISMATCH`. |
| PUT | `/api/accounts/:id` | `accounting.accounts.UPDATE` | Actual update route is PUT, not PATCH. Account update has P1 implementation risks listed below. |
| GET | `/api/accounts/types` | `accounting.accounts.READ` | Supports account type selector data. |

### Journals

| Method | Path | ACL | Contract Result |
|--------|------|-----|-----------------|
| GET | `/api/journals` | `accounting.journals.READ` | Lists posted journal batches with filters: `outlet_id`, `start_date`, `end_date`, `doc_type`, `account_id`, `limit`, `offset`. |
| POST | `/api/journals` | `accounting.journals.CREATE` | Creates an immediate journal batch. No draft state exists. Runtime Zod body parsing is missing. |
| GET | `/api/journals/:id` | `accounting.journals.READ` | Returns one journal batch. |

Draft, edit, post, and void journal endpoints are absent. Stories 69-3-c and 69-3-d MUST NOT become ready-for-dev until backend scope is corrected or those UI stories are rewritten to the current immediate-post journal model.

### Fiscal Years and Close

| Method | Path | ACL | Contract Result |
|--------|------|-----|-----------------|
| POST | `/api/accounts/fiscal-years` | `accounting.fiscal_years.CREATE` | Creates fiscal year and rejects cross-tenant create with `403 FORBIDDEN`. |
| GET | `/api/accounts/fiscal-years` | `accounting.fiscal_years.READ` | Lists authenticated tenant fiscal years. P0 tenant-list leak was fixed by rejecting mismatched `company_id` with `400 COMPANY_MISMATCH`. |
| GET | `/api/accounts/fiscal-years/:id/status` | `accounting.fiscal_years.READ` | Returns fiscal year status and synthetic period-like data. It does not expose real fiscal period rows. |
| GET | `/api/accounts/fiscal-years/:id/close-preview` | `accounting.fiscal_years.READ` | Returns close preview, net income, retained earnings account, and closing entries. |
| POST | `/api/accounts/fiscal-years/:id/close` | `accounting.fiscal_years.UPDATE` | Initiates close request. Caller-provided `close_request_id` is supported; omitted key currently uses non-deterministic generation. |
| POST | `/api/accounts/fiscal-years/:id/close/approve` | `accounting.fiscal_years.UPDATE` | Approves close request and posts closing entries. |

Story 69-3-e MUST NOT become ready-for-dev until the close permission semantics (`UPDATE` vs required elevated `MANAGE`), required idempotency key policy, and real fiscal-period UX scope are resolved.

### Reports

| Report | Path | ACL | Contract Result |
|--------|------|-----|-----------------|
| Trial balance | `/api/reports/trial-balance` | `accounting.reports.ANALYZE` | Supports `outlet_id`, `date_from`, `date_to`, `as_of`; returns filters, totals, and rows. |
| General ledger | `/api/reports/general-ledger` | `accounting.reports.ANALYZE` | Supports account/date/outlet filters and line pagination fields. |
| AP aging | `/api/purchasing/reports/ap-aging` | `purchasing.reports.ANALYZE` | Returns supplier aging buckets and grand totals. Not under `/api/reports`. |
| AP aging detail | `/api/purchasing/reports/ap-aging/:supplierId/detail` | `purchasing.reports.ANALYZE` | Returns supplier invoice detail and aging totals. |
| AR aging | `/api/reports/receivables-ageing` | `accounting.reports.ANALYZE` | Returns receivables aging buckets and invoices. Path spelling is `ageing`. |
| AR aging customer detail | `/api/reports/receivables-ageing/customer/:customerId` | `accounting.reports.ANALYZE` | Returns customer-scoped receivables aging data. |

Story 69-3-f MUST NOT include CSV export until a verified streaming endpoint exists or the story explicitly scopes export to client-side export from verified rows.

## Blocker and Risk Register

| Severity | Finding | Owner | Required Resolution |
|----------|---------|-------|---------------------|
| P0 | `GET /api/accounts/fiscal-years?company_id=` allowed cross-tenant fiscal-year listing. | Primary BMAD build agent / bmad-master | Fixed in `apps/api/src/routes/accounts.ts`; regression test added. |
| P1 | Journal runtime body validation is incomplete; malformed payloads can reach service logic. | 69-3-c owner | Add API validation hardening before journal UI readiness or scope UI to current safe contract with tests. |
| P1 | Journal draft/post/void endpoints are absent. | 69-3-c / 69-3-d owner | Add backend story or rewrite child stories to current immediate journal batch model. |
| P1 | Account update route is PUT, not PATCH; update implementation has service-level risk and active/inactive guard risk. | 69-3-b owner | Verify/fix account update before Chart of Accounts UI starts. |
| P1 | Fiscal close uses `UPDATE` ACL and optional generated close request ID. | 69-3-e owner | Resolve elevated permission and require stable idempotency key before fiscal close UI starts. |
| P1 | Report paths differ from initial story assumptions and report CSV endpoints were not found. | 69-3-f owner | Correct paths and define export strategy before reports UI starts. |
| P1 | Fiscal close fixture usage requires Partial Fixture Mode declaration unless a full close fixture is added. | 69-3-e owner | Record Partial Fixture Mode scope/rationale/owner or create full fixture. |
| P2 | Existing fiscal fixtures have deterministic-date risks when defaults are used. | 69-3-a / child owners | Child tests MUST pass explicit deterministic years/dates or fixture code MUST be hardened in owner package. |
| P2 | Account list lacks balance/history fields. | 69-3-b owner | Scope UI to available fields or add verified backend support first. |
| P2 | No report-ready convenience fixture exists. | 69-3-f owner | Compose owner-package fixtures or add owner-package report fixture helpers. |

## P0 Fix Evidence

| File | Change |
|------|--------|
| `apps/api/src/routes/accounts.ts` | `GET /accounts/fiscal-years` rejects `company_id` that does not equal authenticated `auth.companyId` with `400 COMPANY_MISMATCH`. Account detail route was constrained to numeric IDs to prevent `/fiscal-years` capture. |
| `apps/api/__test__/integration/accounting/fiscal-year-list-tenant-isolation.test.ts` | Added real-DB API tests for cross-tenant fiscal-year list rejection, matching-tenant list success, and numeric account detail route regression. |

## Error Boundary Matrix

Backoffice consumers cross the HTTP boundary and MUST branch on response `status` plus machine-readable error `code`. Backoffice code MUST NOT rely on JavaScript `instanceof` for backend package error classes.

| Domain Error / Condition | Producer Location | API Mapping Observed | Backoffice Handling Requirement | `instanceof` Risk | `error.name` / Code Fallback |
|--------------------------|-------------------|----------------------|---------------------------------|-------------------|------------------------------|
| `FiscalYearAlreadyClosedError` | `@jurnapod/modules-accounting` fiscal-year service via `apps/api/src/lib/fiscal-years.ts` | `409 FISCAL_YEAR_ALREADY_CLOSED` or `409 FISCAL_YEAR_CLOSED` depending route | Show conflict state; do not retry mutation; refresh fiscal-year status. | High across HTTP boundary | Use `status === 409` and code in `{ FISCAL_YEAR_ALREADY_CLOSED, FISCAL_YEAR_CLOSED }`. |
| `FiscalYearCloseConflictError` | `@jurnapod/modules-accounting` fiscal close service | `409 CLOSE_CONFLICT` | Show concurrent close conflict; require status refresh before next action. | High across HTTP boundary | Use `status === 409` and `code === CLOSE_CONFLICT`. |
| `FiscalYearClosePreconditionError` | `@jurnapod/modules-accounting` fiscal close service | `400 CLOSE_PRECONDITION_FAILED` | Show blocked close prerequisites; do not display success evidence. | High across HTTP boundary | Use `status === 400` and `code === CLOSE_PRECONDITION_FAILED`. |
| Closing entries imbalance | `apps/api/src/lib/fiscal-years.ts` string-prefixed error | `400 ENTRIES_NOT_BALANCED` | Show financial correctness blocker; stop close flow. | Not applicable; currently string-prefixed | Use `status === 400` and `code === ENTRIES_NOT_BALANCED`. |
| `JournalNotBalancedError` | `@jurnapod/modules-accounting` journal service | `400 JOURNAL_NOT_BALANCED` or `400 NOT_BALANCED` depending handler path | Show journal balance error and keep form editable. | High across HTTP boundary | Use `status === 400` and code in `{ JOURNAL_NOT_BALANCED, NOT_BALANCED }`. |
| `JournalOutsideFiscalYearError` / `FiscalYearClosedError` | `@jurnapod/modules-accounting` journal service | Current manual journal route mapping is incomplete; some paths can become `500 INTERNAL_ERROR` | Child story 69-3-c MUST harden API mapping before UI readiness. | High across package and HTTP boundaries | Use explicit API code after backend hardening; current fallback is a child blocker. |
| Zod validation error | `zod` in API routes | `400 INVALID_REQUEST` where catch exists | Show field-level or request-level validation error. | High across HTTP boundary | Use `status === 400` and `code === INVALID_REQUEST`. |
| Auth / ACL denial | `@jurnapod/auth` / `requireAccess` | `401 UNAUTHORIZED` or `403 FORBIDDEN` | Hide controls by permission; direct calls MUST surface unauthorized/forbidden state. | High across HTTP boundary | Use status `401` or `403` and error code. |
| Tenant mismatch | API route guard | `400 COMPANY_MISMATCH` for fiscal-year list and account create mismatch | Show tenant mismatch as non-retryable safety error; do not reveal foreign tenant data. | Not applicable | Use `status === 400` and `code === COMPANY_MISMATCH`. |

## Fixture and Test Policy

- Full Fixture Mode is default. Fixture setup MUST use canonical production package flow.
- Partial Fixture Mode MAY be used only through decomposed fixtures owned by `@jurnapod/modules-accounting`, with scope, rationale, and owner documented here.
- Raw SQL `INSERT`/`UPDATE` for setup is prohibited when canonical fixtures exist.
- New fixtures MUST live in `packages/modules/accounting/src/test-fixtures/` and MUST be exported from the package index.
- Integration tests MUST use real DB via `.env`; mock DB is prohibited for DB-backed business logic.
- Negative auth tests MUST use `CASHIER` or a dedicated low-privilege custom role, not OWNER/SUPER_ADMIN.

## Required Validation Evidence with PID/Log Tracking

All commands MUST run with `nohup`, PID file tracking, and logs under `logs/`.

```bash
nohup npm run build -w @jurnapod/modules-accounting > logs/story-69-3-a-modules-accounting-build.log 2>&1 & echo $! > logs/story-69-3-a-modules-accounting-build.pid
nohup npm run build:libs > logs/story-69-3-a-build-libs.log 2>&1 & echo $! > logs/story-69-3-a-build-libs.pid
nohup npm run typecheck -w @jurnapod/api > logs/story-69-3-a-api-typecheck.log 2>&1 & echo $! > logs/story-69-3-a-api-typecheck.pid
nohup npm run lint:fixture-flow > logs/story-69-3-a-fixture-flow.log 2>&1 & echo $! > logs/story-69-3-a-fixture-flow.pid
```

If API contract tests are added, they MUST use workspace-relative paths and PID/log tracking.

### Validation Evidence Captured

| Check | Result | Evidence |
|-------|--------|----------|
| Fiscal-year tenant isolation focused test | Passed — 3 tests | `logs/story-69-3-a-fiscal-tenant-isolation-r4.log`, exit `0` |
| Accounting ACL boundary regression | Passed — 10 tests | `logs/story-69-3-a-role-boundary-accounting-r1.log`, exit `0` |
| Modules accounting build | Passed | `logs/story-69-3-a-modules-accounting-build-r1.log`, exit `0` |
| Build libs | Passed | `logs/story-69-3-a-build-libs-r1.log`, exit `0` |
| API typecheck | Passed | `logs/story-69-3-a-api-typecheck-r2.log`, exit `0` |
| API lint | Passed with pre-existing warnings | `logs/story-69-3-a-api-lint-r2.log`, exit `0` |
| Fixture flow lint | Passed | `logs/story-69-3-a-fixture-flow-r1.log`, exit `0` |

## Tasks / Subtasks

- [x] Inventory accounting API routes and response envelopes.
- [x] Verify ACL resources and permissions for each operation.
- [x] Verify error response shapes and cross-package error fallback handling at route-contract level.
- [x] Identify existing accounting fixtures from Epics 63/64.
- [x] Add owner-package fixture gaps only when required — no new fixture code added in this pass; gaps are documented as child blockers.
- [x] Produce readiness notes for 69-3-b through 69-3-f.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires:

- Reviewer GO with no blockers.
- Story owner explicit sign-off.
- Completion report `story-69-3-a.completion.md` with AC evidence and second-pass reviewer sign-off.
