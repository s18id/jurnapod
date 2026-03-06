<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Route Permission Audit

**Scope:** `apps/api/app/api/**/route.ts` (Next API routes)
**Date:** 2026-03-06

This audit enumerates route authorization patterns, identifies gaps, and highlights routes relying on inline checks.

---

## Legend

- **Public**: No `withAuth` guard (no JWT required)
- **withAuth**: Auth token required, no additional guard
- **requireRole** / **requireRoleForOutletQuery**: Role-only check (no module permission mask)
- **requireAccess** / **requireAccessForOutletQuery**: Role + module permission (plus outlet access when outletId is provided)
- **Manual check**: Inline `checkUserAccess` in handler (guard array empty)
- **Moved**: Route returns `410 ROUTE_MOVED`

---

## Auth & Public Routes

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/auth/login` | POST | Public | - | - | OK | Login (audit + throttle) |
| `/api/auth/logout` | POST | Public | - | - | OK | Refresh cookie revoke |
| `/api/auth/refresh` | POST | Public | - | - | OK | Refresh token rotation |
| `/api/auth/google` | POST | Public | - | - | OK | OAuth login |
| `/api/auth/password-reset` | POST | Public | - | - | OK | Reset request |
| `/api/auth/password-reset/confirm` | POST | Public | - | - | OK | Reset confirmation |
| `/api/auth/invite/accept` | POST | Public | - | - | OK | Invite accept |
| `/api/auth/email/verify/confirm` | POST | Public | - | - | OK | Email verify confirm |
| `/api/auth/email/verify` | POST | requireAccess | users | read | OK | Requires any role w/ users:read |
| `/api/pages/[slug]` | GET | Public | - | - | OK | Published static page |
| `/api/health` | GET | Public | - | - | OK | Healthcheck |
| `/api/cron/email-outbox` | POST | Public (secret) | - | - | OK | `x-cron-secret` required |

---

## Companies & Outlets

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/companies` | GET | requireAccess | companies | read | OK | Cross-company allowed for SUPER_ADMIN (inline check) |
| `/api/companies` | POST | requireAccess | companies | create | OK | SUPER_ADMIN only |
| `/api/companies/[companyId]` | GET | requireAccess | companies | read | OK | SUPER_ADMIN cross-company allowed |
| `/api/companies/[companyId]` | PATCH | requireAccess | companies | update | OK | SUPER_ADMIN cross-company allowed |
| `/api/companies/[companyId]` | DELETE | requireAccess | companies | delete | OK | SUPER_ADMIN required |
| `/api/outlets` | GET | requireAccess | outlets | read | OK | SUPER_ADMIN can query other company |
| `/api/outlets` | POST | requireAccess | outlets | create | OK | SUPER_ADMIN can target other company |
| `/api/outlets/[outletId]` | GET | requireAccess | outlets | read | OK | SUPER_ADMIN cross-company allowed |
| `/api/outlets/[outletId]` | PATCH | requireAccess | outlets | update | OK | SUPER_ADMIN cross-company allowed |
| `/api/outlets/[outletId]` | DELETE | requireAccess | outlets | delete | OK | SUPER_ADMIN cross-company allowed |
| `/api/outlets/access` | GET | requireAccess | outlets | read | OK | Outlet access probe (requires outletId) |

---

## Users & Roles

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/users` | GET | requireAccess | users | read | OK | - |
| `/api/users` | POST | requireAccess | users | create | OK | SUPER_ADMIN may create cross-company |
| `/api/users/[userId]` | GET | requireAccess | users | read | OK | - |
| `/api/users/[userId]` | PATCH | requireAccess | users | update | OK | - |
| `/api/users/[userId]/roles` | POST | requireAccess | users | update | OK | - |
| `/api/users/[userId]/outlets` | POST | requireAccess | users | update | OK | - |
| `/api/users/[userId]/password` | POST | requireAccess | users | update | OK | - |
| `/api/users/[userId]/invite` | POST | requireAccess | users | update | OK | - |
| `/api/users/[userId]/deactivate` | POST | requireAccess | users | update | OK | - |
| `/api/users/[userId]/reactivate` | POST | requireAccess | users | update | OK | - |
| `/api/users/me` | GET | withAuth | - | - | OK | No module permission (self profile) |
| `/api/roles` | GET | requireAccess | roles | read | OK | - |
| `/api/roles` | POST | requireAccess | roles | create | OK | - |
| `/api/roles/[roleId]` | GET | requireAccess | roles | read | OK | - |
| `/api/roles/[roleId]` | PATCH | requireAccess | roles | update | OK | - |
| `/api/roles/[roleId]` | DELETE | requireAccess | roles | delete | OK | - |

---

## Settings & Platform

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/settings/config` | GET | requireAccessForOutletQuery | settings | read | OK | Outlet-aware |
| `/api/settings/config` | PUT | requireAccess | settings | update | OK | OutletId from body via guard resolver |
| `/api/settings/outlet-account-mappings` | GET | requireAccessForOutletQuery | settings | read | OK | Outlet-aware |
| `/api/settings/outlet-account-mappings` | PUT | requireAccess | settings | update | OK | OutletId from body via guard resolver |
| `/api/settings/outlet-payment-method-mappings` | GET | requireAccessForOutletQuery | settings | read | OK | Outlet-aware |
| `/api/settings/outlet-payment-method-mappings` | PUT | requireAccess | settings | update | OK | OutletId from body via guard resolver |
| `/api/settings/feature-flags` | GET | requireAccess | settings | read | OK | - |
| `/api/settings/feature-flags` | PUT | requireAccess | settings | update | OK | Returns 410 (read-only) |
| `/api/settings/modules` | GET | requireAccess | settings | read | OK | - |
| `/api/settings/modules` | PUT | requireAccess | settings | update | OK | - |
| `/api/settings/tax-defaults` | GET | requireAccess | settings | read | OK | - |
| `/api/settings/tax-defaults` | PUT | requireAccess | settings | update | OK | - |
| `/api/settings/tax-rates` | GET | requireAccess | settings | read | OK | - |
| `/api/settings/tax-rates` | POST | requireAccess | settings | create | OK | - |
| `/api/settings/tax-rates/[taxRateId]` | PUT | requireAccess | settings | update | OK | - |
| `/api/settings/tax-rates/[taxRateId]` | DELETE | requireAccess | settings | delete | OK | - |
| `/api/settings/module-roles` | GET | requireAccess | settings | read | OK | - |
| `/api/settings/module-roles/[roleId]/[module]` | GET | requireAccess | settings | read | OK | - |
| `/api/settings/module-roles/[roleId]/[module]` | PUT | requireAccess | settings | update | OK | - |
| `/api/settings/pages` | GET | requireAccess | settings | read | OK | SUPER_ADMIN only |
| `/api/settings/pages` | POST | requireAccess | settings | create | OK | SUPER_ADMIN only |
| `/api/settings/pages/[pageId]` | GET | requireAccess | settings | read | OK | SUPER_ADMIN only |
| `/api/settings/pages/[pageId]` | PATCH | requireAccess | settings | update | OK | SUPER_ADMIN only |
| `/api/settings/pages/[pageId]/publish` | POST | requireAccess | settings | update | OK | SUPER_ADMIN only |
| `/api/settings/pages/[pageId]/unpublish` | POST | requireAccess | settings | update | OK | SUPER_ADMIN only |
| `/api/settings/mailer-test` | POST | requireAccess | settings | update | OK | SUPER_ADMIN only |
| `/api/platform/settings` | GET | requireAccess | settings | read | OK | SUPER_ADMIN only |
| `/api/platform/settings` | PUT | requireAccess | settings | update | OK | SUPER_ADMIN only |

---

## Reports

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/reports/trial-balance` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/reports/daily-sales` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/reports/journals` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/reports/pos-transactions` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/reports/pos-payments` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/reports/profit-loss` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/reports/general-ledger` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/reports/worksheet` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |

---

## Sales

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/sales/invoices` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/sales/invoices` | POST | Manual check | - | - | Gap | Empty guard array; inline role/outlet check only |
| `/api/sales/invoices/[invoiceId]` | GET | requireRole | - | - | OK | No module permission enforcement |
| `/api/sales/invoices/[invoiceId]` | PATCH | requireRole | - | - | OK | No module permission enforcement |
| `/api/sales/invoices/[invoiceId]/post` | POST | requireRole | - | - | OK | No module permission enforcement |
| `/api/sales/invoices/[invoiceId]/pdf` | GET | requireRole | - | - | OK | No module permission enforcement |
| `/api/sales/invoices/[invoiceId]/print` | GET | requireRole | - | - | OK | No module permission enforcement |
| `/api/sales/payments` | GET | requireRoleForOutletQuery | - | - | OK | No module permission enforcement |
| `/api/sales/payments` | POST | Manual check | - | - | Gap | Empty guard array; inline role/outlet check only |
| `/api/sales/payments/[paymentId]` | GET | requireRole | - | - | OK | No module permission enforcement |
| `/api/sales/payments/[paymentId]` | PATCH | requireRole | - | - | OK | No module permission enforcement |
| `/api/sales/payments/[paymentId]/post` | POST | requireRole | - | - | OK | No module permission enforcement |

---

## Inventory & Master Data

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/inventory/items` | GET | requireAccess | inventory | read | OK | - |
| `/api/inventory/items` | POST | requireAccess | inventory | create | OK | - |
| `/api/inventory/items/[itemId]` | GET | requireAccess | inventory | read | OK | - |
| `/api/inventory/items/[itemId]` | PATCH | requireAccess | inventory | update | OK | - |
| `/api/inventory/items/[itemId]` | DELETE | requireAccess | inventory | delete | OK | - |
| `/api/inventory/item-prices` | GET | requireAccessForOutletQuery | inventory | read | OK | Outlet-aware |
| `/api/inventory/item-prices` | POST | Manual check | inventory | create | Gap | Empty guard array; inline access check |
| `/api/inventory/item-prices/active` | GET | requireAccess | inventory | read | OK | OutletId required |
| `/api/inventory/supplies` | GET | requireAccess | inventory | read | OK | - |
| `/api/inventory/supplies` | POST | requireAccess | inventory | create | OK | - |

---

## Accounts & Fixed Assets

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/accounts` | GET | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts` | POST | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/[accountId]` | GET | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/[accountId]` | PUT | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/[accountId]` | DELETE | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/tree` | GET | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/types` | GET | requireAccess | accounts | read | OK | - |
| `/api/accounts/types` | POST | requireAccess | accounts | create | OK | - |
| `/api/accounts/fiscal-years` | GET | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/fiscal-years` | POST | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/fiscal-years/[fiscalYearId]` | GET | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/fiscal-years/[fiscalYearId]` | PUT | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/[accountId]/usage` | GET | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/[accountId]/reactivate` | POST | requireRole | - | - | Gap | No module permission enforcement |
| `/api/accounts/imports` | POST | requireAccess | accounts | create | OK | - |
| `/api/accounts/depreciation/run` | POST | requireAccess | accounts | update | OK | - |
| `/api/accounts/fixed-asset-categories` | GET | requireAccess | accounts | read | OK | - |
| `/api/accounts/fixed-asset-categories` | POST | requireAccess | accounts | create | OK | - |
| `/api/accounts/fixed-asset-categories/[categoryId]` | GET | requireAccess | accounts | read | OK | - |
| `/api/accounts/fixed-asset-categories/[categoryId]` | PATCH | requireAccess | accounts | update | OK | - |
| `/api/accounts/fixed-asset-categories/[categoryId]` | DELETE | requireAccess | accounts | delete | OK | - |
| `/api/accounts/fixed-assets` | GET | requireAccess | accounts | read | OK | - |
| `/api/accounts/fixed-assets` | POST | requireAccess | accounts | create | OK | - |
| `/api/accounts/fixed-assets/[assetId]` | GET | requireAccess | accounts | read | OK | - |
| `/api/accounts/fixed-assets/[assetId]` | PATCH | requireAccess | accounts | update | OK | - |
| `/api/accounts/fixed-assets/[assetId]` | DELETE | requireAccess | accounts | delete | OK | - |
| `/api/accounts/fixed-assets/[assetId]/depreciation-plan` | GET | requireAccess | accounts | read | OK | - |
| `/api/accounts/fixed-assets/[assetId]/depreciation-plan` | POST | requireAccess | accounts | create | OK | - |
| `/api/accounts/fixed-assets/[assetId]/depreciation-plan` | PATCH | requireAccess | accounts | update | OK | - |

---

## Journals & Audit Logs

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/journals` | GET | requireRoleForOutletQuery | - | - | Gap | No module permission enforcement |
| `/api/journals` | POST | Manual check | - | - | Gap | Empty guard array; inline role/outlet check only |
| `/api/journals/[batchId]` | GET | requireRole | - | - | Gap | No module permission enforcement |
| `/api/audit-logs` | GET | requireRole | - | - | Gap | No module permission enforcement |

---

## POS Sync

| Route | Method | Guard | Module | Permission | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/sync/pull` | GET | requireAccess | - | - | OK | Outlet access enforced by guard resolver |
| `/api/sync/push` | POST | requireAccess | - | - | OK | Outlet access enforced by guard resolver |

---

## Route Moved (410)

These legacy routes return `410 ROUTE_MOVED` and are public by design:

- `/api/items`, `/api/items/[itemId]` → `/api/inventory/items`
- `/api/item-prices`, `/api/item-prices/[priceId]` → `/api/inventory/item-prices`
- `/api/supplies`, `/api/supplies/[supplyId]` → `/api/inventory/supplies`
- `/api/account-types/*` → `/api/accounts/types`
- `/api/accounting/imports` → `/api/accounts/imports`
- `/api/fixed-asset-categories/*` → `/api/accounts/fixed-asset-categories`
- `/api/fixed-assets/*` → `/api/accounts/fixed-assets`
- `/api/outlet-access` → `/api/outlets/access`
- `/api/outlet-account-mappings` → `/api/settings/outlet-account-mappings`
- `/api/outlet-payment-method-mappings` → `/api/settings/outlet-payment-method-mappings`
- `/api/admin/pages*` → `/api/settings/pages*`
- `/api/module-roles*` → `/api/settings/module-roles*`
- `/api/me` → `/api/users/me`

---

## Gaps & Recommendations

1. **Module permissions not enforced** for many routes that use `requireRole`/`requireRoleForOutletQuery` only:
   - Reports (`/api/reports/*`)
   - Journals (`/api/journals/*`)
   - Accounts core (`/api/accounts`, `/api/accounts/*` except types/imports/fixed-assets)
   - Audit logs (`/api/audit-logs`)
   - Sales (`/api/sales/*`)

2. **Manual access checks in handlers** (empty guard arrays) should be centralized in guards:
   - `/api/sales/invoices` POST
   - `/api/sales/payments` POST
   - `/api/journals` POST
   - `/api/inventory/item-prices` POST

3. **withAuth only (no guard)**:
   - `/api/users/me` (likely intentional, but note it bypasses module permission checks).

---

## Next Actions

1. Add module permission checks for reports, journals, accounts (core), audit logs, and sales routes.
2. Replace manual `checkUserAccess` in handlers with `requireAccess`/`requireAccessForOutletQuery` guard patterns.
3. Review whether `users/me` should require a lightweight permission (optional).
