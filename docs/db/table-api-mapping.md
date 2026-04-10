# Table-to-API Mapping

> **Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.**
> **Ownership: Ahmad Faruk (Signal18 ID)**

This document maps database tables to their corresponding API routes, showing the relationship between data persistence and the HTTP interface.

---

## Architectural Principle

**Accounting/GL at the center** — The `journal_batches` and `journal_lines` tables are the source of truth for all financial reporting. Operational modules (sales, inventory, POS) post financial effects to journals. Reports read from journals, not from source transaction tables.

**POS offline-first** — POS writes locally first, syncs via the outbox pattern using `client_tx_id` for idempotency.

---

## Canonical API Prefix Reference

| API Prefix | Primary Tables |
|---|---|
| `/api/auth/*` | `auth_refresh_tokens`, `auth_throttles`, `email_tokens` |
| `/api/companies` | `companies` |
| `/api/outlets` | `outlets` |
| `/api/users` | `users`, `roles`, `user_role_assignments` |
| `/api/accounts` | `accounts`, `account_types`, `fixed_assets`, `fixed_asset_categories`, `asset_depreciation_*`, `fiscal_years` |
| `/api/journals` | `journal_batches`, `journal_lines` |
| `/api/inventory` | `items`, `item_groups`, `item_prices`, `variants`, `item_images` |
| `/api/sales/*` | `sales_orders`, `sales_invoices`, `sales_payments`, `sales_credit_notes` |
| `/api/sync/*` | `sync_versions`, `pos_transactions`, `pos_sync_metadata` |
| `/api/settings/*` | `modules`, `company_modules`, `module_roles`, `*_mappings`, `settings_*` |
| `/api/dinein` | `reservations`, `reservation_groups`, `outlet_tables`, `service_sessions` |
| `/api/cash-bank-transactions` | `cash_bank_transactions` |
| `/api/audit` | `audit_logs` |
| `/api/reports` | (derived from journals) |
| `/admin/dashboard` | `account_balances_current`, `analytics_insights` |

---

## Core Entities

### Companies & Outlets

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `companies` | `/api/companies` | GET, POST, GET/:id, PATCH/:id | Company management (tenant) |
| `outlets` | `/api/outlets` | GET, POST, GET/:id, PATCH/:id, DELETE/:id, GET/access | Outlet management |

**Example:**
```http
GET /api/companies
GET /api/outlets
POST /api/outlets
```

---

### Users & Authentication

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `users` | `/api/users` | GET, POST, GET/:id, PATCH/:id | User CRUD |
| `users` | `/api/users/me` | GET | Current user profile |
| `roles` | `/api/users/roles` | GET | List available roles |
| `user_role_assignments` | `/api/users/:id/roles` | POST | Assign roles to user |
| `user_role_assignments` | `/api/users/:id/outlets` | POST | Assign outlets to user |
| `users` | `/api/users/:id/password` | POST | Change password |
| `users` | `/api/users/:id/deactivate`, `/api/users/:id/reactivate` | POST | Activate/deactivate user |
| `auth_refresh_tokens` | `/api/auth/refresh`, `/api/auth/logout` | POST | Token management |
| `auth_throttles` | `/api/auth/login` | POST | Login rate limiting (internal) |
| `email_tokens` | `/api/auth/*` (password reset, invite, verify) | POST | Email token operations |

---

## Accounting & Finance

### Chart of Accounts

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `accounts` | `/api/accounts` | GET, POST, GET/:id, PUT/:id | Account CRUD |
| `accounts` | `/api/accounts/tree` | GET | Hierarchical account tree |
| `account_types` | `/api/accounts/types` | GET | Account type definitions |

### Fixed Assets

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `fixed_asset_categories` | `/api/accounts/fixed-asset-categories` | GET, POST, GET/:id, PATCH/:id, DELETE/:id | Asset category management |
| `fixed_assets` | `/api/accounts/fixed-assets` | GET, POST, GET/:id, PATCH/:id, DELETE/:id | Asset CRUD |
| `fixed_asset_books` | `/api/accounts/fixed-assets/:id/acquisition` | POST | Record asset acquisition → creates journal |
| `fixed_asset_books` | `/api/accounts/fixed-assets/:id/transfer` | POST | Transfer asset between outlets → creates journal |
| `fixed_asset_books` | `/api/accounts/fixed-assets/:id/impairment` | POST | Record impairment → creates journal |
| `fixed_asset_books` | `/api/accounts/fixed-assets/:id/disposal` | POST | Record disposal → creates journal |
| `fixed_asset_books` | `/api/accounts/fixed-assets/:id/ledger` | GET | Asset ledger |
| `asset_depreciation_plans` | `/api/accounts/fixed-assets/:id/depreciation-plan` | POST, PATCH | Manage depreciation plan |
| `asset_depreciation_runs` | `/api/accounts/depreciation/run` | POST | Execute depreciation run for period → creates journal |

### Fiscal Years

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `fiscal_years` | `/api/accounts/fiscal-years` | GET, POST | List/create fiscal years |
| `fiscal_years` | `/api/accounts/fiscal-years/:id/status` | GET | Get fiscal year status |
| `fiscal_years` | `/api/accounts/fiscal-years/:id/close-preview` | GET | Preview closing entries |
| `fiscal_years` | `/api/accounts/fiscal-years/:id/close` | POST | Initiate fiscal year close |
| `fiscal_year_close_requests` | `/api/accounts/fiscal-years/:id/close/approve` | POST | Approve and post closing entries |

### Journals

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `journal_batches` | `/api/journals` | GET, POST | List/create journal batches |
| `journal_lines` | `/api/journals/:id` | GET | Get single journal batch with lines |

**Note:** Journals are created primarily through business events (sales, fixed assets, payments). Manual journal creation is available via POST `/api/journals`.

---

## Inventory

### Items & Groups

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `items` | `/api/inventory/items` | GET, POST, GET/:id, PATCH/:id, DELETE/:id | Item CRUD |
| `item_groups` | `/api/inventory/item-groups` | GET, POST, GET/:id, PATCH/:id, DELETE/:id | Item group CRUD |
| `item_groups` | `/api/inventory/item-groups/bulk` | POST | Bulk create item groups |

### Item Prices

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `item_prices` | `/api/inventory/item-prices` | GET, POST, GET/:id, PATCH/:id, DELETE/:id | Price management |
| `item_prices` | `/api/inventory/item-prices/active` | GET | Get active prices for outlet |
| `item_prices` | `/api/inventory/items/:id/prices` | GET | All prices for an item |
| `item_prices` | `/api/inventory/items/:id/variants/:variantId/prices` | GET | Variant-specific prices |

### Item Images

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `item_images` | `/api/inventory/items/:id/images` | GET, POST | List and upload images for an item |
| `item_images` | `/api/inventory/items/:id/images/:imageId` | GET, PATCH, DELETE | Get, update, or delete an image |
| `item_images` | `/api/inventory/items/:id/images/:imageId/set-primary` | POST | Set an image as the primary image |

**Storage:** Files stored at `JP_UPLOAD_PATH` (default: `/var/www/jurnapod/uploads`), served publicly at `/uploads/*` (or via nginx in production). Supports JPG, PNG, WebP up to 2MB. Images are resized to 4 variants: original, large (800×800), medium (400×400), thumbnail (100×100).

#### File Size Limits

| Entity Type | Max Size | Enforced By |
|---|---|---|
| `item_image` | 2MB | `ITEM_IMAGE_MAX_SIZE_BYTES` in item image adapter |
| Generic uploader (default) | 5MB | `lib/uploader/file-validator.ts` |

> **Note:** Per-entity file size limits are defined in their respective adapters. The generic uploader provides a baseline; individual entity handlers may override with stricter limits.

### POS Items & Variants

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `variants` | `/api/pos/items` | GET, POST, PATCH, DELETE | Item variant management |

### Stock

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `inventory_stock` | `/api/outlets/:outletId/stock` | GET, POST | Stock levels per outlet |
| `inventory_transactions` | `/api/outlets/:outletId/stock` | POST | Stock adjustments |
| `inventory_cost_layers` | (internal) | — | Cost layer tracking (internal) |
| `inventory_stock` | `/api/sync/stock` | GET | Stock sync endpoint |

### Recipes & Supplies

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `recipe_ingredients` | `/api/inventory/recipes` | GET, POST, DELETE | Recipe ingredient management |
| `supplies` | `/api/inventory/supplies` | GET, POST, PATCH | Supply master data |

---

## Sales

### Sales Orders

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `sales_orders` | `/api/sales/orders` | GET, POST, GET/:id, PATCH/:id | Order CRUD |
| `sales_orders` | `/api/sales/orders/:id/approve` | POST | Approve order |
| `sales_orders` | `/api/sales/orders/:id/reject` | POST | Reject order |
| `sales_orders` | `/api/sales/orders/:id/cancel` | POST | Cancel order |
| `sales_order_lines` | (nested in order responses) | — | Order line items |

### Sales Invoices

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `sales_invoices` | `/api/sales/invoices` | GET, POST, GET/:id, PATCH/:id | Invoice CRUD |
| `sales_invoices` | `/api/sales/invoices/:id/approve` | POST | Approve invoice |
| `sales_invoices` | `/api/sales/invoices/:id/reject` | POST | Reject invoice |
| `sales_invoices` | `/api/sales/invoices/:id/post` | POST | Post invoice to GL → creates journal |
| `sales_invoices` | `/api/sales/invoices/:id/pdf` | GET | Generate invoice PDF |
| `sales_invoice_lines` | (nested in invoice responses) | — | Invoice line items |
| `sales_invoice_taxes` | (nested in invoice responses) | — | Invoice tax lines |

### Sales Payments

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `sales_payments` | `/api/sales/payments` | GET, POST, GET/:id | Payment CRUD |
| `sales_payment_splits` | (nested in payment responses) | — | Payment account splits |

### Credit Notes

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `sales_credit_notes` | `/api/sales/credit-notes` | GET, POST, GET/:id | Credit note CRUD |
| `sales_credit_note_lines` | (nested in credit note responses) | — | Credit note line items |

### Sales Forecasting

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `sales_forecasts` | `/api/sales/forecasts` | GET, POST | Sales forecast data |

---

## POS & Transactions

### POS Sync (Push)

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `pos_transactions` | `/api/sync/push` | POST | Push POS transactions (idempotent) |
| `pos_transaction_items` | `/api/sync/push` | POST | Transaction line items |
| `pos_transaction_taxes` | `/api/sync/push` | POST | Transaction taxes |
| `pos_transaction_payments` | `/api/sync/push` | POST | Transaction payments |
| `pos_order_snapshots` | `/api/sync/push` | POST | Order snapshot headers |
| `pos_order_snapshot_lines` | `/api/sync/push` | POST | Order snapshot line items |
| `pos_order_updates` | `/api/sync/push` | POST | Order update events |
| `pos_item_cancellations` | `/api/sync/push` | POST | Item cancellation records |
| `variant_sales` | `/api/sync/push` | POST | Variant sales tracking |
| `variant_stock_adjustments` | `/api/sync/push` | POST | Variant stock adjustments |

### POS Sync (Pull)

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `pos_sync_metadata` | `/api/sync/pull` | GET | Pull master data for outlet |
| `sync_versions` | `/api/sync/pull`, `/api/sync/push` | GET, POST | Sync cursor/version management |

### POS Sync Health & Duplicate Checking

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `pos_sync_metadata` | `/api/sync/health` | GET | Sync health check |
| `pos_transactions` | `/api/sync/check-duplicate` | POST | Check for duplicate transactions |

---

## Tax & Compliance

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `tax_rates` | `/api/settings/tax-rates` | GET, POST, PATCH, DELETE | Tax rate management |
| `company_tax_defaults` | `/api/settings/tax-rates` | GET, PUT | Company-level tax defaults |

---

## Settings & Configuration

### Modules

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `modules` | `/api/settings/modules` | GET | List all available modules |
| `company_modules` | `/api/settings/modules` | GET, PATCH | Enable/disable modules per company |

### Roles & Permissions

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `module_roles` | `/api/settings/module-roles` | GET, POST, PATCH | Role-permission mappings per module |

### Configuration & Mappings

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `settings_strings`, `settings_numbers`, `settings_booleans` | `/api/settings/config` | GET, PUT | Typed settings storage |
| `platform_settings` | `/api/settings/config` | GET, PUT | Platform-wide settings |
| `account_mappings` | `/api/settings/config` | GET, POST | Account mapping rules |
| `payment_method_mappings` | `/api/settings/config` | GET, POST | Payment method account mappings |
| `company_account_mappings` | `/api/settings/config` | GET, POST | Company-level account mappings |
| `outlet_account_mappings` | `/api/settings/config` | GET, POST | Outlet-level account mappings |
| `company_payment_method_mappings` | `/api/settings/config` | GET, POST | Company payment method mappings |
| `outlet_payment_method_mappings` | `/api/settings/config` | GET, POST | Outlet payment method mappings |
| `numbering_templates` | `/api/settings/config` | GET, POST | Document numbering templates |

### Feature Flags

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `feature_flags` | `/api/features` | GET | Company feature flags |

---

## Reservations & Dining

### Reservations

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `reservations` | `/api/dinein/*` | GET, POST, PATCH, DELETE | Reservation CRUD |
| `reservation_groups` | `/api/dinein/*` | GET, POST | Large party group management |
| `reservations` | `/api/dinein/:id/tables` | POST | Assign tables to reservation |

### Table Management

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `outlet_tables` | `/api/dinein/*` | GET, POST, PATCH | Table configuration |

### Service Sessions

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `service_sessions` | `/api/dinein/sessions/:id/*` | GET, POST | Session lifecycle management |
| `table_service_session_lines` | `/api/dinein/sessions/:id/lines` | POST | Add session line items |
| `table_service_session_lines` | `/api/dinein/sessions/:id/lines/:lineId/adjust` | POST | Adjust/cancel line |
| `table_service_session_checkpoints` | `/api/dinein/sessions/:id/finalize-batch` | POST | Checkpoint finalized orders |
| `service_sessions` | `/api/dinein/sessions/:id/lock-payment` | POST | Lock payment |
| `service_sessions` | `/api/dinein/sessions/:id/close` | POST | Close session |

### Occupancy

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `occupancy` | `/api/dinein/*` | GET | Table occupancy status |
| `table_events` | `/api/sync/push/table-events` | POST | Push table events |
| `table_events` | `/api/sync/pull/table-state` | GET | Pull table occupancy state |

---

## Cash & Banking

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `cash_bank_transactions` | `/api/cash-bank-transactions` | GET, POST | Cash/bank transaction CRUD |

---

## Audit & Telemetry

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `audit_logs` | `/api/audit` | GET | Audit log queries |
| `sync_audit_events` | `/api/sync/*` | — | Sync audit trail (internal) |
| `sync_audit_events_archive` | `/api/audit` | GET | Archived sync audit events |

---

## Sync & Integration

### Version Management

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `sync_versions` | `/api/sync/pull` | GET | Get current sync version (`data_version`) |
| `sync_versions` | `/api/sync/push` | POST | Update sync version after push |

### Import

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `import_sessions` | `/api/import/:entityType/upload` | POST | Upload import file |
| `import_sessions` | `/api/import/:entityType/validate` | POST | Validate import mapping |
| `import_sessions` | `/api/import/:entityType/apply` | POST | Execute import |
| `import_sessions` | `/api/import/:entityType/template` | GET | Download import template |
| `data_imports` | `/api/import` | POST | Track import history |

### Export

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `export_files` | `/api/export/:entityType` | POST | Export items or prices |
| `export_files` | `/api/export/:entityType/columns` | GET | Get available columns |
| `scheduled_exports` | `/api/export/scheduled` | GET, POST, PATCH, DELETE | Scheduled export jobs |

---

## Reports

Reports are **read-only** and derive data from `journal_batches` and `journal_lines`. No tables are directly written by report endpoints.

| Table(s) (read) | API Route(s) | Methods | Description |
|---|---|---|---|
| `journal_batches`, `journal_lines` | `/api/reports/general-ledger` | GET | General ledger report |
| `journal_batches`, `journal_lines` | `/api/reports/trial-balance` | GET | Trial balance report |
| `journal_batches`, `journal_lines` | `/api/reports/profit-loss` | GET | Profit & loss report |
| `journal_batches`, `journal_lines` | `/api/reports/journals` | GET | Journal entry report |
| `account_balances_current` | `/api/reports/trial-balance` | GET | Account balance snapshots |
| `pos_transactions` | `/api/reports/pos-transactions` | GET | POS transaction report |

### Admin Dashboards

| Table(s) (read) | API Route(s) | Methods | Description |
|---|---|---|---|
| `account_balances_current` | `/admin/dashboard/trial-balance` | GET | Admin trial balance view |
| `analytics_insights` | `/admin/dashboard/*` | GET | Admin analytics |
| `sync_versions` | `/admin/dashboard/sync` | GET | Sync status dashboard |

---

## Operations

| Table(s) | API Route(s) | Methods | Description |
|---|---|---|---|
| `operation_progress` | `/api/operations/*` | GET, POST | Long-running operation progress |
| `email_outbox` | `/api/operations/email-outbox` | GET, POST | Email queue management |
| `scheduled_exports` | `/api/export/scheduled` | GET, POST, PATCH, DELETE | Scheduled export management |

---

## Sync Contract Fields (Canonical)

All sync operations **must** use these field names:

| Direction | Field | Description |
|---|---|---|
| Pull request cursor | `since_version` | Request data since this version |
| Pull response cursor | `data_version` | Version of returned data |

**Rules:**
- Do **NOT** use alias fields like `sync_data_version`
- Do **NOT** depend on legacy tables `sync_data_versions` or `sync_tier_versions`
- Use `sync_versions` table as single storage authority:
  - Data-sync version row: `tier IS NULL`
  - Tiered sync rows: explicit `tier` value (`MASTER`, `OPERATIONAL`, `REALTIME`, `ADMIN`, `ANALYTICS`)

---

## Related Documentation

- [API Reference](API.md) — Full endpoint contracts and examples
- [Database Schema](db/schema.md) — Complete table definitions
- [Sync Protocol Checklist](process/sync-protocol-checklist.md) — Sync implementation guide
