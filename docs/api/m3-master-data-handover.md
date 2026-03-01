<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Milestone M3 Handover (Master Data: Items + Prices)

Status: **API ready** (backend + DB constraints + tests)

This note is intended as a reference for Milestone M4 so we can build on a stable M3 contract.

## Scope Completion

### PR-05: Items API
- Done: CRUD `items`
- Done: item type supports `SERVICE | PRODUCT | INGREDIENT | RECIPE`
- Done: list filtering by `company_id` (auth-scoped) and `is_active`

### PR-06: Prices API (per outlet)
- Done: CRUD `item_prices`
- Done: endpoint for active prices per outlet
- Done: outlet/company RBAC enforcement and guarded access

### PR-07: Sync pull v1
- Done: `GET /api/sync/pull?outlet_id&since_version`
- Done: response includes:
  - `items`
  - `prices` (scoped to requested outlet)
  - minimal `config` (`tax`, `payment_methods`)
  - `data_version` (increments on related master-data/config changes)

## Endpoints (M3)

- `GET /api/inventory/items`
- `POST /api/inventory/items`
- `GET /api/inventory/items/:itemId`
- `PATCH /api/inventory/items/:itemId`
- `DELETE /api/inventory/items/:itemId`

- `GET /api/inventory/item-prices`
- `POST /api/inventory/item-prices`
- `GET /api/inventory/item-prices/:priceId`
- `PATCH /api/inventory/item-prices/:priceId`
- `DELETE /api/inventory/item-prices/:priceId`
- `GET /api/inventory/item-prices/active?outlet_id=...`

- `GET /api/sync/pull?outlet_id=...&since_version=...`

## Data/DB Guarantees Ready for M4

- `items` and `item_prices` schema is migrated.
- `item_prices` has company-scoped FK protections:
  - `(company_id, outlet_id) -> outlets(company_id, id)`
  - `(company_id, item_id) -> items(company_id, id)`
- Migration preflight detects invalid legacy refs (cross-company + orphans) before applying scoped FKs.
- Migration runner bootstraps DB with `CREATE DATABASE IF NOT EXISTS`.

## Validation Coverage

- API typecheck + lint passing.
- Integration tests cover:
  - create item + price + pull sync flow
  - malformed query/guard behavior (`400`)
  - RBAC deny behavior (`403`)
  - concurrent duplicate create conflict behavior (`201/409`)
  - TOCTOU hardening regression path for item-price mutation auth
- DB smoke checks cover:
  - transactional prerequisites (InnoDB/write+rollback)
  - password verification paths (argon2 + bcrypt)
  - company-scoped FK rejection for cross-company `item_prices` inserts

## Known Remaining Work (outside M3 API scope)

- Backoffice UI flow for create/manage item and outlet price.
- POS client integration to consume `/api/sync/pull` and persist to IndexedDB.

## Suggested M4 Starting Point

1. Wire Backoffice forms to `items` and `item-prices` endpoints.
2. Wire POS sync client to `/api/sync/pull` using `since_version` and store returned `data_version`.
3. Keep outlet-scoped behavior in UI to match API/RBAC constraints.
