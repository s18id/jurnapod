# API Stability Matrix

**Version:** 0.3-stability-baseline  
**Status:** Active  
**Classification basis:** Registered Hono route inventory from `apps/api/src/app.ts`, stable endpoint list in `docs/api-contracts/stable-endpoints.json`, and baseline OpenAPI in `docs/api-contracts/openapi-0.3-stability-baseline.json`.

---

## Stability Levels

| Level | Meaning | Breaking Changes Allowed? | OpenAPI Coverage |
|---|---|---:|---|
| `stable` | Safe for production clients and internal app contracts | No, unless versioned or explicitly migrated | Required |
| `beta` | Usable internally but not contract-frozen | Yes, with release notes | Partial or absent |
| `internal` | Not part of the client-facing contract | Yes | Not required |
| `deprecated` | Available only for migration compatibility | Only removal-timeline changes | Required until removed |

## Classification Rules

- An endpoint MUST be `stable` only when it appears in `docs/api-contracts/stable-endpoints.json`.
- A `stable` endpoint MUST have owner, client, auth, error, tenant/outlet scope, and request/response contract metadata.
- Runtime routes missing from the stable list MUST be classified `beta` unless they are operational, debug, runbook, swagger, upload, or admin-only routes.
- Operational, debug, runbook, swagger, upload, and admin-only routes MUST be classified `internal`.
- Purchasing endpoints listed in `stable-endpoints.json` MUST be classified `stable` after OpenAPI registration; remaining purchasing routes MUST remain `beta`.

---

## Route Inventory Summary

| Metric | Count |
|---|---:|
| Registered unique method/path routes | 276 |
| Stable endpoints | 136 |
| Beta endpoints | 130 |
| Internal endpoints | 10 |
| Deprecated endpoints | 0 |
| Stable endpoints listed in stable-endpoints.json | 136 |
| OpenAPI paths in baseline | 123 |

### Stable List Runtime Check

All entries in `stable-endpoints.json` exist in the registered Hono route inventory.

---

## Exhaustive Endpoint Classification

| Method | Path | Stability | Owner | Client(s) | Auth Required | Role / Permission | Request Contract | Response Contract | Idempotency | Pagination / Cursor | Scope | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | /admin/dashboard/financial | internal | Platform/Ops | Internal/Ops | Yes | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |
| GET | /admin/dashboard/period-close-workspace | internal | Platform/Ops | Internal/Ops | Yes | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |
| GET | /admin/dashboard/reconciliation | internal | Platform/Ops | Internal/Ops | Yes | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |
| GET | /admin/dashboard/reconciliation/{accountId}/drilldown | internal | Platform/Ops | Internal/Ops | Yes | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |
| GET | /admin/dashboard/sync | internal | API/Sync | Internal/Ops | Yes | Internal | Internal | Internal | N/A | N/A | company_id + outlet_id | Internal; not client contract |
| GET | /admin/dashboard/trial-balance | internal | Platform/Ops | Internal/Ops | Yes | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |
| GET | /admin/dashboard/trial-balance/validate | internal | Platform/Ops | Internal/Ops | Yes | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |
| GET | /admin/runbook.md | internal | Platform/Ops | Internal/Ops | Yes | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |
| PUT | /api/accounting/ap-exceptions/{id}/assign | beta | Accounting/Reporting | Backoffice, Reporting | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| PUT | /api/accounting/ap-exceptions/{id}/resolve | beta | Accounting/Reporting | Backoffice, Reporting | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounting/ap-exceptions/worklist | beta | Accounting/Reporting | Backoffice, Reporting | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/ap-reconciliation/drilldown | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/ap-reconciliation/settings | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| PUT | /api/accounting/reports/ap-reconciliation/settings | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/ap-reconciliation/summary | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/ar-reconciliation/drilldown | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/ar-reconciliation/settings | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| PUT | /api/accounting/reports/ar-reconciliation/settings | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/ar-reconciliation/summary | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/inventory-reconciliation/drilldown | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/inventory-reconciliation/settings | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| PUT | /api/accounting/reports/inventory-reconciliation/settings | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounting/reports/inventory-reconciliation/summary | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/accounts | stable | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/accounts | stable | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/accounts/{id} | stable | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PUT | /api/accounts/{id} | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/depreciation/run | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fiscal-years | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fiscal-years | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fiscal-years/{id}/close | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fiscal-years/{id}/close-preview | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fiscal-years/{id}/close/approve | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fiscal-years/{id}/status | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fixed-asset-categories | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fixed-asset-categories | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| DELETE | /api/accounts/fixed-asset-categories/{id} | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fixed-asset-categories/{id} | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| PATCH | /api/accounts/fixed-asset-categories/{id} | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fixed-assets | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fixed-assets | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| DELETE | /api/accounts/fixed-assets/{id} | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fixed-assets/{id} | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| PATCH | /api/accounts/fixed-assets/{id} | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fixed-assets/{id}/acquisition | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fixed-assets/{id}/book | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| PATCH | /api/accounts/fixed-assets/{id}/depreciation-plan | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fixed-assets/{id}/depreciation-plan | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fixed-assets/{id}/disposal | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fixed-assets/{id}/impairment | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/fixed-assets/{id}/ledger | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fixed-assets/{id}/transfer | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/accounts/fixed-assets/events/{id}/void | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/tree | beta | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/accounts/types | stable | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.accounts:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/audit/period-transitions | beta | Platform/Audit | Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/audit/period-transitions/{id} | beta | Platform/Audit | Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| POST | /api/auth/login | stable | API/Auth | Backoffice | No | Public/session | OpenAPI baseline | OpenAPI baseline | N/A | N/A | N/A | Stable contract protected by lint:api-contracts |
| POST | /api/auth/logout | stable | API/Auth | Backoffice | No | Public/session | OpenAPI baseline | OpenAPI baseline | N/A | N/A | N/A | Stable contract protected by lint:api-contracts |
| POST | /api/auth/refresh | stable | API/Auth | Backoffice | Cookie refresh token | Public/session | OpenAPI baseline | OpenAPI baseline | N/A | N/A | N/A | Stable contract protected by lint:api-contracts |
| GET | /api/cash-bank-transactions | beta | Treasury | Backoffice | Yes | treasury.transactions:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/cash-bank-transactions | beta | Treasury | Backoffice | Yes | treasury.transactions:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/cash-bank-transactions/{id}/post | beta | Treasury | POS, Backoffice | Yes | treasury.transactions:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id + outlet_id | Beta: contract not frozen |
| POST | /api/cash-bank-transactions/{id}/void | beta | Treasury | Backoffice | Yes | treasury.transactions:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/companies | stable | Platform | Backoffice | Yes | platform.companies:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/companies | stable | Platform | Backoffice | Yes | platform.companies:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/companies/{id} | stable | Platform | Backoffice | Yes | platform.companies:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/companies/{id} | stable | Platform | Backoffice | Yes | platform.companies:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/dinein/sessions | beta | Reservations/POS | POS, Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/dinein/tables | beta | Reservations/POS | POS, Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| POST | /api/export/{entityType} | stable | Platform/ImportExport | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/export/{entityType}/columns | stable | Platform/ImportExport | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/health | stable | Platform/Ops | Monitoring | No | Public/session | OpenAPI baseline | OpenAPI baseline | N/A | N/A | N/A | Stable contract protected by lint:api-contracts |
| GET | /api/health/live | stable | Platform/Ops | Monitoring | No | Public/session | OpenAPI baseline | OpenAPI baseline | N/A | N/A | N/A | Stable contract protected by lint:api-contracts |
| GET | /api/health/ready | stable | Platform/Ops | Monitoring | No | Public/session | OpenAPI baseline | OpenAPI baseline | N/A | N/A | N/A | Stable contract protected by lint:api-contracts |
| POST | /api/import/{entityType}/apply | beta | Platform/ImportExport | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/import/{entityType}/template | stable | Platform/ImportExport | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/import/{entityType}/upload | stable | Platform/ImportExport | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/import/{entityType}/validate | stable | Platform/ImportExport | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/inventory/item-groups | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| POST | /api/inventory/item-groups | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| DELETE | /api/inventory/item-groups/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/item-groups/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| PATCH | /api/inventory/item-groups/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/inventory/item-groups/bulk | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/item-prices | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/inventory/item-prices | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| DELETE | /api/inventory/item-prices/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/item-prices/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| PATCH | /api/inventory/item-prices/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/item-prices/active | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/items | stable | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/inventory/items | stable | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| DELETE | /api/inventory/items/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/items/{id} | stable | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/inventory/items/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/items/{id}/images | stable | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/inventory/items/{id}/images | stable | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| DELETE | /api/inventory/items/{id}/images/{imageId} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/inventory/items/{id}/images/{imageId} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| PATCH | /api/inventory/items/{id}/images/{imageId} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| POST | /api/inventory/items/{id}/images/{imageId}/set-primary | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/inventory/items/{id}/prices | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/items/{id}/variants/{variantId}/prices | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/recipes/{id}/cost | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/recipes/{id}/ingredients | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/inventory/recipes/{id}/ingredients | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| DELETE | /api/inventory/recipes/ingredients/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| PATCH | /api/inventory/recipes/ingredients/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/supplies | stable | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/inventory/supplies | stable | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| DELETE | /api/inventory/supplies/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/supplies/{id} | stable | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/inventory/supplies/{id} | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/inventory/variant-stats | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/journals | stable | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.journals:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/journals | stable | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.journals:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/journals/{id} | stable | Accounting/Reporting | Backoffice, Reporting | Yes | accounting.journals:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/operations | beta | Platform/ImportExport | Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/operations/{operationId}/progress | beta | Platform/ImportExport | Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/outlets | stable | Platform | Backoffice | Yes | platform.outlets:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| POST | /api/outlets | stable | Platform | Backoffice | Yes | platform.outlets:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| DELETE | /api/outlets/{id} | stable | Platform | Backoffice | Yes | platform.outlets:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| GET | /api/outlets/{id} | stable | Platform | Backoffice | Yes | platform.outlets:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/outlets/{id} | stable | Platform | Backoffice | Yes | platform.outlets:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| GET | /api/outlets/{outletId}/stock | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id + outlet_id | Beta: contract not frozen |
| POST | /api/outlets/{outletId}/stock/adjustments | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id + outlet_id | Beta: contract not frozen |
| GET | /api/outlets/{outletId}/stock/low | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id + outlet_id | Beta: contract not frozen |
| GET | /api/outlets/{outletId}/stock/transactions | beta | Inventory | Backoffice | Yes | inventory.items/stock:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id + outlet_id | Beta: contract not frozen |
| GET | /api/outlets/access | stable | Platform | Backoffice | Yes | platform.outlets:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| GET | /api/pages/{slug} | beta | API | Backoffice | No | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/platform/customers | beta | Platform | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/platform/customers | beta | Platform | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| DELETE | /api/platform/customers/{id} | beta | Platform | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/platform/customers/{id} | beta | Platform | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| PATCH | /api/platform/customers/{id} | beta | Platform | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/pos/cart/line | beta | POS | POS, Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | Domain-specific where documented | N/A | company_id + outlet_id | Beta: OpenAPI exists but contract is not frozen |
| POST | /api/pos/cart/validate | beta | POS | POS, Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id + outlet_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/pos/items/{id}/variants | beta | Inventory | POS, Backoffice | Yes | Authenticated resource ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id + outlet_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/purchasing/credits | stable | Purchasing | Backoffice | Yes | purchasing.credits:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/credits | stable | Purchasing | Backoffice | Yes | purchasing.credits:domain ACL | OpenAPI baseline | OpenAPI baseline | idempotency_key where supported | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/credits/{id} | stable | Purchasing | Backoffice | Yes | purchasing.credits:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/credits/{id}/apply | stable | Purchasing | Backoffice | Yes | purchasing.credits:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/credits/{id}/void | stable | Purchasing | Backoffice | Yes | purchasing.credits:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/exchange-rates | stable | Purchasing | Backoffice | Yes | purchasing.exchange_rates:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/exchange-rates | stable | Purchasing | Backoffice | Yes | purchasing.exchange_rates:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/exchange-rates/{id} | stable | Purchasing | Backoffice | Yes | purchasing.exchange_rates:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/purchasing/exchange-rates/{id} | stable | Purchasing | Backoffice | Yes | purchasing.exchange_rates:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/exchange-rates/lookup | stable | Purchasing | Backoffice | Yes | purchasing.exchange_rates:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/invoices | stable | Purchasing | Backoffice | Yes | purchasing.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/invoices | stable | Purchasing | Backoffice | Yes | purchasing.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | idempotency_key where supported | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/invoices/{id} | stable | Purchasing | Backoffice | Yes | purchasing.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/invoices/{id}/post | stable | Purchasing | Backoffice | Yes | purchasing.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/invoices/{id}/void | stable | Purchasing | Backoffice | Yes | purchasing.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/orders | stable | Purchasing | Backoffice | Yes | purchasing.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/orders | stable | Purchasing | Backoffice | Yes | purchasing.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | idempotency_key where supported | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/orders/{id} | stable | Purchasing | Backoffice | Yes | purchasing.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/purchasing/orders/{id} | stable | Purchasing | Backoffice | Yes | purchasing.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/purchasing/orders/{id}/status | stable | Purchasing | Backoffice | Yes | purchasing.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/payments | stable | Purchasing | Backoffice | Yes | purchasing.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/payments | stable | Purchasing | Backoffice | Yes | purchasing.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | idempotency_key where supported | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/payments/{id} | stable | Purchasing | Backoffice | Yes | purchasing.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/payments/{id}/post | stable | Purchasing | Backoffice | Yes | purchasing.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/payments/{id}/void | stable | Purchasing | Backoffice | Yes | purchasing.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/receipts | stable | Purchasing | Backoffice | Yes | purchasing.receipts:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/receipts | stable | Purchasing | Backoffice | Yes | purchasing.receipts:domain ACL | OpenAPI baseline | OpenAPI baseline | idempotency_key where supported | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/receipts/{id} | stable | Purchasing | Backoffice | Yes | purchasing.receipts:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/reports/ap-aging | stable | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | OpenAPI baseline | OpenAPI baseline | N/A | Date range/query | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/reports/ap-aging/{supplierId}/detail | stable | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | OpenAPI baseline | OpenAPI baseline | N/A | Date range/query | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/reports/ap-reconciliation/ap-detail | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/reports/ap-reconciliation/drilldown | stable | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | OpenAPI baseline | OpenAPI baseline | N/A | Date range/query | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/reports/ap-reconciliation/export | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/reports/ap-reconciliation/gl-detail | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/reports/ap-reconciliation/settings | stable | Purchasing | Backoffice, Reporting | Yes | accounting.accounts:manage | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PUT | /api/purchasing/reports/ap-reconciliation/settings | stable | Purchasing | Backoffice, Reporting | Yes | accounting.accounts:manage | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/reports/ap-reconciliation/snapshots | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| POST | /api/purchasing/reports/ap-reconciliation/snapshots | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/reports/ap-reconciliation/snapshots/{id} | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| POST | /api/purchasing/reports/ap-reconciliation/snapshots/{id}/archive | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/reports/ap-reconciliation/snapshots/{id}/compare | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/reports/ap-reconciliation/snapshots/{id}/export | beta | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/reports/ap-reconciliation/summary | stable | Purchasing | Backoffice, Reporting | Yes | purchasing.reports:analyze | OpenAPI baseline | OpenAPI baseline | N/A | Date range/query | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/supplier-statements | beta | Purchasing | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: not in stable endpoint list |
| POST | /api/purchasing/supplier-statements | beta | Purchasing | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/supplier-statements/{id}/reconcile | beta | Purchasing | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: not in stable endpoint list |
| PUT | /api/purchasing/supplier-statements/{id}/reconcile | beta | Purchasing | Backoffice | Yes | Authenticated resource ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: not in stable endpoint list |
| GET | /api/purchasing/suppliers | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/suppliers | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| DELETE | /api/purchasing/suppliers/{id} | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/suppliers/{id} | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/purchasing/suppliers/{id} | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/suppliers/{supplierId}/contacts | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/purchasing/suppliers/{supplierId}/contacts | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| DELETE | /api/purchasing/suppliers/{supplierId}/contacts/{id} | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/purchasing/suppliers/{supplierId}/contacts/{id} | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/purchasing/suppliers/{supplierId}/contacts/{id} | stable | Purchasing | Backoffice | Yes | purchasing.suppliers:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/reports/daily-sales | stable | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | OpenAPI baseline | OpenAPI baseline | N/A | Date range/query | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/reports/general-ledger | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/reports/journals | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/reports/pos-payments | beta | Accounting/Reporting | POS, Backoffice | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id + outlet_id | Beta: contract not frozen |
| GET | /api/reports/pos-transactions | stable | Accounting/Reporting | POS, Backoffice | Yes | source-module:analyze | OpenAPI baseline | OpenAPI baseline | N/A | Date range/query | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| GET | /api/reports/profit-loss | stable | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | OpenAPI baseline | OpenAPI baseline | N/A | Date range/query | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/reports/receivables-ageing | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/reports/receivables-ageing/customer/{customerId} | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/reports/trial-balance | stable | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | OpenAPI baseline | OpenAPI baseline | N/A | Date range/query | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/reports/worksheet | beta | Accounting/Reporting | Backoffice, Reporting | Yes | source-module:analyze | Not frozen | Not frozen | N/A | Date range/query | company_id | Beta: contract not frozen |
| GET | /api/roles | stable | Platform | Backoffice | Yes | platform.roles:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/roles | stable | Platform | Backoffice | Yes | platform.roles:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| DELETE | /api/roles/{id} | stable | Platform | Backoffice | Yes | platform.roles:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/roles/{id} | stable | Platform | Backoffice | Yes | platform.roles:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/roles/{id} | stable | Platform | Backoffice | Yes | platform.roles:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/sales/credit-notes | stable | Sales | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/credit-notes | stable | Sales | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/sales/credit-notes/{id} | stable | Sales | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/sales/credit-notes/{id} | stable | Sales | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/credit-notes/{id}/post | stable | Sales | POS, Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/credit-notes/{id}/void | stable | Sales | Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/sales/invoices | stable | Sales | Backoffice | Yes | sales.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/invoices | stable | Sales | Backoffice | Yes | sales.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/sales/invoices/{id} | stable | Sales | Backoffice | Yes | sales.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/sales/invoices/{id} | stable | Sales | Backoffice | Yes | sales.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/invoices/{id}/post | stable | Sales | POS, Backoffice | Yes | sales.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/invoices/{id}/void | stable | Sales | Backoffice | Yes | sales.invoices:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/sales/orders | stable | Sales | Backoffice | Yes | sales.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/orders | stable | Sales | Backoffice | Yes | sales.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/sales/orders/{id} | stable | Sales | Backoffice | Yes | sales.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/sales/orders/{id} | stable | Sales | Backoffice | Yes | sales.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/orders/{id}/cancel | stable | Sales | Backoffice | Yes | sales.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/orders/{id}/convert-to-invoice | stable | Sales | Backoffice | Yes | sales.orders:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/sales/payments | stable | Sales | Backoffice | Yes | sales.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/payments | stable | Sales | Backoffice | Yes | sales.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/sales/payments/{id} | stable | Sales | Backoffice | Yes | sales.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/sales/payments/{id} | stable | Sales | Backoffice | Yes | sales.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/sales/payments/{id}/acknowledge-fx | beta | Sales | Backoffice | Yes | sales.payments:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/sales/payments/{id}/post | stable | Sales | POS, Backoffice | Yes | sales.payments:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| POST | /api/sales/payments/{id}/void | beta | Sales | Backoffice | Yes | sales.payments:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| GET | /api/settings/config | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/settings/config | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PUT | /api/settings/config | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PUT | /api/settings/module-roles/{roleId}/{module}/{resource} | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/settings/modules | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PUT | /api/settings/modules | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/settings/modules/extended | beta | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| PUT | /api/settings/modules/extended | beta | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| PUT | /api/settings/modules/module-roles/{roleId}/{module}/{resource} | beta | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/settings/pages | beta | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| POST | /api/settings/pages | beta | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| PATCH | /api/settings/pages/{id} | beta | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| POST | /api/settings/pages/{id}/publish | beta | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| POST | /api/settings/pages/{id}/unpublish | beta | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI partial | OpenAPI partial | N/A | N/A | company_id | Beta: OpenAPI exists but contract is not frozen |
| GET | /api/settings/tax-rates | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/settings/tax-rates | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| DELETE | /api/settings/tax-rates/{id} | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PUT | /api/settings/tax-rates/{id} | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/settings/tax-rates/default | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/settings/tax-rates/defaults | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PUT | /api/settings/tax-rates/defaults | stable | Platform | Backoffice | Yes | platform.settings:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/sync/check-duplicate | stable | API/Sync | POS, Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | client_tx_id lookup | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| GET | /api/sync/health | stable | API/Sync | POS, Backoffice | Yes | Authenticated resource ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| GET | /api/sync/pull | stable | API/Sync | POS, Backoffice | Yes | pos.transactions:read + outlet access | OpenAPI baseline | OpenAPI baseline | N/A | since_version/data_version | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| POST | /api/sync/push | stable | API/Sync | POS, Backoffice | Yes | pos.transactions:create + outlet access | OpenAPI baseline | OpenAPI baseline | client_tx_id | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| GET | /api/sync/stock | stable | API/Sync | POS, Backoffice | Yes | pos.transactions:read + outlet access | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id + outlet_id | Stable contract protected by lint:api-contracts |
| GET | /api/users | stable | Platform | Backoffice | Yes | platform.users:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| POST | /api/users | stable | Platform | Backoffice | Yes | platform.users:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/users/{id} | stable | Platform | Backoffice | Yes | platform.users:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| PATCH | /api/users/{id} | beta | Platform | Backoffice | Yes | platform.users:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/users/{id}/deactivate | beta | Platform | Backoffice | Yes | platform.users:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/users/{id}/outlets | beta | Platform | Backoffice | Yes | platform.users:domain ACL | Not frozen | Not frozen | N/A | limit/offset where supported | company_id + outlet_id | Beta: contract not frozen |
| POST | /api/users/{id}/password | beta | Platform | Backoffice | Yes | platform.users:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/users/{id}/reactivate | beta | Platform | Backoffice | Yes | platform.users:domain ACL | Not frozen | Not frozen | N/A | N/A | company_id | Beta: contract not frozen |
| POST | /api/users/{id}/roles | stable | Platform | Backoffice | Yes | platform.users:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/users/me | stable | Platform | Backoffice | Yes | platform.users:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | N/A | company_id | Stable contract protected by lint:api-contracts |
| GET | /api/users/outlets | beta | Platform | Backoffice | Yes | platform.users:domain ACL | Not frozen | Not frozen | N/A | limit/offset where supported | company_id + outlet_id | Beta: contract not frozen |
| GET | /api/users/roles | stable | Platform | Backoffice | Yes | platform.users:domain ACL | OpenAPI baseline | OpenAPI baseline | N/A | limit/offset where supported | company_id | Stable contract protected by lint:api-contracts |
| GET | /swagger | internal | Platform/Ops | Internal/Ops | No | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |
| GET | /swagger.json | internal | Platform/Ops | Internal/Ops | No | Internal | Internal | Internal | N/A | N/A | N/A | Internal; not client contract |

---

## Known Promotion Backlog

| Backlog Item | Severity | Required Action |
|---|---|---|
| Beta routes with `Not frozen` contracts | P2 | OpenAPI metadata MUST be added before promotion. |
| Stable smoke pack — large export guardrail (>50K row) | P2 | Large export guardrail smoke (Excel > 50K row limit triggered by real large dataset) MUST be added before final release-candidate sign-off. Cross-tenant ACL, import upload/validate/apply, fiscal closed-period posting rejection, deep void PI lifecycle, and GRN line readback are now covered by stable API smoke Flows 11, 13, 17, and 18. |

---

## Related Files

- `docs/api-contracts/stable-endpoints.json`
- `docs/api-contracts/openapi-0.3-stability-baseline.json`
- `docs/api-contracts/CHANGELOG.md`
- `scripts/check-api-contract-diff.ts`
- `apps/api/__test__/integration/smoke/stable-api-smoke.test.ts`
