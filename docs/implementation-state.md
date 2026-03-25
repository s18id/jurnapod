# Jurnapod Implementation State

> **Last Updated:** 2026-03-25
> **Status:** All Epics Complete (v0.2.2)

## Current Sprint Status

| Epic | Name | Status | Stories |
|------|------|--------|---------|
| Epic 1 | Foundation - Auth, Company & Outlet | ✅ Done | 1.1-1.7 |
| Epic 2 | POS - Offline-first Point of Sale | ✅ Done | 2.1-2.6 |
| Epic 3 | Accounting - GL Posting & Reports | ✅ Done | 3.1-3.5 |
| Epic 4 | Items & Catalog - Product Management | ✅ Done | 4.1-4.9 |
| Epic 5 | Settings - Tax, Payment, Module Config | ✅ Done | 5.1-5.3 |
| Epic 6 | Reporting - Sales Reports & Exports | ✅ Done | 6.1-6.3 |
| Epic 7 | Sync Infrastructure - Technical Debt | ✅ Done | 7.1-7.4 |
| Epic 8 | Backoffice Items/Split Page | ✅ Done | 8.1-8.8 |
| Epic 9 | Backoffice User Management UX | ✅ Done | 9.1-9.4 |
| Epic 10 | Backoffice Consistency & Navigation | ✅ Done | 10.1-10.4 |
| Epic 11 | Operational Trust and Scale Readiness | ✅ Done | 11.1-11.5 |
| Epic 12 | Table Reservation and POS Multi-Cashier | ✅ Done | 12.1-12.11 |
| Epic 13 | Large Party Reservations (Multi-Table) | ✅ Done | 13.1-13.3 |
| Epic 14 | Hono Full Utilization | ✅ Done | 14.1-14.4 |
| Epic 15 | Stub Route Implementation | ✅ Done | 15.1-15.5 |
| Epic 16 | Unified Time Handling via date-helpers | ✅ Done | 16.1-16.5 |
| Epic 17 | Reliable POS Sync and Reservation Time | ✅ Done | 17.1-17.5 |
| Epic 18 | Redundant Timestamp Cleanup | ✅ Done | 18.1-18.5 |

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js 20.x |
| **API Framework** | Hono (replaces Next.js) |
| **Database** | MySQL 8.0+ / MariaDB (InnoDB) |
| **Auth** | JWT (jose), Argon2id |
| **Frontend** | React 18, Vite 5, PWA |
| **State** | Local state + context |
| **Offline** | IndexedDB (Dexie) |
| **UI Framework** | Mantine (Backoffice), Ionic (POS) |
| **Validation** | Zod schemas |
| **Money** | DECIMAL(18,2) - never FLOAT/DOUBLE |

## Implemented Features

### Auth & RBAC ✅
| Feature | Status | File/Route |
|---------|--------|------------|
| Email/Password Login | ✅ Done | Hono route |
| Google SSO | ✅ Done | Hono route |
| JWT Token + Refresh | ✅ Done | Hono route |
| Roles CRUD | ✅ Done | Hono routes |
| Permissions Endpoint | ✅ Done | Hono route |
| RBAC Middleware | ✅ Done | `@/lib/auth-guard` |
| Module Permissions | ✅ Done | `@/lib/auth` |

### User Management ✅
| Feature | Status | File/Route |
|---------|--------|------------|
| User CRUD | ✅ Done | Hono routes |
| User Roles | ✅ Done | Hono routes |
| Matrix-based Outlet Role Assignment | ✅ Done | UI + API |
| Consolidated Row Action Menus | ✅ Done | UI + API |

### Company & Outlet ✅
| Feature | Status | File/Route |
|---------|--------|------------|
| Company CRUD | ✅ Done | Hono routes |
| Outlet CRUD | ✅ Done | Hono routes |
| Company Settings | ✅ Done | Hono routes |
| Platform Settings | ✅ Done | Hono routes |
| Feature Flags | ✅ Done | Hono routes |

### POS (Epic 2) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Cart + Items | ✅ Done | Offline-first |
| Discounts | ✅ Done | |
| Multi-payment | ✅ Done | |
| Offline Mode | ✅ Done | IndexedDB + Dexie |
| Sync | ✅ Done | Idempotent via client_tx_id |

### Dine-in & Table Management (Epic 12) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Table Occupancy | ✅ Done | Optimistic locking |
| Service Sessions | ✅ Done | Multi-cashier safe |
| Session Checkpoints | ✅ Done | Finalize before payment |
| Table Events | ✅ Done | Append-only audit log |
| Reservations | ✅ Done | With canonical ts |
| Reservation Groups | ✅ Done | Multi-table support |
| Table Board UI | ✅ Done | Backoffice |
| Reservation Calendar | ✅ Done | Backoffice |

### Accounting (Epic 3) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Automatic Journal Entry (POS) | ✅ Done | |
| Manual Journal Entry | ✅ Done | |
| Journal Batch History | ✅ Done | Immutable |
| Trial Balance | ✅ Done | |
| General Ledger Report | ✅ Done | |

### Items & Catalog (Epic 4) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Item CRUD | ✅ Done | |
| Outlet-specific Pricing | ✅ Done | |
| Multiple Item Types | ✅ Done | SERVICE, PRODUCT, INGREDIENT, RECIPE |
| Recipe/BOM Composition | ✅ Done | |
| COGS Integration | ✅ Done | |
| Cost Tracking Methods | ✅ Done | Cost layers |
| Item Variants | ✅ Done | |
| Barcode/Image Support | ✅ Done | |
| Account Mapping Keys | ✅ Done | |

### Sales (Epic 4-6) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Sales Invoices | ✅ Done | |
| Sales Orders | ✅ Done | |
| Sales Payments | ✅ Done | |
| Payment Splits | ✅ Done | |
| Credit Notes | ✅ Done | |
| Shortfall Loss Settlement | ✅ Done | Manual write-off |

### Sync Infrastructure (Epic 7) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Version Manager | ✅ Done | BIGINT |
| Audit Event Persistence | ✅ Done | |
| Auth/Rate Limiting | ✅ Done | |
| Schema Indexes | ✅ Done | |
| Retention Job | ✅ Done | |

### Reporting (Epic 6, 11) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Sales Reports | ✅ Done | Date range |
| Export Reports | ✅ Done | |
| POS Transaction History | ✅ Done | |
| SLO Instrumentation | ✅ Done | |
| Performance Monitoring | ✅ Done | |

### Backoffice UI (Epics 8-10) ✅
| Feature | Status | Details |
|---------|--------|---------|
| PageHeader Component | ✅ Done | Reusable |
| FilterBar Component | ✅ Done | Standardized |
| DataTable Component | ✅ Done | Sort, pagination, selection |
| Breadcrumb Navigation | ✅ Done | |
| Items Page | ✅ Done | Split from inline editing |
| Prices Page | ✅ Done | Import wizard |
| ImportWizard Component | ✅ Done | Reusable |

### Hono Migration (Epic 14-15) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Hono + Zod + OpenAPI | ✅ Done | |
| Typed Context Extensions | ✅ Done | |
| zValidator Implementation | ✅ Done | |
| URL Standardization | ✅ Done | kebab-case, RESTful |
| Sync Routes | ✅ Done | /sync/* |
| Account Routes | ✅ Done | |
| Item Routes | ✅ Done | |
| Tax/Role Routes | ✅ Done | |
| Invoice/Order/Payment Routes | ✅ Done | |
| Dine-in Routes | ✅ Done | |
| Report Routes | ✅ Done | |
| Journal Routes | ✅ Done | |
| OpenAPI Spec | ✅ Done | |

### Time Handling (Epics 16-17) ✅
| Feature | Status | Details |
|---------|--------|---------|
| date-helpers Contract | ✅ Done | @js-temporal/polyfill |
| DST Policy | ✅ Done | reject-by-default |
| Canonical TS Semantics | ✅ Done | _ts columns authority |
| TS Authority Rules | ✅ Done | Enforced in sync |
| Reservation Boundary TS | ✅ Done | Unix ms columns |

### Timestamp Cleanup (Epic 18) ✅
| Feature | Status | Details |
|---------|--------|---------|
| Remove Dropped Column References | ✅ Done | |
| Prepare created_at_ts Nullable | ✅ Done | |
| Guarded Drop Migration | ✅ Done | |
| Validation | ✅ Done | |

## API Routes Summary

### Auth Routes
```
/api/auth/login          ✅ POST - Email/password login
/api/auth/google        ✅ POST - Google SSO
/api/auth/refresh       ✅ POST - Token refresh
/api/auth/logout        ✅ POST - Logout
/api/auth/password-reset/*  ✅ Password reset flows
/api/auth/invite/*     ✅ Invite accept
/api/auth/email/*       ✅ Email verify
```

### User & Role Routes
```
/api/users/*           ✅ Full CRUD
/api/roles/*           ✅ Full CRUD
/api/permissions/*     ✅ GET - List all
```

### Company & Outlet Routes
```
/api/companies/*       ✅ Full CRUD
/api/outlets/*         ✅ Full CRUD
```

### Sync Routes
```
/api/sync/pull         ✅ Master data pull
/api/sync/push         ✅ Transaction push (idempotent)
/api/sync/push/table-events  ✅ Table occupancy events
/api/sync/pull/table-state   ✅ Table state pull
/api/sync/health       ✅ Health check
/api/sync/check-duplicate   ✅ Duplicate detection
```

### Sales Routes
```
/api/sales/invoices/*       ✅ CRUD + post
/api/sales/orders/*         ✅ CRUD
/api/sales/payments/*       ✅ CRUD + post
/api/sales/credit-notes/*    ✅ CRUD
```

### Dine-in Routes
```
/api/dinein/sessions/*      ✅ Session management
/api/dinein/checkpoints/*    ✅ Finalize checkpoints
/api/dinein/tables/*         ✅ Table operations
/api/reservations/*          ✅ Reservation CRUD
/api/reservation-groups/*    ✅ Group CRUD
```

### Accounting Routes
```
/api/accounts/*         ✅ Chart of accounts
/api/journal/*          ✅ Journal entries
/api/reports/*          ✅ Financial reports
```

### Item Routes
```
/api/items/*            ✅ Item CRUD
/api/item-groups/*      ✅ Group CRUD
/api/item-prices/*      ✅ Price management
/api/tax-rates/*        ✅ Tax configuration
```

### Settings Routes
```
/api/settings/company/*         ✅ Company settings
/api/settings/outlet/*          ✅ Outlet settings
/api/settings/platform/*       ✅ Platform settings
/api/feature-flags/*           ✅ Feature flags
```

## Database Schema Status

### Core Tables ✅
- `users` ✅
- `roles` ✅
- `user_role_assignments` ✅
- `user_outlets` ✅
- `module_roles` ✅
- `companies` ✅
- `outlets` ✅
- `company_settings` ✅
- `platform_settings` ✅
- `feature_flags` ✅
- `modules` ✅ (includes `accounting` module)
- `company_modules` ✅

### Auth Tables ✅
- `audit_logs` ✅
- `auth_login_throttles` ✅
- `auth_oauth_accounts` ✅
- `auth_password_reset_throttles` ✅
- `auth_refresh_tokens` ✅
- `email_tokens` ✅
- `email_outbox` ✅

### POS Tables ✅
- `pos_transactions` ✅
- `pos_transaction_items` ✅
- `pos_transaction_payments` ✅
- `pos_transaction_taxes` ✅
- `pos_order_snapshots` ✅ (with `_ts` columns)
- `pos_order_snapshot_lines` ✅ (with `_ts` columns)
- `pos_order_updates` ✅ (with `_ts` columns)
- `pos_item_cancellations` ✅ (with `_ts` columns)

### Dine-in Tables ✅
- `table_occupancy` ✅
- `table_service_sessions` ✅
- `table_service_session_lines` ✅
- `table_events` ✅ (append-only)
- `table_service_session_checkpoints` ✅

### Accounting Tables ✅
- `accounts` ✅
- `account_types` ✅
- `journal_batches` ✅ (immutable)
- `journal_lines` ✅
- `account_balances_current` ✅

### Sales Tables ✅
- `sales_invoices` ✅
- `sales_invoice_lines` ✅
- `sales_invoice_taxes` ✅
- `sales_orders` ✅
- `sales_order_lines` ✅
- `sales_payments` ✅
- `sales_payment_splits` ✅
- `sales_credit_notes` ✅
- `sales_credit_note_lines` ✅

### Fixed Assets Tables ✅
- `fixed_assets` ✅
- `fixed_asset_categories` ✅
- `fixed_asset_books` ✅
- `fixed_asset_events` ✅
- `fixed_asset_disposals` ✅
- `asset_depreciation_plans` ✅
- `asset_depreciation_runs` ✅

### Tax & Items Tables ✅
- `tax_rates` ✅
- `company_tax_defaults` ✅
- `items` ✅
- `item_prices` ✅
- `item_groups` ✅
- `item_variants` ✅
- `item_images` ✅

### Reservation Tables ✅
- `reservations` ✅ (with `reservation_start_ts`, `reservation_end_ts`)
- `reservation_groups` ✅
- `outlet_tables` ✅

### Cash & Bank ✅
- `cash_bank_transactions` ✅

### Mappings ✅
- `company_account_mappings` ✅
- `outlet_account_mappings` ✅
- `company_payment_method_mappings` ✅
- `outlet_payment_method_mappings` ✅

### Other ✅
- `numbering_templates` ✅
- `fiscal_years` ✅
- `data_imports` ✅
- `sync_data_versions` ✅
- `supplies` ✅
- `static_pages` ✅
- `sync_operations` ✅

## Modules

| Module | Required | Purpose |
|--------|----------|---------|
| **platform** | ✅ Yes | Auth, organization, outlets, audit, numbering |
| **accounting** | ✅ Yes | Chart of accounts, journal posting, reports |
| **sales** | ❌ Optional | Service invoices, payments, light AR |
| **pos** | ❌ Optional | Offline-first transaction sync, posting rules |
| **inventory** | ❌ Optional | Stock movements, recipes, BOM |
| **purchasing** | ❌ Optional | PO, GRN, AP |

## Roles

| Role | Scope | Access |
|------|-------|--------|
| **SUPER_ADMIN** | Platform-wide | Full access |
| **OWNER** | Company-level | Full access + accounting |
| **COMPANY_ADMIN** | Company-level | Full access + accounting |
| **ADMIN** | Company-level | Full access + accounting |
| **ACCOUNTANT** | Company-level | Read + Report |
| **CASHIER** | Outlet-level | POS operations |

## Permission Bitmask

| Bit | Permission |
|-----|------------|
| 1 | create |
| 2 | read |
| 4 | update |
| 8 | delete |
| 16 | report |

**Permission Examples:**
- `2` = read only
- `3` = read + create
- `18` = read + report
- `31` = full access + report

## Known Technical Debt

See `_bmad-output/implementation-artifacts/debt-tracker.md` for tracked items.

## Changelog

See `CHANGELOG.md` for detailed feature changes.
