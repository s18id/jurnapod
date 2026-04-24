# Epic 50 — Purchasing Migration Batch Runbook

## Purpose

Provide an implementation-ready runbook to migrate purchasing domain library code from `apps/api/src/lib/purchasing/*` into `@jurnapod/modules-purchasing` in controlled batches.

This runbook is authoritative for Story 50.2 execution slices.

---

## Mandatory Ownership Model

1. `@jurnapod/db/test-fixtures` MUST contain DB-generic primitives/assertions only.
2. Domain fixtures MUST live in owner packages.
3. Purchasing domain library logic MUST live in `@jurnapod/modules-purchasing`.
4. `apps/api/src/lib/test-fixtures.ts` and `apps/api/src/lib/purchasing/*` MAY act as transitional re-export/adapter layers during migration.
5. New purchasing domain logic MUST NOT be implemented in API lib after the package service exists.

---

## Global Constraints

- Package services MUST accept injected `db: KyselySchema`.
- Package services MUST NOT call `getDb()` internally.
- `@jurnapod/modules-purchasing` MUST NOT import from `apps/api/*`.
- Route behavior and response shapes MUST remain stable within each batch.

---

## Batch 1 — Supplier, Supplier Contacts, Exchange Rates

### Objective
Move supplier/contact/exchange-rate business logic into `@jurnapod/modules-purchasing` while preserving existing route behavior.

### In Scope
- `apps/api/src/lib/purchasing/supplier.ts`
- `apps/api/src/lib/purchasing/supplier-contact.ts`
- `apps/api/src/lib/purchasing/exchange-rate.ts`
- `packages/modules/purchasing/src/services/supplier-service.ts` (new)
- `packages/modules/purchasing/src/services/supplier-contact-service.ts` (new)
- `packages/modules/purchasing/src/services/exchange-rate-service.ts` (new)
- `packages/modules/purchasing/src/services/index.ts` (update)
- `packages/modules/purchasing/src/types/{supplier,supplier-contact,exchange-rate}.ts` (new)
- `packages/modules/purchasing/src/types/index.ts` (new)
- `packages/modules/purchasing/src/index.ts` (update)

### Out of Scope
- PO/GR/AP invoice/credit/payment flows
- reconciliation/reporting flows
- fixture migration completion

### Ordered Steps
1. Define package types for supplier/contact/exchange-rate inputs and outputs.
2. Move domain logic to package service files with injected db.
3. Convert API lib files to delegate-only adapters.
4. Wire package exports.
5. Validate build/typecheck/tests.

### Validation Commands
```bash
npm run build -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/api
```

### Risks
- P1: signature drift between route and service
- P1: behavior drift in supplier/contact primary-flag logic
- P2: incomplete adapter conversion leaves mixed business SQL in API

### Done Gate
- Package services exist and compile.
- API files in scope are delegate-only.
- No API imports from package services.
- Targeted suppliers/contacts/exchange-rate tests pass.
- Reviewer GO recorded.

---

## Batch 2 — Purchase Orders and Goods Receipts

### Objective
Move PO/GR domain logic into package services with transactional behavior unchanged.

### In Scope
- `apps/api/src/lib/purchasing/purchase-order.ts`
- `apps/api/src/lib/purchasing/goods-receipt.ts`
- `packages/modules/purchasing/src/services/purchase-order-service.ts` (new)
- `packages/modules/purchasing/src/services/goods-receipt-service.ts` (new)
- `packages/modules/purchasing/src/types/{purchase-order,goods-receipt}.ts` (new)

### Out of Scope
- AP invoice/credit/payment flows
- reports/reconciliation
- fixture completion

### Ordered Steps
1. Extract PO/GR types into package.
2. Move PO/GR domain SQL to package services.
3. Convert API files to adapters.
4. Validate build/typecheck/tests.

### Validation Commands
```bash
npm run build -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/api
```

### Risks
- P1: status transition behavior drift
- P1: transaction boundary regressions in GR flow
- P2: partial migration leaves duplicate business paths

### Done Gate
- PO/GR services compile and are exported.
- API PO/GR files are delegate-only.
- Integration tests for PO/GR pass.
- Reviewer GO recorded.

---

## Batch 3 — Purchase Invoices, Purchase Credits, AP Payments

### Objective
Move AP transaction flows into package services with correctness and accounting invariants preserved.

### In Scope
- `apps/api/src/lib/purchasing/purchase-invoice.ts`
- `apps/api/src/lib/purchasing/purchase-credit.ts`
- `apps/api/src/lib/purchasing/ap-payment.ts`
- `packages/modules/purchasing/src/services/purchase-invoice-service.ts` (new)
- `packages/modules/purchasing/src/services/purchase-credit-service.ts` (new)
- `packages/modules/purchasing/src/services/ap-payment-service.ts` (new)
- corresponding package type files

### Out of Scope
- reconciliation/reporting files
- fixture completion

### Ordered Steps
1. Freeze function signatures and return shapes.
2. Move logic into package services with injected db.
3. Keep API files as delegates.
4. Verify money math and status transitions unchanged.
5. Validate build/typecheck/tests.

### Validation Commands
```bash
npm run build -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/api
```

### Risks
- P0: AP payment/posting invariants drift
- P1: decimal/string amount formatting drift
- P1: auth-context behavior mismatch after move

### Done Gate
- AP service files compile and are exported.
- API AP files are delegate-only.
- Integration tests for invoices/credits/ap-payments pass.
- Reviewer GO recorded.

---

## Batch 4 — Reports and Reconciliation

### Objective
Move purchasing report/reconciliation logic to package services with tenant isolation and deterministic output preserved.

### In Scope
- `apps/api/src/lib/purchasing/ap-aging-report.ts`
- `apps/api/src/lib/purchasing/ap-reconciliation.ts`
- `apps/api/src/lib/purchasing/ap-reconciliation-drilldown.ts`
- `apps/api/src/lib/purchasing/ap-reconciliation-snapshots.ts`
- `apps/api/src/lib/purchasing/supplier-statements.ts`
- package report/reconciliation service files (new)

### Out of Scope
- new reporting features
- schema redesign

### Ordered Steps
1. Extract report/reconciliation types.
2. Move query logic to package services with injected db.
3. Preserve API response contract.
4. Convert API files to delegates.
5. Validate with report/reconciliation suites.

### Validation Commands
```bash
npm run build -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/api
```

### Risks
- P1: tenant isolation query drift
- P1: snapshot integrity checks drift
- P2: pagination/summary mismatch

### Done Gate
- Report/reconciliation services compile and export.
- API report/reconciliation files are delegate-only.
- AP aging/reconciliation/snapshots tests pass.
- Reviewer GO recorded.

---

## Batch 5 — Fixture Migration Completion

### Objective
Complete purchasing fixture migration so owner-package fixtures are canonical and API fixture file is transitional only.

### In Scope
- `packages/modules/purchasing/src/test-fixtures/*` implementation completion
- `apps/api/src/lib/test-fixtures.ts` delegate/re-export cleanup for purchasing symbols
- `apps/api/__test__/fixtures/index.ts` consumer flip for purchasing fixture symbols

### Out of Scope
- unrelated fixture domains (platform/accounting migrations are tracked separately)

### Ordered Steps
1. Implement fixture functions in purchasing package (replace NotImplemented placeholders).
2. Ensure deterministic defaults and tenant scoping.
3. Update API fixture wrapper to delegate purchasing symbols.
4. Flip test fixture consumer exports to owner package.
5. Run fixture-flow policy validation.

### Validation Commands
```bash
npm run build -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/api
npm run lint:fixture-flow
```

### Risks
- P0: introducing domain fixture writes outside owner package
- P1: fixture signature drift breaks integration tests
- P2: incomplete consumer flip leaves duplicate fixture paths

### Done Gate
- Purchasing fixtures fully implemented in owner package.
- API fixture wrapper contains no new purchasing domain logic.
- Consumer exports flipped and tests pass.
- Reviewer GO recorded.

---

## Evidence Requirements (All Batches)

For each batch, implementation notes MUST include:
- files changed
- command outputs (build/typecheck/test)
- explicit statement that API files in-scope are delegate-only
- reviewer GO decision with severity table

Story status progression MUST follow: `backlog` → `ready-for-dev` → `in-progress` → `review` → `done`.
