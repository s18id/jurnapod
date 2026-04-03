# Technical Specification: API Detachment Public Contracts

**Status:** Active  
**Date:** 2026-04-03  
**Owner:** BMAD Architect  
**Scope:** Public API contracts for migrated domain packages in Epic 23

---

## 1. Overview

### 1.1 Objective

Document and stabilize public exports for migrated packages with versioning guidance and anti-breaking-change policy. These public contracts are the API that API adapters and other consumers depend on.

### 1.2 Packages Covered

| Package | Path | Epic | Status |
|---------|------|------|--------|
| `@jurnapod/modules-accounting` | `packages/modules/accounting/src/index.ts` | 23-2 | Done |
| `@jurnapod/modules-platform` | `packages/modules/platform/src/index.ts` | 23-1 | Done |
| `@jurnapod/modules-sales` | `packages/modules/sales/src/index.ts` | 23-3 | Done |
| `@jurnapod/modules-inventory` | `packages/modules/inventory/src/index.ts` | 23-3 | Done |
| `@jurnapod/modules-reservations` | `packages/modules/reservations/src/index.ts` | 23-3 | Done |
| `@jurnapod/modules-reporting` | `packages/modules/reporting/src/index.ts` | 23-3 | Done |
| `@jurnapod/notifications` | `packages/notifications/src/index.ts` | 23-1 | Done |
| `@jurnapod/telemetry` | `packages/telemetry/src/index.ts` | 23-1 | Done |
| `@jurnapod/modules-inventory-costing` | `packages/modules/inventory-costing/src/index.ts` | 24 | Done |

### 1.3 Anti-Breaking-Change Policy

**Golden Rule:** A package's public API is a promise. Breaking it breaks all consumers.

1. **Explicit Over Implicit Exports**
   - All public exports MUST be explicit in `index.ts`.
   - Controlled barrel re-exports via `export *` from stable, intentional public subpath modules are permitted (e.g., `export * from "./slo.js"`, `export * from "./classification/index.js"`).
   - Wildcard exports of unstable or internal-only modules are forbidden. A subpath module is considered a stable public contract when it is documented as part of the package's public API and its exports are intentionally exposed.
   - The distinction is enforced by ESLint `no-restricted-imports` rules (see Section 4.3).

2. **Types Only, Not Implementations**
   - Public API exposes types, interfaces, factory functions, and service contracts.
   - Internal implementations (classes, helpers) stay private unless explicitly exported.

3. **Additive Changes Only**
   - New exports are allowed.
   - Renaming/moving exports requires deprecation cycle (see Section 3).

4. **No Internal Path Imports**
   - External consumers MUST import only from package root (`@jurnapod/pkg`) not internal paths (`@jurnapod/pkg/src/foo`).

---

## 2. Public Export Documentation by Package

### 2.1 `@jurnapod/modules-accounting`

**Location:** `packages/modules/accounting/src/index.ts`

**Purpose:** Chart of accounts, journal generation, posting integrity, reconciliation, and import mapping.

```typescript
// From ./posting/index.js
export * from "./posting/index.js";  // PostingMapper, posting engines

// From service barrels
export * from "./accounts-service";
export * from "./account-types-service";
export * from "./journals-service";
export * from "./reconciliation/index.js";

// Public class (implements PostingMapper for imports)
export class AccountingImportMapper { ... }
```

**Public Contracts:**
- `PostingMapper` interface (for import integration)
- Journal posting functions: `postSalesInvoice`, `postSalesPayment`, `postCreditNote`, `voidCreditNote`
- Account service functions
- Reconciliation service functions

**Module Stub:** None (required module)

---

### 2.2 `@jurnapod/modules-platform`

**Location:** `packages/modules/platform/src/index.ts`

**Purpose:** Audit, feature flags, and settings infrastructure.

```typescript
// Feature flag types
export type FeatureFlagKey =
  | "pos.enabled"
  | "sales.enabled"
  | "cashbank.enabled"
  | "inventory.enabled"
  | "purchasing.enabled"
  | "recipes.enabled";

// From barrels
export * from "./audit";
export * from "./audit-service";
export * from "./feature-flags";
export * from "./settings";
```

**Public Named Exports:**
- `FeatureFlagKey` union type

**Public Subpath Exports (stable public contracts via barrel re-export):**

| Subpath | Contents |
|---------|----------|
| `./audit` | Audit utilities, types, and helper functions |
| `./audit-service` | Audit service implementation |
| `./feature-flags` | Feature flag checker functions and types |
| `./settings` | Settings access functions and types |

**Public Contracts:**
- Audit utilities and services
- Feature flag checker functions
- Settings access functions

**Module Stub:** None (required module)

---

### 2.3 `@jurnapod/modules-sales`

**Location:** `packages/modules/sales/src/index.ts`

**Purpose:** Orders, invoices, payments, and credit notes.

```typescript
// Interfaces (AccessScopeChecker seam)
export {
  type AccessScopeChecker,
  SalesPermissions,
  type SalesPermission,
  SalesAuthorizationError
} from "./interfaces/access-scope-checker.js";

// Invoice types
export type {
  SalesInvoice, SalesInvoiceLine, SalesInvoiceTax, SalesInvoiceDetail,
  InvoiceListFilters, InvoiceLineInput, InvoiceTaxInput, InvoiceDueTerm
} from "./types/invoices.js";
export { InvoiceStatusError, INVOICE_DUE_TERM_DAYS } from "./types/invoices.js";

// Repository interfaces
export type {
  SalesInvoicePostingData, StockItem, CogsPostingResult,
  StockDeductResult, DeductStockForSaleResult
} from "./interfaces/repository.js";

// Order types
export type {
  SalesOrder, SalesOrderLine, SalesOrderDetail, SalesOrderStatus,
  OrderLineInput, OrderListFilters, MutationActor, ItemLookup
} from "./types/sales.js";
export { SalesConflictError, SalesReferenceError } from "./types/sales.js";

// Credit Note types
export type {
  SalesCreditNoteDetail, SalesCreditNoteLine, SalesCreditNoteStatus,
  CreditNoteLineInput, CreateCreditNoteInput, UpdateCreditNoteInput,
  CreditNoteListFilters, CreditCapacity
} from "./types/credit-notes.js";

// Payment types
export type {
  SalesPayment, SalesPaymentSplit, SalesPaymentStatus, SalesPaymentMethod,
  PaymentSplitInput, CreatePaymentInput, UpdatePaymentInput,
  PostPaymentInput, PaymentListFilters, CanonicalPaymentInput
} from "./types/payments.js";
export { PaymentStatusError, PaymentAllocationError } from "./types/payments.js";

// Services
export {
  createOrderService, type OrderService, type OrderServiceDeps, type SalesDb, type SalesDbExecutor,
  resolveDueDate, type ResolveDueDateInput,
  DatabaseConflictError, DatabaseReferenceError, DatabaseForbiddenError
} from "./services/index.js";

export { createInvoiceService, type InvoiceService, type InvoiceServiceDeps } from "./services/invoice-service.js";

export { createCreditNoteService, type CreditNoteService, type CreditNoteServiceDeps } from "./services/index.js";

// Module stub
export type SalesModuleStub = "sales";
```

**Public Contracts:**
- `AccessScopeChecker` interface
- `OrderService`, `InvoiceService`, `CreditNoteService` factory functions
- Domain types for orders, invoices, payments, credit notes
- `SalesDb` / `SalesDbExecutor` repository interfaces
- Error classes: `SalesConflictError`, `SalesReferenceError`, `SalesAuthorizationError`, `DatabaseConflictError`, `DatabaseReferenceError`, `DatabaseForbiddenError`, `PaymentStatusError`, `PaymentAllocationError`, `InvoiceStatusError`

**Module Stub:** `"sales"` (optional)

---

### 2.4 `@jurnapod/modules-inventory`

**Location:** `packages/modules/inventory/src/index.ts`

**Purpose:** Item, item-group, item-price, item-variant, stock, recipe, and supplies operations.

```typescript
// Re-export all interfaces
export * from "./interfaces/index.js";

// Re-export all services (actual implementations)
export * from "./services/index.js";

// Re-export error classes
export * from "./errors.js";
```

**Public Subpath Exports (stable public contracts via barrel re-export):**

| Subpath | Contents |
|---------|----------|
| `./interfaces/index.js` | Service interfaces and type contracts |
| `./services/index.js` | Service implementations |
| `./errors.js` | Error classes |

**Public Contracts:**
- All service interfaces and implementations
- Error classes from `errors.js`

**Module Stub:** None (optional)

---

### 2.5 `@jurnapod/modules-reservations`

**Location:** `packages/modules/reservations/src/index.ts`

**Purpose:** Reservation management with canonical timestamp contracts and overlap rules.

```typescript
// Time model exports (canonical timestamp contracts, overlap rules, timezone resolution)
export * from "./time/index.js";

// Interface exports (service contracts, types)
export * from "./interfaces/index.js";

// Reservations domain module
export * from "./reservations/index.js";

// Table occupancy module
export * from "./table-occupancy/index.js";

// Outlet tables module
export * from "./outlet-tables/index.js";

// Service sessions module
export * from "./service-sessions/index.js";

// Table sync module
export * from "./table-sync/index.js";

// Module type marker
export type ReservationsModuleStub = "reservations";
```

**Public Subpath Exports (stable public contracts via barrel re-export):**

| Subpath | Contents |
|---------|----------|
| `./time/index.js` | Canonical timestamp contracts, overlap rules, timezone resolution |
| `./interfaces/index.js` | Service contracts and types |
| `./reservations/index.js` | Reservations domain module |
| `./table-occupancy/index.js` | Table occupancy operations |
| `./outlet-tables/index.js` | Outlet tables management |
| `./service-sessions/index.js` | Service sessions module |
| `./table-sync/index.js` | Table sync operations |

**Public Contracts:**
- Time model: timestamp types, overlap checking functions
- Service interfaces for reservations, tables, occupancy, service sessions
- Module stub: `ReservationsModuleStub`

**Module Stub:** `"reservations"` (optional)

---

### 2.6 `@jurnapod/modules-reporting`

**Location:** `packages/modules/reporting/src/index.ts`

**Purpose:** Report classification, contracts, interfaces, and query services.

```typescript
// Classification exports
export * from "./classification/index.js";

// Contract exports
export * from "./contracts/index.js";

// Interface exports
export * from "./interfaces/index.js";

// Report services exports
export * from "./reports/index.js";
```

**Public Subpath Exports (stable public contracts via barrel re-export):**

| Subpath | Contents |
|---------|----------|
| `./classification/index.js` | Report classification taxonomy (`ReportType`, `REPORT_CLASSIFICATIONS`, `isJournalSourcedReport`) |
| `./contracts/index.js` | Report contracts, types, filters, and telemetry assumptions |
| `./interfaces/index.js` | Report service interfaces for dependency injection (`ReportServiceInterface`) |
| `./reports/index.js` | Report query services (`listPosTransactions`, `getTrialBalance`, `getProfitLoss`, etc.) |

**Public Contracts:**
- Report classification taxonomy
- Report contracts and types
- Report service interfaces
- Report query services

**Module Stub:** None (optional)

---

### 2.7 `@jurnapod/notifications`

**Location:** `packages/notifications/src/index.ts`

**Purpose:** Email service, template engine, and SendGrid integration.

```typescript
export { EmailService, createEmailServiceFromEnv } from './email-service';
export { SendGridProvider } from './providers/sendgrid';
export { TemplateEngine } from './templates';
export * from './templates/email';
export { createEmailLinkBuilder, type EmailLinkBuilder } from './link-builder/email';
export * from './types';
```

**Public Subpath Exports (stable public contracts via barrel re-export):**

| Subpath | Exports |
|---------|---------|
| `./templates/email` | `EmailTemplateParams`, `BuiltEmail`, `buildPasswordResetEmail`, `buildUserInviteEmail`, `buildVerifyEmail` |
| `./types` | `EmailOptions`, `SendResult`, `EmailConfig`, `TemplateData`, `EmailTemplate`, `EmailProvider`, `NotificationService` |

**Public Named Exports:**
- `EmailService` class
- `createEmailServiceFromEnv()` factory
- `SendGridProvider`
- `TemplateEngine`
- `EmailLinkBuilder`

---

### 2.8 `@jurnapod/telemetry`

**Location:** `packages/telemetry/src/index.ts`

**Purpose:** SLO definitions, telemetry types, and correlation labels.

```typescript
export * from "./slo.js";
export * from "./metrics.js";
export * from "./correlation.js";
export * from "./labels.js";
```

**Public Subpath Exports (stable public contracts via barrel re-export):**

| Subpath | Key Exports |
|---------|-------------|
| `./slo.js` | `CRITICAL_FLOWS`, `SLOTargetSchema`, `SLO_CONFIG`, `BusinessHoursSchema`, `getSLOsForFlow()`, `validateSLOConfig()`, `isWithinBusinessHours()` |
| `./metrics.js` | `SAFE_METRIC_LABELS`, `FORBIDDEN_METRIC_LABELS`, `ERROR_CLASSES`, `LATENCY_BUCKETS`, `METRIC_PATTERNS`, `isLabelSafe()`, `validateNoPII()` |
| `./correlation.js` | `CORRELATION_ID_TYPES`, `CORRELATION_HEADERS`, `CorrelationContextSchema`, `CORRELATION_PROPAGATION_MATRIX`, `generateRequestId()`, `generateClientTxId()`, `getRequestCorrelationId()` |
| `./labels.js` | `TELEMETRY_LABELS`, `FORBIDDEN_LABELS`, `validateLabelName()`, `validateLabelValue()`, `validateLabelSet()` |

**Public Contracts:**
- SLO configuration types and functions
- Metrics utilities
- Correlation ID handling
- Label utilities

---

### 2.9 `@jurnapod/modules-inventory-costing`

**Location:** `packages/modules/inventory-costing/src/index.ts`

**Purpose:** Inventory costing engine supporting AVG, FIFO, and LIFO cost methods.

```typescript
// Public API functions
export function getCostingStrategy(method: CostingMethod): CostingStrategy;
export async function getCompanyCostingMethod(companyId: number, db: KyselySchema): Promise<CostingMethod>;
export async function calculateCost(input: CostCalculationInput, db: KyselySchema): Promise<CostCalculationResult>;
export async function createCostLayer(params: {...}, db: KyselySchema): Promise<CostLayer>;
export async function getItemCostLayers(companyId: number, itemId: number, db: KyselySchema): Promise<CostLayer[]>;
export async function getItemCostSummary(companyId: number, itemId: number, db: KyselySchema): Promise<ItemCostSummary | null>;
export async function getItemCostLayersWithConsumption(companyId: number, itemId: number, db: KyselySchema): Promise<CostLayerWithConsumption[]>;
export async function getItemCostSummaryExtended(companyId: number, itemId: number, db: KyselySchema): Promise<ItemCostSummaryExtended | null>;
export async function deductWithCost(companyId: number, items: Array<{...}>, db: KyselySchema): Promise<DeductionResult>;

// Error re-exports
export { CostTrackingError, InsufficientInventoryError, InvalidCostingMethodError, toMinorUnits, fromMinorUnits } from "./types/costing.js";

// Type re-exports
export type { CostingMethod, CostLayer, CostCalculationInput, CostCalculationResult, ConsumedLayer, ItemCostSummary, DeductionInput, DeductionResult, ItemCostResult, CostLayerWithConsumption, ItemCostSummaryExtended } from "./types/costing.js";
```

**Public Contracts:**
- Cost calculation functions: `getCostingStrategy`, `calculateCost`, `createCostLayer`
- Cost query functions: `getItemCostLayers`, `getItemCostSummary`, `getItemCostLayersWithConsumption`, `getItemCostSummaryExtended`
- Company configuration: `getCompanyCostingMethod`
- Stock deduction with cost: `deductWithCost`
- Error classes: `CostTrackingError`, `InsufficientInventoryError`, `InvalidCostingMethodError`
- Utility functions: `toMinorUnits`, `fromMinorUnits`

---

## 3. Versioning Policy

### 3.1 Semantic Versioning Scope

For package public APIs, we follow loose semantic versioning:

- **MAJOR** (breaking): Removing exports, changing function signatures, renaming types
- **MINOR** (additive): Adding new exports, adding optional parameters with defaults
- **PATCH** (bug fixes): Internal refactoring without API changes

### 3.2 Deprecation Cycle

When an export must be renamed or removed:

1. Mark as `@deprecated` in JSDoc with replacement guidance
2. Keep the old export for minimum **2 minor versions** (one sprint cycle)
3. Log deprecation warning at runtime if possible
4. Remove in next MAJOR version bump

Example:
```typescript
/**
 * @deprecated Use `createOrderServiceV2` instead. Will be removed in v2.0.
 */
export function createOrderService = createOrderServiceV2;
```

### 3.3 Internal Path Prohibition

External consumers MUST NOT import from internal paths:

```typescript
// ✅ Correct
import { createOrderService } from "@jurnapod/modules-sales";

// ❌ Forbidden - internal path
import { createOrderService } from "@jurnapod/modules-sales/src/services";
```

**Enforcement:** ESLint import boundary rules block these patterns.

---

## 4. API Adapter Import Rules

### 4.1 Correct Import Pattern

API adapters MUST import only from package public roots:

```typescript
// ✅ Correct - imports from public contract
import { type SalesDb, type SalesDbExecutor, type SalesInvoice } from "@jurnapod/modules-sales";
import { postSalesInvoice, type SalesInvoicePostingData } from "@jurnapod/modules-accounting";
```

### 4.2 Validation Command

To verify no internal imports exist:

```bash
# Check for cross-package internal imports
grep -r "from \"@jurnapod/modules-" apps/api/src --include="*.ts" | grep -v "index.ts"
```

If any results appear, those are violations requiring correction.

### 4.3 ESLint Import Boundary Enforcement

**Background:** Story-23.0.2 implemented ESLint boundary rules enforcing ADR-0014's package dependency policy. The rules are configured in each package's ESLint flat config file.

**Rule Name:** `no-restricted-imports` (error severity)

**Config Locations (one per package):**

| Package | Config File |
|---------|-------------|
| `@jurnapod/modules-accounting` | `packages/modules/accounting/eslint.config.mjs` |
| `@jurnapod/modules-platform` | `packages/modules/platform/eslint.config.mjs` |
| `@jurnapod/modules-sales` | `packages/modules/sales/eslint.config.mjs` |
| `@jurnapod/modules-inventory` | `packages/modules/inventory/eslint.config.mjs` |
| `@jurnapod/modules-reservations` | `packages/modules/reservations/eslint.config.mjs` |
| `@jurnapod/modules-reporting` | `packages/modules/reporting/eslint.config.mjs` |
| `@jurnapod/modules-inventory-costing` | `packages/modules/inventory-costing/eslint.config.mjs` |
| `@jurnapod/notifications` | `packages/notifications/eslint.config.mjs` |
| `@jurnapod/telemetry` | `packages/telemetry/eslint.config.mjs` |
| `@jurnapod/auth` | `packages/auth/eslint.config.mjs` |
| `@jurnapod/db` | `packages/db/eslint.config.mjs` |
| `@jurnapod/shared` | `packages/shared/eslint.config.mjs` |
| `@jurnapod/offline-db` | `packages/offline-db/eslint.config.mjs` |
| `@jurnapod/sync-core` | `packages/sync-core/eslint.config.mjs` |
| `@jurnapod/pos-sync` | `packages/pos-sync/eslint.config.mjs` |
| `@jurnapod/backoffice-sync` | `packages/backoffice-sync/eslint.config.mjs` |

**Enforced Boundaries (proposed in ADR-0014, implemented in story-23.0.2):**

1. **Pattern bans** (via `no-restricted-imports` `patterns`):
   - All `packages/**` → `apps/*` and `apps/**` (blocks HTTP transport layer dependencies)
   - All `packages/**` → `@/lib` and `@/lib/**` (blocks API alias paths)
   - All `packages/**` → `apps/api/src/lib/*`, `apps/api/src/routes/*`, `apps/api/src/middleware/*`, `apps/api/src/services/*`

2. **Path bans** (via `no-restricted-imports` `paths`):
   - `@jurnapod/modules-accounting` → `@jurnapod/modules-sales` (accounting must not depend on sales)
   - Domain packages → `@jurnapod/pos-sync`, `@jurnapod/backoffice-sync`, `@jurnapod/sync-core` (sync transport runtime isolation)

**Validation:**

```bash
# Run lint on any package workspace to verify boundary compliance
npm run lint -w @jurnapod/modules-accounting
npm run lint -w @jurnapod/notifications
npm run lint -w @jurnapod/telemetry
# ... etc for other packages
```

**Current severity status:**
- **12 packages** enforce `no-restricted-imports` at `error` severity (accounting, platform, notifications, telemetry, inventory-costing, auth, db, shared, offline-db, sync-core, pos-sync, backoffice-sync)
- **4 packages** currently enforce at `warn` severity (modules-sales, modules-inventory, modules-reservations, modules-reporting)

Any new boundary violation will cause CI to fail on the 12 error-severity packages, satisfying ADR-0014 §Enforcement Mechanism: *"Lint must fail on boundary violations."*

**Actionable follow-up:** Upgrade the remaining 4 warn-level package configs to `error` severity. Track as tech debt in sprint-status.yaml if not resolved in current sprint.

---

## 5. Export Audit Checklist (Template)

> **Note:** This checklist is a template for package authors to self-verify public contracts. Verification status is not currently tracked in this document.

For each package, verify:

- [ ] All public types are explicitly exported or via documented barrel re-exports from stable subpath modules
- [ ] `export *` is only used for intentional, documented public subpath contracts (not internal/unstable modules)
- [ ] Internal implementations are NOT exported
- [ ] Module stubs are exported for optional modules
- [ ] Error classes are exported for consumer use
- [ ] No cross-package imports from internal paths
- [ ] Subpath exports are documented in the Public Subpath Exports table in Section 2

---

## 6. Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-03 | 1.0 | Initial version with all Epic 23 packages documented |
| 2026-04-03 | 1.2 | Correct Section 4.3 ESLint severity (12 error / 4 warn); add Public Subpath Exports tables for sections 2.4 and 2.5; adjust ADR-0014 references to reflect Proposed status; mark Section 5 checklist as template |
