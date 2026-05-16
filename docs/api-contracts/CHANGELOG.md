# API Contract Changelog

## 0.3 Stability Baseline

Baseline created for pilot-to-release stabilization. This baseline covers **136 stable endpoints** registered in OpenAPI and mounted in the runtime route inventory.

### Baseline Coverage

Stable endpoints registered in `docs/api-contracts/stable-endpoints.json`:

- Auth (login, refresh, logout)
- Health (health, live, ready, sync/health)
- Companies, outlets, users, roles (full CRUD)
- Settings (config, modules, module-roles, tax-rates)
- Accounts, journals
- Inventory (items, supplies, item images)
- Sales (invoices, payments, credit-notes, orders — full lifecycle)
- Purchasing (suppliers, contacts, orders, receipts, invoices, payments, credits, exchange-rates, AP aging, AP reconciliation baseline reports)
- Reports (daily-sales, pos-transactions, profit-loss, trial-balance)
- Import/export baseline subset (import template/upload/validate and export/columns)
- Sync pull/push/stock/check-duplicate

### Known Beta Gaps

The following groups are **NOT in this baseline** and are classified `beta` until OpenAPI registration and stable-list promotion are complete:

| Group | Count | Notes |
|-------|------:|-------|
| Non-promoted `/api/purchasing/*` routes | 13 | Supplier statements, AP reconciliation detail/export/snapshots |
| Non-stable accounting/reporting runtime routes | 14 | Partial or absent OpenAPI coverage |
| Dine-in runtime routes | 2 | OpenAPI partial; not contract-frozen |
| Cash/bank transaction runtime routes | 4 | OpenAPI absent; not contract-frozen |
| POS cart/items runtime routes outside sync | 3 | OpenAPI partial; not contract-frozen |

See `docs/api-stability-matrix.md` for the full beta endpoint list.

### Stable Contract Rules

Breaking changes to stable endpoints require:

1. A changelog entry.
2. Migration notes.
3. Approval from API owner.
4. Versioning decision.

### Breaking Changes

None yet.

### Additive Changes

- Purchasing stable promotion: 44 purchasing endpoints added to the stable endpoint list and OpenAPI baseline. This includes supplier/contact CRUD, purchase orders, goods receipts, AP invoices, AP payments, purchase credits, exchange rates, AP aging, and AP reconciliation summary/settings/drilldown baseline routes.
- Response schema coverage: Added success response schemas (200/201) to 10 stable endpoints that previously had descriptions only — POST /sync/push, GET /accounts, GET /accounts/:id, POST /accounts, GET /accounts/types, GET /inventory/items, GET /inventory/items/:id, POST /inventory/items, POST /inventory/items/:id/images, GET /inventory/items/:id/images.

### Deprecated Endpoints

None yet.
