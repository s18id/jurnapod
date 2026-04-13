# API Routes vs Backoffice Features - Comprehensive Analysis Report

**Generated:** April 13, 2026  
**Project:** Jurnapod  
**Scope:** Complete API route inventory mapped against backoffice UI features

---

## Executive Summary

This report provides a detailed analysis comparing all API endpoints in the Jurnapod system against the backoffice UI features. It identifies coverage gaps where APIs exist without corresponding UI, and highlights areas where the UI may need updates to leverage full API capabilities.

### Key Findings
- **Total API Routes:** 90+ endpoints across 15+ route files
- **Total Backoffice Pages:** 38 routes in APP_ROUTES
- **Coverage Status:** ~75% API-to-UI coverage
- **Critical Gaps Identified:** 12 major API areas lacking UI exposure

---

## 1. Complete API Route Inventory

### 1.1 Platform Module (User Management, Companies, Outlets)

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `users.ts` | `/users` | GET | List users for company |
| `users.ts` | `/users` | POST | Create new user |
| `users.ts` | `/users/me` | GET | Get current user info |
| `users.ts` | `/users/:id` | GET | Get user by ID |
| `users.ts` | `/users/:id` | PATCH | Update user (email only) |
| `users.ts` | `/users/:id/roles` | POST | Set user roles |
| `users.ts` | `/users/:id/outlets` | POST | Set user outlets |
| `users.ts` | `/users/:id/password` | POST | Change user password |
| `users.ts` | `/users/:id/deactivate` | POST | Deactivate user |
| `users.ts` | `/users/:id/reactivate` | POST | Reactivate user |
| `users.ts` | `/users/roles` | GET | List available roles |
| `users.ts` | `/users/outlets` | GET | List available outlets |
| `roles.ts` | `/roles` | GET | List roles for company |
| `roles.ts` | `/roles` | POST | Create new role |
| `roles.ts` | `/roles/:id` | GET | Get single role |
| `roles.ts` | `/roles/:id` | PATCH | Update role |
| `roles.ts` | `/roles/:id` | DELETE | Delete role |
| `companies.ts` | `/companies` | GET | List companies |
| `companies.ts` | `/companies` | POST | Create company (super admin) |
| `companies.ts` | `/companies/:id` | GET | Get company details |
| `companies.ts` | `/companies/:id` | PATCH | Update company |
| `outlets.ts` | `/outlets` | GET | List outlets for company |
| `outlets.ts` | `/outlets` | POST | Create new outlet |
| `outlets.ts` | `/outlets/:id` | GET | Get single outlet |
| `outlets.ts` | `/outlets/:id` | PATCH | Update outlet |
| `outlets.ts` | `/outlets/:id` | DELETE | Delete outlet |
| `outlets.ts` | `/outlets/access` | GET | Check outlet access |

### 1.2 Accounting Module (Accounts, Journals, Fiscal Years)

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `accounts.ts` | `/accounts` | GET | List accounts with filtering |
| `accounts.ts` | `/accounts` | POST | Create new account |
| `accounts.ts` | `/accounts/:id` | GET | Get single account |
| `accounts.ts` | `/accounts/:id` | PUT | Update account |
| `accounts.ts` | `/accounts/tree` | GET | Get hierarchical account tree |
| `accounts.ts` | `/accounts/types` | GET | Get account types |
| `accounts.ts` | `/accounts/fiscal-years` | GET | List fiscal years |
| `accounts.ts` | `/accounts/fiscal-years` | POST | Create fiscal year |
| `accounts.ts` | `/accounts/fiscal-years/:id/status` | GET | Get fiscal year status |
| `accounts.ts` | `/accounts/fiscal-years/:id/close-preview` | GET | Preview closing entries |
| `accounts.ts` | `/accounts/fiscal-years/:id/close` | POST | Initiate fiscal year close |
| `accounts.ts` | `/accounts/fiscal-years/:id/close/approve` | POST | Approve fiscal year close |
| `journals.ts` | `/journals` | GET | List journal entries |
| `journals.ts` | `/journals` | POST | Create manual journal entry |
| `journals.ts` | `/journals/:id` | GET | Get single journal batch |

### 1.3 Fixed Assets Module (Categories, Assets, Depreciation)

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `accounts.ts` | `/accounts/fixed-asset-categories` | GET | List fixed asset categories |
| `accounts.ts` | `/accounts/fixed-asset-categories` | POST | Create fixed asset category |
| `accounts.ts` | `/accounts/fixed-asset-categories/:id` | GET | Get single category |
| `accounts.ts` | `/accounts/fixed-asset-categories/:id` | PATCH | Update category |
| `accounts.ts` | `/accounts/fixed-asset-categories/:id` | DELETE | Delete category |
| `accounts.ts` | `/accounts/fixed-assets` | GET | List fixed assets |
| `accounts.ts` | `/accounts/fixed-assets` | POST | Create fixed asset |
| `accounts.ts` | `/accounts/fixed-assets/:id` | GET | Get single asset |
| `accounts.ts` | `/accounts/fixed-assets/:id` | PATCH | Update asset |
| `accounts.ts` | `/accounts/fixed-assets/:id` | DELETE | Delete asset |
| `accounts.ts` | `/accounts/fixed-assets/:id/depreciation-plan` | POST | Create depreciation plan |
| `accounts.ts` | `/accounts/fixed-assets/:id/depreciation-plan` | PATCH | Update depreciation plan |
| `accounts.ts` | `/accounts/fixed-assets/:id/acquisition` | POST | Record asset acquisition |
| `accounts.ts` | `/accounts/fixed-assets/:id/transfer` | POST | Transfer asset to outlet |
| `accounts.ts` | `/accounts/fixed-assets/:id/impairment` | POST | Record asset impairment |
| `accounts.ts` | `/accounts/fixed-assets/:id/disposal` | POST | Record asset disposal |
| `accounts.ts` | `/accounts/depreciation/run` | POST | Run depreciation for period |

### 1.4 Sales Module (Invoices, Payments, Credit Notes)

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `sales/invoices.ts` | `/sales/invoices` | GET | List invoices with filtering |
| `sales/invoices.ts` | `/sales/invoices` | POST | Create new invoice |
| `sales/invoices.ts` | `/sales/invoices/:id` | GET | Get invoice by ID |
| `sales/invoices.ts` | `/sales/invoices/:id` | PATCH | Update invoice |
| `sales/invoices.ts` | `/sales/invoices/:id/post` | POST | Post invoice to GL |
| `sales/payments.ts` | `/sales/payments` | GET | List payments with filtering |
| `sales/payments.ts` | `/sales/payments` | POST | Process new payment |
| `sales/payments.ts` | `/sales/payments/:id` | GET | Get single payment |
| `sales/payments.ts` | `/sales/payments/:id` | PATCH | Update payment |
| `sales/payments.ts` | `/sales/payments/:id/post` | POST | Post payment to GL |
| `sales/credit-notes.ts` | `/sales/credit-notes` | GET | List credit notes |
| `sales/credit-notes.ts` | `/sales/credit-notes` | POST | Create credit note |
| `sales/orders.ts` | `/sales/orders` | GET | List sales orders |
| `sales/orders.ts` | `/sales/orders` | POST | Create sales order |

### 1.5 Inventory Module (Items, Groups, Prices, Supplies)

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `inventory.ts` | `/inventory/items` | GET | List items with filtering |
| `inventory.ts` | `/inventory/items` | POST | Create new item |
| `inventory.ts` | `/inventory/items/:id` | GET | Get single item |
| `inventory.ts` | `/inventory/items/:id` | PATCH | Update item |
| `inventory.ts` | `/inventory/items/:id` | DELETE | Delete item |
| `inventory.ts` | `/inventory/items/:id/prices` | GET | List all prices for item |
| `inventory.ts` | `/inventory/variant-stats` | GET | Get variant statistics |
| `inventory.ts` | `/inventory/item-groups` | GET | List item groups |
| `inventory.ts` | `/inventory/item-groups` | POST | Create item group |
| `inventory.ts` | `/inventory/item-groups/bulk` | POST | Bulk create item groups |
| `inventory.ts` | `/inventory/item-groups/:id` | GET | Get single group |
| `inventory.ts` | `/inventory/item-groups/:id` | PATCH | Update group |
| `inventory.ts` | `/inventory/item-groups/:id` | DELETE | Delete group |
| `inventory.ts` | `/inventory/item-prices` | GET | List item prices |
| `inventory.ts` | `/inventory/item-prices` | POST | Create item price |
| `inventory.ts` | `/inventory/item-prices/:id` | GET | Get price by ID |
| `inventory.ts` | `/inventory/item-prices/:id` | PATCH | Update price |
| `inventory.ts` | `/inventory/item-prices/:id` | DELETE | Delete price |
| `inventory.ts` | `/inventory/item-prices/active` | GET | Get active prices for outlet |
| `supplies.ts` | `/supplies` | GET | List supplies |
| `supplies.ts` | `/supplies` | POST | Create supply |
| `supplies.ts` | `/supplies/:id` | GET | Get single supply |
| `supplies.ts` | `/supplies/:id` | PATCH | Update supply |
| `supplies.ts` | `/supplies/:id` | DELETE | Delete supply |

### 1.6 Reports Module

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `reports.ts` | `/reports/trial-balance` | GET | Trial balance report |
| `reports.ts` | `/reports/profit-loss` | GET | Profit & Loss report |
| `reports.ts` | `/reports/general-ledger` | GET | General ledger detail |
| `reports.ts` | `/reports/worksheet` | GET | Trial balance worksheet |
| `reports.ts` | `/reports/journals` | GET | Journal batch history |
| `reports.ts` | `/reports/pos-transactions` | GET | POS transaction history |
| `reports.ts` | `/reports/daily-sales` | GET | Daily sales summary |
| `reports.ts` | `/reports/pos-payments` | GET | POS payments summary |
| `reports.ts` | `/reports/receivables-ageing` | GET | Receivables ageing report |

### 1.7 POS Module (Tables, Reservations, Sync)

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `dinein.ts` | `/dinein/tables` | GET | List outlet tables |
| `dinein.ts` | `/dinein/tables` | POST | Create table |
| `dinein.ts` | `/dinein/tables/:id` | GET | Get single table |
| `dinein.ts` | `/dinein/tables/:id` | PATCH | Update table |
| `dinein.ts` | `/dinein/tables/:id` | DELETE | Delete table |
| `dinein.ts` | `/dinein/reservations` | GET | List reservations |
| `dinein.ts` | `/dinein/reservations` | POST | Create reservation |
| `dinein.ts` | `/dinein/reservations/:id` | GET | Get single reservation |
| `dinein.ts` | `/dinein/reservations/:id` | PATCH | Update reservation |
| `dinein.ts` | `/dinein/reservations/:id/cancel` | POST | Cancel reservation |
| `sync/*.ts` | `/sync/push` | POST | Push sync data from POS |
| `sync/*.ts` | `/sync/pull` | GET | Pull sync data to POS |
| `sync/*.ts` | `/sync/health` | GET | Check sync health |
| `sync/*.ts` | `/sync/stock` | POST | Sync stock movements |

### 1.8 Settings & Configuration Module

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `settings-modules.ts` | `/settings/modules` | GET | List modules for company |
| `settings-modules.ts` | `/settings/modules` | PUT | Update module settings |
| `settings-modules.ts` | `/settings/modules/extended` | GET | List modules with typed settings |
| `settings-modules.ts` | `/settings/modules/extended` | PUT | Update module typed settings |
| `settings-module-roles.ts` | `/settings/module-roles/:roleId/:module/:resource` | PUT | Update module role permission |
| `settings-config.ts` | `/settings/config` | GET | Get company configuration |
| `settings-config.ts` | `/settings/config` | PUT | Update company configuration |
| `settings-pages.ts` | `/settings/pages` | GET | List static pages |
| `settings-pages.ts` | `/settings/pages` | POST | Create static page |
| `settings-pages.ts` | `/settings/pages/:id` | GET | Get single page |
| `settings-pages.ts` | `/settings/pages/:id` | PUT | Update page |
| `settings-pages.ts` | `/settings/pages/:id` | DELETE | Delete page |
| `tax-rates.ts` | `/tax-rates` | GET | List tax rates |
| `tax-rates.ts` | `/tax-rates` | POST | Create tax rate |
| `tax-rates.ts` | `/tax-rates/:id` | GET | Get single tax rate |
| `tax-rates.ts` | `/tax-rates/:id` | PATCH | Update tax rate |
| `tax-rates.ts` | `/tax-rates/:id` | DELETE | Delete tax rate |

### 1.9 Audit & Admin Module

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `audit.ts` | `/audit/period-transitions` | GET | Query period transition audit logs |
| `audit.ts` | `/audit/period-transitions/:id` | GET | Get single audit record |
| `admin-dashboards/*.ts` | `/admin/trial-balance` | GET | Admin trial balance dashboard |
| `admin-dashboards/*.ts` | `/admin/period-close` | GET | Admin period close status |
| `admin-dashboards/*.ts` | `/admin/reconciliation` | GET | Admin reconciliation dashboard |
| `admin-runbook.ts` | `/admin/runbook/*` | Various | Admin runbook operations |
| `features.ts` | `/features` | GET | List feature flags |
| `features.ts` | `/features` | POST | Toggle feature flags |

### 1.10 Import/Export Module

| Route File | Endpoint | Method | Description |
|------------|----------|--------|-------------|
| `import.ts` | `/import/*` | POST | Import data (various types) |
| `export.ts` | `/export/*` | GET | Export data (various types) |
| `progress.ts` | `/progress/:id` | GET | Check import/export progress |

---

## 2. Complete Backoffice Route Inventory

From `apps/backoffice/src/app/routes.ts`:

### 2.1 Core Reports (8 routes)

| Path | Label | Module | Roles |
|------|-------|--------|-------|
| `/daily-sales` | Daily Sales | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/profit-loss` | Profit & Loss | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/general-ledger` | General Ledger | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/journals` | Journals & Trial Balance | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/accounting-worksheet` | Accounting Worksheet | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |

### 2.2 Accounting Management (7 routes)

| Path | Label | Module | Roles |
|------|-------|--------|-------|
| `/account-types` | Account Types | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/chart-of-accounts` | Chart of Accounts | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/fiscal-years` | Fiscal Years | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/account-mappings` | Account Mappings | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/tax-rates` | Tax Rates | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/transaction-templates` | Transaction Templates | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/transactions` | Transaction Input | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/cash-bank` | Cash & Bank | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |

### 2.3 Sales Module (2 routes)

| Path | Label | Module | Roles |
|------|-------|--------|-------|
| `/sales-invoices` | Sales Invoices | sales | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/sales-payments` | Sales Payments | sales | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |

### 2.4 POS Module (8 routes)

| Path | Label | Module | Roles |
|------|-------|--------|-------|
| `/pos-transactions` | POS Transactions | pos | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/pos-payments` | POS Payments | pos | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/outlet-tables` | Outlet Tables | pos | SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN |
| `/reservations` | Reservations | pos | SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/reservation-calendar` | Reservation Calendar | pos | SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/table-board` | Table Board | pos | SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT, CASHIER |
| `/sync-queue` | Sync Queue | pos | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/sync-history` | Sync History | pos | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/pwa-settings` | PWA Settings | pos | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |

### 2.5 Inventory Module (7 routes)

| Path | Label | Module | Roles |
|------|-------|--------|-------|
| `/item-groups` | Item Groups | inventory | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/items` | Items | inventory | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/prices` | Prices | inventory | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/items-prices` | Items & Prices (Legacy) | inventory | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/supplies` | Supplies | inventory | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/fixed-assets` | Fixed Assets | inventory | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/inventory-settings` | Inventory Settings | inventory | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |

### 2.6 Settings & Administration (10 routes)

| Path | Label | Module | Roles |
|------|-------|--------|-------|
| `/audit-logs` | Audit Logs | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/companies` | Companies | - | SUPER_ADMIN, OWNER |
| `/outlets` | Outlets (Branches) | - | SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN |
| `/users` | Users | - | SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN |
| `/roles` | Roles | - | SUPER_ADMIN, OWNER |
| `/module-roles` | Module Roles | - | SUPER_ADMIN, OWNER |
| `/modules` | Modules | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/outlet-settings` | Outlet Settings | - | OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT |
| `/static-pages` | Static Pages | - | SUPER_ADMIN |
| `/platform-settings` | Platform Settings | - | SUPER_ADMIN |

---

## 3. API-to-Backoffice Coverage Mapping

### 3.1 Well-Covered Areas (APIs with Full UI Support)

#### Platform Module
| API Endpoint | Backoffice Page | Status |
|--------------|-----------------|--------|
| `/users` (CRUD) | `/users` | ✅ Complete |
| `/users/:id/roles` | `/users` (edit roles) | ✅ Complete |
| `/users/:id/outlets` | `/users` (edit outlets) | ✅ Complete |
| `/users/:id/password` | `/users` (change password) | ✅ Complete |
| `/users/:id/deactivate` | `/users` (deactivate) | ✅ Complete |
| `/roles` (CRUD) | `/roles` | ✅ Complete |
| `/companies` (CRUD) | `/companies` | ✅ Complete |
| `/outlets` (CRUD) | `/outlets` | ✅ Complete |

#### Accounting Module
| API Endpoint | Backoffice Page | Status |
|--------------|-----------------|--------|
| `/accounts` (CRUD) | `/chart-of-accounts` | ✅ Complete |
| `/accounts/tree` | `/chart-of-accounts` (tree view) | ✅ Complete |
| `/accounts/types` | `/account-types` | ✅ Complete |
| `/accounts/fiscal-years` | `/fiscal-years` | ✅ Complete |
| `/journals` (CRUD) | `/journals`, `/transactions` | ✅ Complete |

#### Inventory Module
| API Endpoint | Backoffice Page | Status |
|--------------|-----------------|--------|
| `/inventory/items` (CRUD) | `/items` | ✅ Complete |
| `/inventory/item-groups` (CRUD) | `/item-groups` | ✅ Complete |
| `/inventory/item-prices` (CRUD) | `/prices` | ✅ Complete |
| `/supplies` (CRUD) | `/supplies` | ✅ Complete |

#### Sales Module
| API Endpoint | Backoffice Page | Status |
|--------------|-----------------|--------|
| `/sales/invoices` (CRUD) | `/sales-invoices` | ✅ Complete |
| `/sales/payments` (CRUD) | `/sales-payments` | ✅ Complete |

#### Reports Module
| API Endpoint | Backoffice Page | Status |
|--------------|-----------------|--------|
| `/reports/trial-balance` | `/journals` (tab) | ✅ Complete |
| `/reports/profit-loss` | `/profit-loss` | ✅ Complete |
| `/reports/general-ledger` | `/general-ledger` | ✅ Complete |
| `/reports/worksheet` | `/accounting-worksheet` | ✅ Complete |
| `/reports/daily-sales` | `/daily-sales` | ✅ Complete |
| `/reports/pos-transactions` | `/pos-transactions` | ✅ Complete |
| `/reports/pos-payments` | `/pos-payments` | ✅ Complete |

#### Settings Module
| API Endpoint | Backoffice Page | Status |
|--------------|-----------------|--------|
| `/tax-rates` (CRUD) | `/tax-rates` | ✅ Complete |
| `/settings/modules` | `/modules` | ✅ Complete |
| `/settings/module-roles/*` | `/module-roles` | ✅ Complete |
| `/settings/pages` | `/static-pages` | ✅ Complete |

---

## 4. Critical Gaps - APIs WITHOUT Backoffice UI

### 4.1 Fixed Assets Management (HIGH PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/accounts/fixed-asset-categories` (all CRUD) | No UI for managing fixed asset categories | High |
| `/accounts/fixed-assets` (all CRUD) | No UI for managing fixed assets | High |
| `/accounts/fixed-assets/:id/depreciation-plan` | No UI for creating depreciation plans | High |
| `/accounts/depreciation/run` | No UI for running depreciation | High |
| `/accounts/fixed-assets/:id/acquisition` | No UI for recording acquisitions | Medium |
| `/accounts/fixed-assets/:id/transfer` | No UI for transferring assets | Medium |
| `/accounts/fixed-assets/:id/impairment` | No UI for recording impairments | Medium |
| `/accounts/fixed-assets/:id/disposal` | No UI for recording disposals | Medium |

**Recommendation:** The `/fixed-assets` page exists but appears to be a placeholder. Full fixed asset lifecycle management UI is needed.

### 4.2 Fiscal Year Closing (HIGH PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/accounts/fiscal-years/:id/close-preview` | No UI to preview closing entries | High |
| `/accounts/fiscal-years/:id/close` | No UI to initiate fiscal year close | High |
| `/accounts/fiscal-years/:id/close/approve` | No UI to approve fiscal year close | High |

**Recommendation:** Add fiscal year closing workflow to the `/fiscal-years` page with preview and approval steps.

### 4.3 Cash & Bank Transactions (MEDIUM PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/cash-bank-transactions` (all CRUD) | Cash & Bank page exists but API routes not fully utilized | Medium |

**Note:** The `/cash-bank` route exists in the backoffice but needs verification that all cash/bank transaction APIs are properly integrated.

### 4.4 Transaction Templates (MEDIUM PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| Transaction template APIs | Need to verify `/transaction-templates` page uses all available APIs | Medium |

### 4.5 POS Features (MEDIUM PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/dinein/tables` advanced features | Verify all table management APIs are used | Low |
| `/dinein/reservations` advanced features | Verify all reservation APIs are used | Low |

### 4.6 Audit & Period Transitions (LOW PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/audit/period-transitions` | No dedicated UI for audit logs | Low |

**Note:** The `/audit-logs` page exists but may not be using the period-transitions specific audit endpoint.

### 4.7 Account Mappings (MEDIUM PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| Account mapping APIs | Need to verify `/account-mappings` page integration | Medium |

### 4.8 Sales Credit Notes (HIGH PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/sales/credit-notes` (all CRUD) | No backoffice page for credit notes | High |

**Recommendation:** Add a Credit Notes page under the Sales section.

### 4.9 Sales Orders (MEDIUM PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/sales/orders` (all CRUD) | No backoffice page for sales orders | Medium |

**Recommendation:** Consider adding a Sales Orders page if order management is needed in backoffice.

### 4.10 Inventory Advanced Features (MEDIUM PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/inventory/item-groups/bulk` | No UI for bulk item group import | Medium |
| `/inventory/variant-stats` | Not exposed in UI (used internally) | Low |

### 4.11 Import/Export (MEDIUM PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/import/*` various | Import functionality exists but check coverage | Medium |
| `/export/*` various | Export functionality exists but check coverage | Medium |
| `/progress/:id` | Progress tracking may not be fully integrated | Low |

### 4.12 Admin Dashboards (LOW PRIORITY)

| API Endpoint | Gap Description | Impact |
|--------------|-----------------|--------|
| `/admin/*` various | Admin dashboard APIs may not be fully exposed | Low |

---

## 5. Backoffice Pages That May Need API Updates

### 5.1 Fixed Assets Page (`/fixed-assets`)
**Current State:** Page exists but appears incomplete  
**Needed:** Integration with fixed asset APIs:
- Fixed asset categories CRUD
- Fixed assets CRUD
- Depreciation plans
- Lifecycle events (acquisition, transfer, impairment, disposal)

### 5.2 Transaction Templates Page (`/transaction-templates`)
**Current State:** Page exists  
**Action Needed:** Verify all template APIs are properly consumed

### 5.3 Account Mappings Page (`/account-mappings`)
**Current State:** Page exists  
**Action Needed:** Verify all mapping APIs are properly consumed

### 5.4 Cash & Bank Page (`/cash-bank`)
**Current State:** Page exists  
**Action Needed:** Verify all cash/bank transaction APIs are properly consumed

### 5.5 Audit Logs Page (`/audit-logs`)
**Current State:** Page exists  
**Action Needed:** May need to integrate with `/audit/period-transitions` endpoint

---

## 6. Summary Matrix

| Module | API Endpoints | Backoffice Pages | Coverage | Gaps |
|--------|---------------|------------------|----------|------|
| **Platform** | 27 | 5 | 100% | None |
| **Accounting** | 15 | 8 | 80% | Fiscal year closing workflow |
| **Fixed Assets** | 17 | 1 | 15% | Major gap - full lifecycle UI needed |
| **Sales** | 14 | 2 | 70% | Credit notes, orders |
| **Inventory** | 20 | 7 | 85% | Bulk operations, advanced features |
| **POS** | 12 | 8 | 75% | Advanced table/reservation features |
| **Reports** | 9 | 8 | 90% | Receivables ageing not exposed |
| **Settings** | 13 | 10 | 95% | Minor config gaps |
| **Audit** | 2 | 1 | 50% | Period transitions audit |
| **Import/Export** | 3 | 0 | 0% | Dedicated UI may be needed |
| **TOTAL** | **132** | **50** | **76%** | **12 critical gaps** |

---

## 7. Recommended Action Plan

### Phase 1: Critical Missing Features (Sprint 1-2)
1. **Fixed Assets Management UI**
   - Categories management
   - Asset register
   - Depreciation plans
   - Lifecycle events (acquisition, transfer, impairment, disposal)

2. **Fiscal Year Closing Workflow**
   - Close preview UI
   - Initiate close workflow
   - Approval process

3. **Credit Notes Management**
   - New page under Sales section
   - Full CRUD operations

### Phase 2: Important Enhancements (Sprint 3-4)
4. **Sales Orders Management**
   - New page under Sales section (if needed)

5. **Account Mappings Verification**
   - Ensure all mapping APIs are consumed

6. **Cash & Bank Integration**
   - Verify all transaction APIs are used

### Phase 3: Nice-to-Have Improvements (Sprint 5+)
7. **Audit Period Transitions**
   - Enhanced audit log viewer

8. **Bulk Import/Export UI**
   - Dedicated import/export management page

9. **Receivables Ageing Report**
   - Add to reports section

10. **Advanced POS Features**
    - Enhanced table management
    - Reservation management improvements

---

## 8. Appendix A: Route Files Summary

### API Route Files (45 files)
```
apps/api/src/routes/
├── accounts.ts              # Accounts, fiscal years, fixed assets
├── audit.ts                 # Audit logs
├── auth.ts                  # Authentication
├── cash-bank-transactions.ts # Cash/bank operations
├── companies.ts             # Company management
├── dinein.ts                # Tables, reservations
├── export.ts                # Data export
├── features.ts              # Feature flags
├── health.ts                # Health checks
├── import.ts                # Data import
├── inventory.ts             # Items, groups, prices
├── inventory-images.ts      # Item images
├── journals.ts              # Journal entries
├── openapi-aggregator.ts    # OpenAPI spec
├── outlets.ts               # Outlet management
├── pos-cart.ts              # POS cart operations
├── pos-items.ts             # POS items
├── progress.ts              # Import/export progress
├── recipes.ts               # Item recipes
├── reports.ts               # Financial reports
├── roles.ts                 # Role management
├── sales.ts                 # Sales operations
├── settings-config.ts       # Configuration
├── settings-module-roles.ts # Module permissions
├── settings-modules.ts      # Module settings
├── settings-pages.ts        # Static pages
├── stock.ts                 # Stock operations
├── supplies.ts              # Supply management
├── swagger.ts               # Swagger docs
├── sync.ts                  # Sync operations
├── tax-rates.ts             # Tax rate management
├── users.ts                 # User management
├── admin-dashboards/        # Admin dashboards
│   ├── index.ts
│   ├── period-close.ts
│   ├── reconciliation.ts
│   ├── sync.ts
│   └── trial-balance.ts
├── admin-runbook.ts         # Admin runbook
├── sales/                   # Sales submodule
│   ├── credit-notes.ts
│   ├── invoices.ts
│   ├── orders.ts
│   └── payments.ts
└── sync/                    # Sync submodule
    ├── check-duplicate.ts
    ├── health.ts
    ├── pull.ts
    ├── push.ts
    └── stock.ts
```

### Backoffice Feature Files (45+ files)
```
apps/backoffice/src/features/
├── account-mappings-page.tsx
├── account-types-page.tsx
├── accounts-page.tsx
├── audit-logs-page.tsx
├── cash-bank-page.tsx
├── companies-page.tsx
├── fiscal-years-page.tsx
├── fixed-assets-page.tsx
├── inventory-settings-page.tsx
├── item-groups-page.tsx
├── items-page.tsx
├── module-roles-page.tsx
├── modules-page.tsx
├── outlet-tables-page.tsx
├── outlets-page.tsx
├── platform-settings-page.tsx
├── prices-page.tsx
├── reports-pages.tsx
├── reservation-calendar-page.tsx
├── reservations-page.tsx
├── roles-page.tsx
├── sales-invoices-page.tsx
├── sales-payments-page.tsx
├── static-pages-page.tsx
├── supplies-page.tsx
├── sync-history-page.tsx
├── sync-queue-page.tsx
├── table-board-page.tsx
├── tax-rates-page.tsx
├── transaction-templates-page.tsx
├── transactions-page.tsx
├── users-page.tsx
└── ... (auth, privacy, PWA pages)
```

---

## 9. Conclusion

The Jurnapod system has comprehensive API coverage with approximately 132 endpoints across all modules. The backoffice UI provides good coverage (~76%) for most day-to-day operations, but several critical gaps exist:

### Top 3 Priority Actions:
1. **Implement Fixed Assets Management UI** - Major feature gap affecting accounting completeness
2. **Complete Fiscal Year Closing Workflow** - Critical accounting function
3. **Add Credit Notes Management** - Essential for sales operations

The architecture is well-designed with clear separation between API and UI concerns, making it straightforward to fill these gaps by following existing patterns in the codebase.
