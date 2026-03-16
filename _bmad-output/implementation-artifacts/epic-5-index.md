# Epic 5: Settings - Tax, Payment, Module Configuration

**Status:** ✅ COMPLETE (Discovered - Already Existed)  
**Stories:** 3/3 Complete  
**Epic Type:** Configuration  
**Dependencies:** Epic 1 (Auth, Company), Epic 3 (Chart of Accounts)

---

## 📋 STORIES

### ✅ Story 5.1: Tax Rate Configuration
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Database:** `packages/db/migrations/0043_tax_rates.sql`
- **Tax Service:** `apps/api/src/lib/taxes.ts`
- **Tax Tests:** `apps/api/src/lib/taxes.test.ts`
- **Tax API:** `apps/api/app/api/settings/tax-rates/route.ts`
- **Tax Detail:** `apps/api/app/api/settings/tax-rates/[taxRateId]/route.ts`
- **Tax Defaults:** `apps/api/app/api/settings/tax-defaults/route.ts`
- **UI Page:** `apps/backoffice/src/features/tax-rates-page.tsx` (11,645 lines)

**Features:**
- Create tax rates with code, name, percentage
- Inclusive vs exclusive tax configuration
- Account mapping (links to chart of accounts)
- Company default tax configuration
- Multi-tax support (VAT + Service Charge)
- Activation/deactivation
- Tax transaction tracking
- POS tax calculation
- Sync version triggers

**Key Files:**
```
apps/api/src/lib/taxes.ts
apps/api/app/api/settings/tax-rates/route.ts
apps/backoffice/src/features/tax-rates-page.tsx
packages/db/migrations/0043_tax_rates.sql
```

---

### ✅ Story 5.2: Payment Method Configuration
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Database:** 
  - `packages/db/migrations/0012_outlet_payment_method_mappings.sql`
  - `packages/db/migrations/0081_company_payment_method_mappings.sql`
- **Payment API:** `apps/api/app/api/settings/outlet-payment-method-mappings/route.ts`
- **Account Mappings:** `apps/api/app/api/settings/outlet-account-mappings/route.ts`
- **UI Page:** `apps/backoffice/src/features/sales-payments-page.tsx` (55,114 lines)

**Features:**
- Outlet-scoped payment method mappings
- Company-wide default payment method mappings
- Custom labels for payment methods
- GL account mapping for each method
- Invoice default payment method
- Enable/disable payment methods
- Payment method types (Cash, Card, QR, Wallet)
- Method-specific settings (terminal ID, merchant ID)
- Inheritance from company to outlet

**Key Files:**
```
apps/api/app/api/settings/outlet-payment-method-mappings/route.ts
apps/api/app/api/settings/outlet-account-mappings/route.ts
apps/backoffice/src/features/sales-payments-page.tsx
packages/db/migrations/0012_outlet_payment_method_mappings.sql
```

---

### ✅ Story 5.3: Module Enable/Disable per Company
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Database:** `packages/db/migrations/0044_modules_company_modules.sql`
- **Module API:** `apps/api/app/api/settings/modules/route.ts`
- **Module Roles:** `apps/api/app/api/settings/module-roles/route.ts`
- **UI Pages:**
  - `apps/backoffice/src/features/modules-page.tsx` (587 lines)
  - `apps/backoffice/src/features/module-roles-page.tsx`
- **Shared Schemas:** `packages/shared/src/schemas/modules.ts`

**Features:**
- **9 Modules:** platform, pos, sales, inventory, purchasing, reports, settings, accounts, journals
- Company-module linkage with enabled flag
- JSON configuration storage per module
- Module-based route filtering
- Route protection via `requiredModule` property
- POS module config (tax settings, receipt templates)
- Inventory module config (costing, thresholds)
- Role-based module permissions
- Module enablement audit logging
- Sync triggers for module changes

**Key Files:**
```
apps/api/app/api/settings/modules/route.ts
apps/backoffice/src/features/modules-page.tsx
apps/backoffice/src/features/module-roles-page.tsx
packages/shared/src/schemas/modules.ts
packages/db/migrations/0044_modules_company_modules.sql
```

---

## 📊 TECHNICAL SPECIFICATIONS

### Tax System
- **Rate Types:** Percentage-based
- **Calculation:** Inclusive or exclusive
- **Account Mapping:** Tax liability accounts
- **Multi-tax:** Multiple rates per transaction
- **POS Integration:** Real-time calculation

### Payment Methods
- **Scope Levels:** Company and Outlet
- **Configuration:** Labels, accounts, defaults
- **GL Mapping:** Each method maps to asset account
- **Inheritance:** Outlet inherits from company

### Module System
- **Module Count:** 9 modules
- **Configuration:** JSON per module
- **Permissions:** Module + role-based
- **Route Protection:** Automatic filtering

### Database Tables
```
tax_rates
company_tax_defaults
outlet_payment_method_mappings
company_payment_method_mappings
modules
company_modules
module_roles
```

---

## 🔗 DEPENDENCIES

**Requires:**
- Epic 1 (Auth, Company) - User permissions, company scoping
- Epic 3 (Accounting) - Chart of accounts for mapping

**Used By:**
- Epic 2 (POS) - Tax calculation, payment methods
- Epic 4 (Items) - Item pricing with tax
- Epic 6 (Reporting) - Module-based report access
- Epic 7 (Sync) - Module configuration sync

---

## ✅ DEFINITION OF DONE

- [x] All 3 stories implemented
- [x] Tax rate CRUD with account mapping
- [x] Payment method configuration
- [x] Module enable/disable system
- [x] Company and outlet scoping
- [x] GL account integration
- [x] Route protection by module
- [x] Audit logging
- [x] UI components

---

**Epic 5 Status: COMPLETE ✅**  
**Full settings system operational with tax, payment, and module configuration.**
