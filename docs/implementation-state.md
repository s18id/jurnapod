# Jurnapod Implementation State

## Current Sprint Status

| Epic | Status | Stories |
|------|--------|---------|
| Epic 1: Foundation | in-progress | 1.1 ✅, 1.2 ✅, 1.3 🔄, 1.4 ⏳, 1.5 ⏳, 1.6 ⏳, 1.7 ⏳ |
| Epic 2: POS | backlog | 2.1-2.6 ⏳ |
| Epic 3: Accounting | backlog | 3.1-3.5 ⏳ |
| Epic 4: Items & Catalog | backlog | 4.1-4.3 ⏳ |
| Epic 5: Settings | backlog | 5.1-5.3 ⏳ |
| Epic 6: Reporting | backlog | 6.1-6.3 ⏳ |

## Implemented Features

### Auth & RBAC
| Feature | Status | File/Route |
|---------|--------|------------|
| Email/Password Login | ✅ Done | `apps/api/app/api/auth/login/route.ts` |
| Google SSO | ✅ Done | `apps/api/app/api/auth/google/route.ts` |
| JWT Token + Refresh | ✅ Done | `apps/api/app/api/auth/refresh/route.ts` |
| Roles CRUD | ✅ Done | `apps/api/app/api/roles/route.ts`, `[roleId]/route.ts` |
| Permissions Endpoint | ✅ Done | `apps/api/app/api/permissions/route.ts` (just created) |
| RBAC Middleware | ✅ Done | `apps/api/src/lib/auth-guard.ts` |
| Module Permissions | ✅ Done | `apps/api/src/lib/auth.ts` (checkUserAccess) |

### User Management
| Feature | Status | File/Route |
|---------|--------|------------|
| User CRUD | ✅ Done | `apps/api/app/api/users/**` |
| User Roles | ✅ Done | `apps/api/app/api/users/[userId]/roles/route.ts` |

### Company & Outlet
| Feature | Status | File/Route |
|---------|--------|------------|
| Company CRUD | ✅ Done | `apps/api/app/api/companies/**` |
| Outlet CRUD | ✅ Done | `apps/api/app/api/outlets/**` |
| Company Settings | ✅ Done | `apps/api/app/api/settings/company/**` |
| Platform Settings | ✅ Done | `apps/api/app/api/settings/platform/**` |
| Feature Flags | ✅ Done | `apps/api/app/api/feature-flags/**` |

### POS (Epic 2)
| Feature | Status | File/Route |
|---------|--------|------------|
| Cart + Items | ⏳ | Not implemented |
| Discounts | ⏳ | Not implemented |
| Multi-payment | ⏳ | Not implemented |
| Offline Mode | ⏳ | Not implemented |
| Sync | ⏳ | Not implemented |

### Accounting (Epic 3)
| Feature | Status | File/Route |
|---------|--------|------------|
| Auto Journal Entry | ⏳ | Not implemented |
| Manual Journal | ⏳ | Not implemented |
| Trial Balance | ⏳ | Not implemented |
| GL Report | ⏳ | Not implemented |

## API Routes Summary

```
/api/auth/
├── login/           ✅
├── google/          ✅
├── refresh/         ✅
├── logout/          ✅
├── password-reset/  ✅
├── invite/accept/   ✅
└── email/verify/    ✅

/api/users/          ✅ (full CRUD)
/api/roles/         ✅ (full CRUD)
/api/permissions/   ✅ (GET - list all)
/api/companies/     ✅ (full CRUD)
/api/outlets/       ✅ (full CRUD)

/api/sync/push     ✅ (POS sync)
```

## Database Schema Status

### Core Tables
- `users` ✅
- `roles` ✅
- `user_role_assignments` ✅ (replaces user_roles)
- `user_outlets` ✅
- `module_roles` ✅
- `companies` ✅
- `outlets` ✅
- `company_settings` ✅
- `platform_settings` ✅
- `feature_flags` ✅

### POS Tables
- `pos_transactions` ✅
- `pos_transaction_items` ✅
- `pos_transaction_payments` ✅
- `pos_transaction_taxes` ✅
- `pos_order_snapshots` ✅
- `pos_order_snapshot_lines` ✅
- `pos_order_updates` ✅
- `pos_item_cancellations` ✅
- `outlet_tables` ✅
- `reservations` ✅

### Accounting Tables
- `accounts` ✅
- `account_types` ✅
- `journal_batches` ✅
- `journal_lines` ✅
- `account_balances_current` ✅

### Sales Tables
- `sales_invoices` ✅
- `sales_invoice_lines` ✅
- `sales_invoice_taxes` ✅
- `sales_orders` ✅
- `sales_order_lines` ✅
- `sales_payments` ✅
- `sales_payment_splits` ✅
- `sales_credit_notes` ✅
- `sales_credit_note_lines` ✅

### Fixed Assets Tables
- `fixed_assets` ✅
- `fixed_asset_categories` ✅
- `fixed_asset_books` ✅
- `fixed_asset_events` ✅
- `fixed_asset_disposals` ✅
- `asset_depreciation_plans` ✅
- `asset_depreciation_runs` ✅

### Tax & Items Tables
- `tax_rates` ✅
- `company_tax_defaults` ✅
- `items` ✅
- `item_prices` ✅
- `item_groups` ✅

### Cash & Bank
- `cash_bank_transactions` ✅

## Known Gaps

1. **JWT doesn't include roles** - Every request queries DB for permissions
2. **No permission caching** - Performance concern for high traffic

## Tech Stack

- **Runtime**: Node.js 20.x
- **API**: Next.js 14 (App Router)
- **Database**: MySQL 8.0 / MariaDB
- **Auth**: JWT (jose), Argon2id
- **Roles**: SUPER_ADMIN, OWNER, ADMIN, ACCOUNTANT, CASHIER
- **Modules**: companies, users, roles, outlets, accounts, journals, cash_bank, sales, inventory, purchasing, reports, settings, pos

## Permission Bitmask

| Bit | Permission |
|-----|------------|
| 1 | create |
| 2 | read |
| 4 | update |
| 8 | delete |
