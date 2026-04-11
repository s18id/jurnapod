# ACL Reorganization Implementation Specification

**Document Version:** 1.0  
**Created:** 2026-04-11  
**Status:** Draft  

---

## Executive Summary

This document specifies a comprehensive reorganization of the Access Control List (ACL) module structure in the Jurnapod ERP codebase. The changes involve removing the standalone `reports` module, renaming the `REPORT` permission to `ANALYZE`, and consolidating the module structure to 7 canonical modules.

### Change Summary

| Change | Description | Risk Level |
|--------|-------------|------------|
| Remove `reports` module | Delete all references to `reports` module across codebase | Medium |
| Rename REPORT → ANALYZE | Rename permission bit 16 from REPORT to ANALYZE | High |
| Consolidate modules | Reduce to 7 canonical modules | Medium |
| Merge `inventory_costing` into `inventory` | Absorb inventory_costing into inventory module | Low |
| Reports access via ANALYZE | Reports access granted via ANALYZE permission on source modules | Low |

### Canonical Module List (Post-Change)

```
platform, pos, sales, inventory, accounting, treasury, reservations
```

---

## 1. Shared Package (`packages/shared/`)

### 1.1 `src/constants/rbac.ts`

**File Path:** `packages/shared/src/constants/rbac.ts`

#### Current State

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical permission bit definitions for RBAC.
 * ALL packages must use these constants — no local duplicates allowed.
 * 
 * Bit layout:
 * - 1  (0b00001): READ
 * - 2  (0b00010): CREATE
 * - 4  (0b00100): UPDATE
 * - 8  (0b01000): DELETE
 * - 16 (0b10000): REPORT
 */
export const PERMISSION_BITS = {
  READ:    1,    // 0b00001
  CREATE:  2,    // 0b00010
  UPDATE:  4,    // 0b00100
  DELETE:  8,   // 0b01000
  REPORT:  16,   // 0b10000
} as const;

export type PermissionBit = keyof typeof PERMISSION_BITS;

/**
 * Composite permission masks for common combinations.
 */
export const PERMISSION_MASK = {
  READ:    PERMISSION_BITS.READ,
  WRITE:   PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE,
  CRUD:    PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE,
  CRUDA:   PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE | PERMISSION_BITS.REPORT,
} as const;
```

#### New State

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical permission bit definitions for RBAC.
 * ALL packages must use these constants — no local duplicates allowed.
 * 
 * Bit layout:
 * - 1  (0b00001): READ
 * - 2  (0b00010): CREATE
 * - 4  (0b00100): UPDATE
 * - 8  (0b01000): DELETE
 * - 16 (0b10000): ANALYZE
 */
export const PERMISSION_BITS = {
  READ:    1,    // 0b00001
  CREATE:  2,    // 0b00010
  UPDATE:  4,    // 0b00100
  DELETE:  8,   // 0b01000
  ANALYZE: 16,   // 0b10000 — formerly REPORT
} as const;

export type PermissionBit = keyof typeof PERMISSION_BITS;

/**
 * Composite permission masks for common combinations.
 */
export const PERMISSION_MASK = {
  READ:    PERMISSION_BITS.READ,
  WRITE:   PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE,
  CRUD:    PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE,
  CRUDA:   PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE | PERMISSION_BITS.ANALYZE,
} as const;
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — renamed constant `REPORT` → `ANALYZE` |
| **Backward Compatibility** | None possible — this is a deliberate rename |
| **Consumers** | Must update imports from `PERMISSION_BITS.REPORT` to `PERMISSION_BITS.ANALYZE` |
| **Mask Impact** | `PERMISSION_MASK.CRUDA` updated to use `ANALYZE` instead of `REPORT` |

#### Test Considerations

- Unit test: Verify `PERMISSION_BITS.ANALYZE === 16` (value preserved)
- Unit test: Verify `PERMISSION_MASK.CRUDA` includes bit 16
- Integration: Verify permission checks work with ANALYZE bit

---

### 1.2 `src/constants/modules.ts`

**File Path:** `packages/shared/src/constants/modules.ts`

#### Current State

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Access modules — used in RBAC authorization checks.
 * These are the resources/domains that can have permissions assigned.
 */
export const ACCESS_MODULE_CODES = [
  "users", "roles", "companies", "outlets",
  "accounts", "journals", "cash_bank",
  "sales", "payments", "inventory", "purchasing",
  "reports", "settings", "pos",
] as const;

export type AccessModuleCode = typeof ACCESS_MODULE_CODES[number];

/**
 * Feature modules — used in company_modules enablement table.
 * These represent optional features that can be enabled/disabled per company.
 */
export const FEATURE_MODULE_CODES = [
  "platform", "pos", "sales", "inventory",
  "accounting", "treasury", "reporting",
] as const;

export type FeatureModuleCode = typeof FEATURE_MODULE_CODES[number];
```

#### New State

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical module codes for Jurnapod ERP.
 * These represent the 7 core modules that can have permissions assigned.
 * 
 * Replaces the previous split between ACCESS_MODULE_CODES and FEATURE_MODULE_CODES.
 */
export const MODULE_CODES = [
  "platform",
  "pos",
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "reservations",
] as const;

export type ModuleCode = typeof MODULE_CODES[number];

/**
 * @deprecated Use MODULE_CODES instead. Kept for backward compatibility during transition.
 */
export const ACCESS_MODULE_CODES = MODULE_CODES;
export type AccessModuleCode = ModuleCode;

/**
 * @deprecated Use MODULE_CODES instead. Kept for backward compatibility during transition.
 */
export const FEATURE_MODULE_CODES = MODULE_CODES;
export type FeatureModuleCode = ModuleCode;
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — consolidated two arrays into one |
| **Backward Compatibility** | Deprecated aliases provided for `ACCESS_MODULE_CODES` and `FEATURE_MODULE_CODES` |
| **Module Count** | Reduced from 14 access + 7 feature to 7 canonical modules |
| **Removed Modules** | `reports`, `purchasing`, `accounts`, `journals`, `cash_bank`, `users`, `roles`, `companies`, `outlets`, `settings`, `reporting` |

#### Test Considerations

- Unit test: Verify `MODULE_CODES.length === 7`
- Unit test: Verify all 7 canonical modules present: `platform`, `pos`, `sales`, `inventory`, `accounting`, `treasury`, `reservations`
- Unit test: Verify deprecated aliases equal `MODULE_CODES`

---

### 1.3 `src/schemas/modules.ts`

**File Path:** `packages/shared/src/schemas/modules.ts`

#### Current State

```typescript
export const MODULE_CODES = [
  "platform",
  "pos",
  "sales",
  "inventory",
  "purchasing",
  "reports",
  "settings",
  "accounts",
  "journals"
] as const;

export const ModuleCodeSchema = z.enum(MODULE_CODES);

export type ModuleCode = z.infer<typeof ModuleCodeSchema>;

// ... (ModuleConfigSchemaMap includes 'reports' and 'inventory_costing')
export const ModuleConfigSchemaMap = {
  platform: GenericModuleConfigSchema,
  pos: PosModuleConfigSchema,
  sales: GenericModuleConfigSchema,
  inventory: InventoryModuleConfigSchema,
  purchasing: GenericModuleConfigSchema,
  reports: GenericModuleConfigSchema,  // ← REMOVE
  settings: GenericModuleConfigSchema,
  accounts: GenericModuleConfigSchema,
  journals: GenericModuleConfigSchema
} as const satisfies Record<ModuleCode, z.ZodTypeAny>;
```

#### New State

```typescript
export const MODULE_CODES = [
  "platform",
  "pos",
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "reservations"
] as const;

export const ModuleCodeSchema = z.enum(MODULE_CODES);

export type ModuleCode = z.infer<typeof ModuleCodeSchema>;

// ... (ModuleConfigSchemaMap updated)
export const ModuleConfigSchemaMap = {
  platform: GenericModuleConfigSchema,
  pos: PosModuleConfigSchema,
  sales: GenericModuleConfigSchema,
  inventory: InventoryModuleConfigSchema,
  // inventory_costing merged into inventory — no separate entry
  accounting: GenericModuleConfigSchema,
  treasury: GenericModuleConfigSchema,
  reservations: GenericModuleConfigSchema
} as const satisfies Record<ModuleCode, z.ZodTypeAny>;
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — Zod enum values changed |
| **Backward Compatibility** | None — schema validation will reject old module codes |
| **Removed Values** | `purchasing`, `reports`, `settings`, `accounts`, `journals` |
| **Merged Values** | `inventory_costing` absorbed into `inventory` |

#### Test Considerations

- Unit test: Verify `ModuleCodeSchema.parse("platform")` succeeds
- Unit test: Verify `ModuleCodeSchema.parse("reports")` fails with ZodError
- Unit test: Verify `ModuleCodeSchema.parse("inventory_costing")` fails with ZodError
- Integration: Validate API responses with new module codes

---

### 1.4 `src/schemas/module-roles.ts`

**File Path:** `packages/shared/src/schemas/module-roles.ts`

#### Current State

```typescript
export const ModuleSchema = z.enum([
  "companies",
  "outlets",
  "users",
  "roles",
  "accounts",
  "journals",
  "cash_bank",
  "sales",
  "inventory",
  "purchasing",
  "reports",
  "settings"
]);

export type Module = z.infer<typeof ModuleSchema>;
```

#### New State

```typescript
export const ModuleSchema = z.enum([
  "platform",
  "pos",
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "reservations"
]);

export type Module = z.infer<typeof ModuleSchema>;
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — enum values replaced entirely |
| **Backward Compatibility** | None — schema validation will reject old module values |
| **Removed Values** | `companies`, `outlets`, `users`, `roles`, `accounts`, `journals`, `cash_bank`, `purchasing`, `reports`, `settings` |

#### Test Considerations

- Unit test: Verify `ModuleSchema.parse("inventory")` succeeds
- Unit test: Verify `ModuleSchema.parse("reports")` fails
- Unit test: Verify `ModuleSchema.parse("companies")` fails

---

## 2. Auth Package (`packages/auth/`)

### 2.1 `src/types.ts`

**File Path:** `packages/auth/src/types.ts`

#### Current State

```typescript
/** Module-level permissions (bitmask values) - lowercase keys for auth compatibility */
export type ModulePermission = "create" | "read" | "update" | "delete" | "report";

/**
 * Permission bit values matching @jurnapod/shared/PERMISSION_BITS.
 * Canonical layout: READ=1, CREATE=2, UPDATE=4, DELETE=8, REPORT=16
 */
export const MODULE_PERMISSION_BITS: Record<ModulePermission, number> = {
  read: 1,     // 0b00001 - READ permission
  create: 2,   // 0b00010 - CREATE permission
  update: 4,   // 0b00100 - UPDATE permission
  delete: 8,   // 0b01000 - DELETE permission
  report: 16   // 0b10000 - REPORT permission
};
```

#### New State

```typescript
/** Module-level permissions (bitmask values) - lowercase keys for auth compatibility */
export type ModulePermission = "create" | "read" | "update" | "delete" | "analyze";

/**
 * Permission bit values matching @jurnapod/shared/PERMISSION_BITS.
 * Canonical layout: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16
 */
export const MODULE_PERMISSION_BITS: Record<ModulePermission, number> = {
  read: 1,     // 0b00001 - READ permission
  create: 2,   // 0b00010 - CREATE permission
  update: 4,   // 0b00100 - UPDATE permission
  delete: 8,   // 0b01000 - DELETE permission
  analyze: 16   // 0b10000 - ANALYZE permission (formerly REPORT)
};
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — `report` permission renamed to `analyze` |
| **Backward Compatibility** | None — type change will break compile-time consumers |
| **Value Preserved** | Bit value 16 unchanged — only name changes |

#### Test Considerations

- Unit test: Verify `MODULE_PERMISSION_BITS.analyze === 16`
- Unit test: Verify `ModulePermission` type includes `"analyze"` not `"report"`

---

### 2.2 `src/rbac/permissions.ts`

**File Path:** `packages/auth/src/rbac/permissions.ts`

#### Current State

```typescript
/**
 * Build a permission mask from boolean flags.
 */
export function buildPermissionMask(params: {
  canCreate?: boolean;
  canRead?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canReport?: boolean;  // ← RENAME
}): number {
  let mask = 0;
  if (params.canCreate) mask |= MODULE_PERMISSION_BITS.create;
  if (params.canRead) mask |= MODULE_PERMISSION_BITS.read;
  if (params.canUpdate) mask |= MODULE_PERMISSION_BITS.update;
  if (params.canDelete) mask |= MODULE_PERMISSION_BITS.delete;
  if (params.canReport) mask |= MODULE_PERMISSION_BITS.report;  // ← UPDATE to .analyze
  return mask;
}
```

#### New State

```typescript
/**
 * Build a permission mask from boolean flags.
 */
export function buildPermissionMask(params: {
  canCreate?: boolean;
  canRead?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canAnalyze?: boolean;  // ← RENAMED from canReport
}): number {
  let mask = 0;
  if (params.canCreate) mask |= MODULE_PERMISSION_BITS.create;
  if (params.canRead) mask |= MODULE_PERMISSION_BITS.read;
  if (params.canUpdate) mask |= MODULE_PERMISSION_BITS.update;
  if (params.canDelete) mask |= MODULE_PERMISSION_BITS.delete;
  if (params.canAnalyze) mask |= MODULE_PERMISSION_BITS.analyze;  // ← UPDATED to .analyze
  return mask;
}
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — parameter `canReport` renamed to `canAnalyze` |
| **Backward Compatibility** | None — function signature changed |
| **Update Path** | Consumers must rename `canReport` to `canAnalyze` |

#### Test Considerations

- Unit test: Verify `buildPermissionMask({ canAnalyze: true })` returns 16
- Unit test: Verify `buildPermissionMask({ canReport: true })` would fail type check

---

## 3. Platform Module (`packages/modules/platform/`)

### 3.1 `src/companies/constants/permission-matrix.ts`

**File Path:** `packages/modules/platform/src/companies/constants/permission-matrix.ts`

#### Current State

```typescript
export const MODULE_ROLE_DEFAULTS = [
  // SUPER_ADMIN has full access to everything
  { roleCode: "SUPER_ADMIN", module: "companies", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "users", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "roles", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "outlets", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "accounts", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "journals", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "cash_bank", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "sales", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "payments", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "purchasing", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "reports", permissionMask: PERMISSION_MASK.CRUDA },  // ← REMOVE
  { roleCode: "SUPER_ADMIN", module: "settings", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },
  // ... similar patterns for OWNER, COMPANY_ADMIN, ADMIN, CASHIER, ACCOUNTANT
  // All have reports module entries like:
  { roleCode: "OWNER", module: "reports", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "reports", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ADMIN", module: "reports", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "CASHIER", module: "reports", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "reports", permissionMask: PERMISSION_MASK.READ },
] as const;
```

#### New State

```typescript
export const MODULE_ROLE_DEFAULTS = [
  // SUPER_ADMIN has full access to everything
  { roleCode: "SUPER_ADMIN", module: "platform", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "sales", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "accounting", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "treasury", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "reservations", permissionMask: PERMISSION_MASK.CRUDA },

  // OWNER has CRUDA on all modules
  { roleCode: "OWNER", module: "platform", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "sales", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "accounting", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "treasury", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "reservations", permissionMask: PERMISSION_MASK.CRUDA },

  // COMPANY_ADMIN has ANALYZE (16) on modules where they need reporting
  { roleCode: "COMPANY_ADMIN", module: "platform", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "sales", permissionMask: PERMISSION_MASK.CRUDA | PERMISSION_BITS.ANALYZE },
  { roleCode: "COMPANY_ADMIN", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA | PERMISSION_BITS.ANALYZE },
  { roleCode: "COMPANY_ADMIN", module: "accounting", permissionMask: PERMISSION_MASK.CRUDA | PERMISSION_BITS.ANALYZE },
  { roleCode: "COMPANY_ADMIN", module: "treasury", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.ANALYZE },
  { roleCode: "COMPANY_ADMIN", module: "reservations", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.ANALYZE },

  // ADMIN has ANALYZE on source modules
  { roleCode: "ADMIN", module: "platform", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "sales", permissionMask: PERMISSION_MASK.CRUDA | PERMISSION_BITS.ANALYZE },
  { roleCode: "ADMIN", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA | PERMISSION_BITS.ANALYZE },
  { roleCode: "ADMIN", module: "accounting", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.ANALYZE },
  { roleCode: "ADMIN", module: "treasury", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ADMIN", module: "reservations", permissionMask: PERMISSION_MASK.READ },

  // CASHIER has limited access (no ANALYZE by default)
  { roleCode: "CASHIER", module: "platform", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "CASHIER", module: "pos", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "CASHIER", module: "sales", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "CASHIER", module: "inventory", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "CASHIER", module: "accounting", permissionMask: 0 },
  { roleCode: "CASHIER", module: "treasury", permissionMask: 0 },
  { roleCode: "CASHIER", module: "reservations", permissionMask: 0 },

  // ACCOUNTANT has ANALYZE on accounting module
  { roleCode: "ACCOUNTANT", module: "platform", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "pos", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "sales", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "inventory", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "accounting", permissionMask: PERMISSION_MASK.CRUDA | PERMISSION_BITS.ANALYZE },
  { roleCode: "ACCOUNTANT", module: "treasury", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "ACCOUNTANT", module: "reservations", permissionMask: 0 },
] as const;
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — module list completely restructured |
| **Backward Compatibility** | None — old module codes removed |
| **Reports Access** | Now granted via ANALYZE permission on source modules (sales, inventory, accounting, treasury) |
| **New Modules** | `accounting`, `treasury`, `reservations` added |
| **Removed Modules** | `companies`, `users`, `roles`, `outlets`, `accounts`, `journals`, `cash_bank`, `purchasing`, `reports`, `settings`, `payments` |

#### Test Considerations

- Unit test: Verify `MODULE_ROLE_DEFAULTS` has no entries with `module: "reports"`
- Unit test: Verify all 7 canonical modules present in defaults
- Unit test: Verify COMPANY_ADMIN, ADMIN, ACCOUNTANT have ANALYZE on appropriate modules

---

## 4. API App (`apps/api/`)

### 4.1 `src/lib/companies.ts`

**File Path:** `apps/api/src/lib/companies.ts`

#### Current State

```typescript
const MODULE_DEFINITIONS = [
  { code: "platform", name: "Platform", description: "Core platform services" },
  { code: "pos", name: "POS", description: "Point of sale" },
  { code: "sales", name: "Sales", description: "Sales invoices" },
  { code: "payments", name: "Payments", description: "Payment processing and management" },
  { code: "inventory", name: "Inventory", description: "Stock movements and recipes" },
  { code: "purchasing", name: "Purchasing", description: "Purchasing and payables" },
  { code: "reports", name: "Reports", description: "Reporting and analytics" },  // ← REMOVE
  { code: "settings", name: "Settings", description: "Settings and configuration" },  // ← REMOVE
  { code: "accounts", name: "Accounts", description: "Chart of accounts" },  // ← REMOVE
  { code: "journals", name: "Journals", description: "Journal entries and posting" }  // ← REMOVE
] as const;

const COMPANY_MODULE_DEFAULTS = [
  { code: "platform", enabled: true, config: {} },
  { code: "pos", enabled: true, config: { payment_methods: ["CASH"] } },
  { code: "sales", enabled: true, config: {} },
  { code: "inventory", enabled: true, config: { level: 0 } },
  { code: "purchasing", enabled: false, config: {} },
  { code: "reports", enabled: true, config: {} },  // ← REMOVE
  { code: "settings", enabled: true, config: {} },  // ← REMOVE
  { code: "accounts", enabled: true, config: {} },  // ← REMOVE
  { code: "journals", enabled: true, config: {} }  // ← REMOVE
] as const;

const MODULE_ROLE_DEFAULTS = [
  // All entries with module: "reports" must be removed
  // e.g., { roleCode: "SUPER_ADMIN", module: "reports", permissionMask: 15 },
  // e.g., { roleCode: "OWNER", module: "reports", permissionMask: 15 },
  // e.g., { roleCode: "COMPANY_ADMIN", module: "reports", permissionMask: 2 },
  // e.g., { roleCode: "ADMIN", module: "reports", permissionMask: 2 },
  // e.g., { roleCode: "CASHIER", module: "reports", permissionMask: 2 },
  // e.g., { roleCode: "ACCOUNTANT", module: "reports", permissionMask: 2 },
  // ... plus entries for other removed modules
] as const;
```

#### New State

```typescript
const MODULE_DEFINITIONS = [
  { code: "platform", name: "Platform", description: "Core platform services" },
  { code: "pos", name: "POS", description: "Point of sale" },
  { code: "sales", name: "Sales", description: "Sales invoices" },
  { code: "inventory", name: "Inventory", description: "Stock movements and recipes" },
  { code: "accounting", name: "Accounting", description: "General ledger and posting" },
  { code: "treasury", name: "Treasury", description: "Cash and bank management" },
  { code: "reservations", name: "Reservations", description: "Table and booking reservations" }
] as const;

const COMPANY_MODULE_DEFAULTS = [
  { code: "platform", enabled: true, config: {} },
  { code: "pos", enabled: true, config: { payment_methods: ["CASH"] } },
  { code: "sales", enabled: true, config: {} },
  { code: "inventory", enabled: true, config: { level: 0 } },
  { code: "accounting", enabled: true, config: {} },
  { code: "treasury", enabled: false, config: {} },
  { code: "reservations", enabled: false, config: {} }
] as const;

const MODULE_ROLE_DEFAULTS = [
  // SUPER_ADMIN
  { roleCode: "SUPER_ADMIN", module: "platform", permissionMask: 31 },
  { roleCode: "SUPER_ADMIN", module: "pos", permissionMask: 31 },
  { roleCode: "SUPER_ADMIN", module: "sales", permissionMask: 31 },
  { roleCode: "SUPER_ADMIN", module: "inventory", permissionMask: 31 },
  { roleCode: "SUPER_ADMIN", module: "accounting", permissionMask: 31 },
  { roleCode: "SUPER_ADMIN", module: "treasury", permissionMask: 31 },
  { roleCode: "SUPER_ADMIN", module: "reservations", permissionMask: 31 },

  // OWNER — CRUDA on all
  { roleCode: "OWNER", module: "platform", permissionMask: 31 },
  { roleCode: "OWNER", module: "pos", permissionMask: 31 },
  { roleCode: "OWNER", module: "sales", permissionMask: 31 },
  { roleCode: "OWNER", module: "inventory", permissionMask: 31 },
  { roleCode: "OWNER", module: "accounting", permissionMask: 31 },
  { roleCode: "OWNER", module: "treasury", permissionMask: 31 },
  { roleCode: "OWNER", module: "reservations", permissionMask: 31 },

  // COMPANY_ADMIN — ANALYZE on sales, inventory, accounting, treasury
  { roleCode: "COMPANY_ADMIN", module: "platform", permissionMask: 31 },
  { roleCode: "COMPANY_ADMIN", module: "pos", permissionMask: 31 },
  { roleCode: "COMPANY_ADMIN", module: "sales", permissionMask: 31 },  // includes ANALYZE
  { roleCode: "COMPANY_ADMIN", module: "inventory", permissionMask: 31 },  // includes ANALYZE
  { roleCode: "COMPANY_ADMIN", module: "accounting", permissionMask: 31 },  // includes ANALYZE
  { roleCode: "COMPANY_ADMIN", module: "treasury", permissionMask: 17 },  // READ + ANALYZE
  { roleCode: "COMPANY_ADMIN", module: "reservations", permissionMask: 17 },  // READ + ANALYZE

  // ADMIN
  { roleCode: "ADMIN", module: "platform", permissionMask: 31 },
  { roleCode: "ADMIN", module: "pos", permissionMask: 31 },
  { roleCode: "ADMIN", module: "sales", permissionMask: 31 },  // includes ANALYZE
  { roleCode: "ADMIN", module: "inventory", permissionMask: 31 },  // includes ANALYZE
  { roleCode: "ADMIN", module: "accounting", permissionMask: 17 },  // READ + ANALYZE
  { roleCode: "ADMIN", module: "treasury", permissionMask: 1 },  // READ only
  { roleCode: "ADMIN", module: "reservations", permissionMask: 1 },  // READ only

  // CASHIER
  { roleCode: "CASHIER", module: "platform", permissionMask: 1 },
  { roleCode: "CASHIER", module: "pos", permissionMask: 3 },  // READ + CREATE
  { roleCode: "CASHIER", module: "sales", permissionMask: 3 },  // READ + CREATE
  { roleCode: "CASHIER", module: "inventory", permissionMask: 1 },
  { roleCode: "CASHIER", module: "accounting", permissionMask: 0 },
  { roleCode: "CASHIER", module: "treasury", permissionMask: 0 },
  { roleCode: "CASHIER", module: "reservations", permissionMask: 0 },

  // ACCOUNTANT
  { roleCode: "ACCOUNTANT", module: "platform", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "pos", permissionMask: 1 },
  { roleCode: "ACCOUNTANT", module: "sales", permissionMask: 1 },
  { roleCode: "ACCOUNTANT", module: "inventory", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "accounting", permissionMask: 31 },  // includes ANALYZE
  { roleCode: "ACCOUNTANT", module: "treasury", permissionMask: 3 },  // READ + CREATE
  { roleCode: "ACCOUNTANT", module: "reservations", permissionMask: 0 }
] as const;
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — module definitions and role defaults completely changed |
| **Backward Compatibility** | None — old module codes removed |
| **Permission Masks** | Updated to use 7-bit CRUDA format (31 = CRUD + ANALYZE) |
| **ANALYZE Grants** | Added to COMPANY_ADMIN, ADMIN, ACCOUNTANT on relevant modules |

#### Test Considerations

- Integration: Create company and verify only 7 modules exist
- Integration: Verify role permissions match expected masks
- Integration: Verify reports access works via ANALYZE permission

---

### 4.2 `src/lib/auth/permissions.ts`

**File Path:** `apps/api/src/lib/auth/permissions.ts`

#### Current State

```typescript
import { MODULE_PERMISSION_BITS, type ModulePermission } from "../auth.js";
```

#### New State

```typescript
// No changes required — imports from @jurnapod/auth which will be updated
// MODULE_PERMISSION_BITS will now have analyze instead of report
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | None — this file only re-exports types |
| **Backward Compatibility** | Automatic — consumer of updated @jurnapod/auth |

#### Test Considerations

- No direct changes — tested via integration tests for permission checks

---

## 5. Database Migration (`packages/db/migrations/`)

### New Migration File: `0147_acl_reorganization.sql`

**File Path:** `packages/db/migrations/0147_acl_reorganization.sql`

```sql
-- Migration: 0147_acl_reorganization.sql
-- Description: ACL reorganization — remove reports module, add ANALYZE permission
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

-- ==============================================================================
-- Step 1: Remove 'reports' module from modules table
-- ==============================================================================

DELETE FROM modules WHERE code = 'reports';

-- ==============================================================================
-- Step 2: Remove all module_roles entries where module='reports'
-- ==============================================================================

DELETE FROM module_roles WHERE module = 'reports';

-- ==============================================================================
-- Step 3: Remove 'reports' from company_modules
-- ==============================================================================

DELETE FROM company_modules WHERE module_id IN (
  SELECT id FROM modules WHERE code = 'reports'
);

-- Clean up orphaned module_id references (in case FK not enforced)
DELETE FROM company_modules WHERE module_id NOT IN (
  SELECT id FROM modules
);

-- ==============================================================================
-- Step 4: Update ANALYZE permission (bit 16) for roles that had reports access
-- Add ANALYZE to COMPANY_ADMIN on sales, inventory, accounting modules
-- ==============================================================================

-- First, ensure ANALYZE bit is added to existing sales module entries for COMPANY_ADMIN
UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16  -- Add ANALYZE bit
WHERE mr.module = 'sales'
  AND r.code = 'COMPANY_ADMIN'
  AND (mr.permission_mask & 16) = 0;  -- Only if ANALYZE not already set

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16
WHERE mr.module = 'inventory'
  AND r.code = 'COMPANY_ADMIN'
  AND (mr.permission_mask & 16) = 0;

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16
WHERE mr.module = 'accounting'
  AND r.code = 'COMPANY_ADMIN'
  AND (mr.permission_mask & 16) = 0;

-- ==============================================================================
-- Step 5: Update ANALYZE for ADMIN role
-- ==============================================================================

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16
WHERE mr.module = 'sales'
  AND r.code = 'ADMIN'
  AND (mr.permission_mask & 16) = 0;

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16
WHERE mr.module = 'inventory'
  AND r.code = 'ADMIN'
  AND (mr.permission_mask & 16) = 0;

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16
WHERE mr.module = 'accounting'
  AND r.code = 'ADMIN'
  AND (mr.permission_mask & 16) = 0;

-- ==============================================================================
-- Step 6: Update ANALYZE for ACCOUNTANT role on accounting module
-- ==============================================================================

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16
WHERE mr.module = 'accounting'
  AND r.code = 'ACCOUNTANT'
  AND (mr.permission_mask & 16) = 0;

-- ==============================================================================
-- Step 7: Insert new canonical modules if they don't exist
-- ==============================================================================

INSERT INTO modules (code, name, description) VALUES
  ('platform', 'Platform', 'Core platform services')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO modules (code, name, description) VALUES
  ('accounting', 'Accounting', 'General ledger and posting')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO modules (code, name, description) VALUES
  ('treasury', 'Treasury', 'Cash and bank management')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO modules (code, name, description) VALUES
  ('reservations', 'Reservations', 'Table and booking reservations')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- ==============================================================================
-- Step 8: Enable new modules for all existing companies
-- ==============================================================================

INSERT INTO company_modules (company_id, module_id, enabled, config_json, created_by_user_id)
SELECT c.id, m.id, 0, '{}', NULL
FROM companies c
CROSS JOIN modules m
WHERE m.code IN ('platform', 'accounting', 'treasury', 'reservations')
  AND NOT EXISTS (
    SELECT 1 FROM company_modules cm
    WHERE cm.company_id = c.id AND cm.module_id = m.id
  );

-- ==============================================================================
-- Step 9: Grant default permissions for new modules
-- SUPER_ADMIN and OWNER get CRUDA (31 = 15 | 16)
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, m.code, c.id, 31  -- CRUDA
FROM companies c
CROSS JOIN roles r
CROSS JOIN modules m
WHERE r.code IN ('SUPER_ADMIN', 'OWNER')
  AND m.code IN ('platform', 'accounting', 'treasury', 'reservations')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.role_id = r.id AND mr.module = m.code AND mr.company_id = c.id
  );

-- ==============================================================================
-- Step 10: Grant COMPANY_ADMIN permissions for new modules
-- platform, pos, sales, inventory = CRUDA (31)
-- treasury, reservations = READ + ANALYZE (17)
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, m.code, c.id, 
  CASE m.code
    WHEN 'platform' THEN 31
    WHEN 'accounting' THEN 31
    WHEN 'treasury' THEN 17
    WHEN 'reservations' THEN 17
  END
FROM companies c
CROSS JOIN roles r
CROSS JOIN modules m
WHERE r.code = 'COMPANY_ADMIN'
  AND m.code IN ('platform', 'accounting', 'treasury', 'reservations')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.role_id = r.id AND mr.module = m.code AND mr.company_id = c.id
  );

-- ==============================================================================
-- Step 11: Grant ADMIN permissions for new modules
-- platform = CRUDA (31)
-- sales, inventory = CRUDA (31)
-- accounting = READ + ANALYZE (17)
-- treasury, reservations = READ (1)
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, m.code, c.id,
  CASE m.code
    WHEN 'platform' THEN 31
    WHEN 'accounting' THEN 17
    WHEN 'treasury' THEN 1
    WHEN 'reservations' THEN 1
  END
FROM companies c
CROSS JOIN roles r
CROSS JOIN modules m
WHERE r.code = 'ADMIN'
  AND m.code IN ('platform', 'accounting', 'treasury', 'reservations')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.role_id = r.id AND mr.module = m.code AND mr.company_id = c.id
  );

-- ==============================================================================
-- Step 12: Grant ACCOUNTANT permissions for new modules
-- accounting = CRUDA (31)
-- treasury = READ + CREATE (3)
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, m.code, c.id,
  CASE m.code
    WHEN 'accounting' THEN 31
    WHEN 'treasury' THEN 3
  END
FROM companies c
CROSS JOIN roles r
CROSS JOIN modules m
WHERE r.code = 'ACCOUNTANT'
  AND m.code IN ('accounting', 'treasury')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.role_id = r.id AND mr.module = m.code AND mr.company_id = c.id
  );

-- ==============================================================================
-- Step 13: Grant CASHIER permissions for new modules (READ only for platform)
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, m.code, c.id, 1  -- READ only
FROM companies c
CROSS JOIN roles r
CROSS JOIN modules m
WHERE r.code = 'CASHIER'
  AND m.code = 'platform'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.role_id = r.id AND mr.module = m.code AND mr.company_id = c.id
  );

-- ==============================================================================
-- Step 14: Clean up orphaned module_roles entries (modules that no longer exist)
-- ==============================================================================

DELETE FROM module_roles 
WHERE module IN (
  SELECT code FROM (
    SELECT module as code FROM module_roles
    MINUS
    SELECT code FROM modules
  ) AS orphaned
);

-- ==============================================================================
-- Step 15: Verify migration ( informational — does not affect migration)
-- ==============================================================================

-- SELECT 'Modules count' as check_name, COUNT(*) as value FROM modules;
-- SELECT 'Module_roles count' as check_name, COUNT(*) as value FROM module_roles WHERE module = 'reports';
-- Expected: 0 rows for reports entries after Step 2
```

#### Migration Approach

| Aspect | Strategy |
|--------|----------|
| **Breaking Change** | Yes — data deletion |
| **Idempotent** | Yes — uses DELETE and INSERT IGNORE patterns |
| **Order of Operations** | 1) Remove reports data, 2) Add ANALYZE to existing roles, 3) Add new modules, 4) Grant new permissions |
| **Rollback** | See Rollback Plan section |

#### Test Considerations

- Integration: Run migration on test database
- Integration: Verify no `module = 'reports'` entries remain in `module_roles`
- Integration: Verify ANALYZE bit (16) is set for appropriate roles
- Integration: Verify new modules exist and have default role assignments

---

## 6. Rollback Plan

### Rollback Strategy

**IMPORTANT:** This migration involves data deletion which is not directly reversible. The rollback plan assumes a Point-in-Time Recovery (PITR) from database backups or a pre-migration snapshot.

### Rollback Steps

1. **Stop all application traffic** to prevent new writes during rollback

2. **Restore from PITR backup** taken before migration:
   ```bash
   mysql -h <host> -u <user> -p <database> < backup_before_migration.sql
   ```

3. **Alternative: Manual rollback via compensating SQL:**
   
   If PITR is not available, the following compensating actions may restore most data:

   ```sql
   -- Restore reports module
   INSERT INTO modules (code, name, description) 
   VALUES ('reports', 'Reports', 'Reporting and analytics')
   ON DUPLICATE KEY UPDATE name = VALUES(name);

   -- Restore module_roles entries (requires pre-migration backup of module_roles table)
   -- INSERT INTO module_roles (role_id, module, company_id, permission_mask)
   -- SELECT * FROM module_roles_backup WHERE module = 'reports';
   ```

4. **Verify rollback:**
   ```sql
   -- Should return 1 row
   SELECT COUNT(*) FROM modules WHERE code = 'reports';
   
   -- Should return pre-migration count
   SELECT COUNT(*) FROM module_roles WHERE module = 'reports';
   ```

5. **Redeploy application** with pre-migration code

### Rollback Decision Matrix

| Condition | Action |
|-----------|--------|
| Migration fails mid-way | All changes are idempotent — rerun migration after fixing issues |
| Migration succeeds but tests fail | Rollback via PITR and fix code before re-migration |
| Production issue discovered post-migration | P0 incident — immediate PITR rollback |
| Consumer code not updated | Deploy pre-migration app code until consumers are updated |

---

## 7. Testing Strategy

### 7.1 Unit Tests

#### `@jurnapod/shared` Package

| Test | File | Description |
|------|------|-------------|
| `PERMISSION_BITS.ANALYZE === 16` | `constants/rbac.test.ts` | Verify bit value unchanged |
| `PERMISSION_MASK.CRUDA` includes bit 16 | `constants/rbac.test.ts` | Verify mask correctness |
| `MODULE_CODES.length === 7` | `constants/modules.test.ts` | Verify consolidation |
| All 7 canonical modules present | `constants/modules.test.ts` | Verify exact module list |
| `ModuleCodeSchema.parse("inventory")` succeeds | `schemas/modules.test.ts` | Valid module accepted |
| `ModuleCodeSchema.parse("reports")` fails | `schemas/modules.test.ts` | Removed module rejected |
| `ModuleSchema.parse("reports")` fails | `schemas/module-roles.test.ts` | Removed module rejected |

#### `@jurnapod/auth` Package

| Test | File | Description |
|------|------|-------------|
| `MODULE_PERMISSION_BITS.analyze === 16` | `rbac/permissions.test.ts` | Verify renamed constant |
| `ModulePermission` type includes `"analyze"` | `rbac/permissions.test.ts` | Type verification |
| `buildPermissionMask({ canAnalyze: true }) === 16` | `rbac/permissions.test.ts` | Function with new param |

#### `@jurnapod/modules/platform` Package

| Test | File | Description |
|------|------|-------------|
| No `"reports"` entries in `MODULE_ROLE_DEFAULTS` | `companies/constants/permission-matrix.test.ts` | Verify removal |
| All 7 canonical modules present | `companies/constants/permission-matrix.test.ts` | Verify new modules |
| COMPANY_ADMIN has ANALYZE on accounting | `companies/constants/permission-matrix.test.ts` | Verify permission grants |

### 7.2 Integration Tests

#### `@jurnapod/api` Package

| Test | File | Description |
|------|------|-------------|
| Create company → only 7 modules created | `companies.test.ts` | Module count verification |
| Create company → correct default role permissions | `companies.test.ts` | Permission mask verification |
| Permission check with ANALYZE bit succeeds | `permissions.test.ts` | ANALYZE permission works |

### 7.3 End-to-End Tests

| Test | Description |
|------|-------------|
| Super Admin can access all 7 modules | Full CRUD on each module |
| COMPANY_ADMIN can view reports via ANALYZE | Reports endpoint accessible |
| CASHIER cannot access accounting ANALYZE | Permission boundary enforced |
| Reports access removed from standalone reports module | Module gone, access via ANALYZE |

---

## 8. Risk Assessment

### 8.1 High-Risk Items

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Permission bit rename breaks existing sessions | High | Medium | Version gate — new code with migration must be deployed atomically |
| Reports access lost during transition | High | Low | Pre-migration: ensure ANALYZE grants cover all existing reports access |
| ModuleRoles table has stale entries | Medium | Medium | Step 14 cleanup handles orphaned entries |

### 8.2 Medium-Risk Items

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Consumers not updated before migration | Medium | Medium | Feature flag to delay migration until all consumers updated |
| Database migration not idempotent | Medium | Low | Migration designed with idempotent DELETE/INSERT patterns |
| Schema validation rejects existing data | Medium | Low | Pre-migration data audit before running migration |

### 8.3 Low-Risk Items

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| TypeScript types not aligned | Low | Low | Single repo — types updated in same PR |
| Documentation not updated | Low | Medium | This document and inline comments updated |

### 8.4 Risk Matrix

```
Impact
  High   | [Permission rename]     | [Reports access lost] | [Stale entries]
  Medium |                        | [Consumers not ready] | [Schema validation]
  Low    | [Type alignment]       | [Docs not updated]    |
         +--------------------------------------------------+
                    Likelihood: Low          Medium         High
```

---

## 9. Implementation Order

The following order MUST be followed to ensure consistency:

### Phase 1: Code Changes (No Database Impact)

1. **`packages/shared/src/constants/rbac.ts`** — Rename REPORT → ANALYZE
2. **`packages/shared/src/constants/modules.ts`** — Consolidate to MODULE_CODES
3. **`packages/shared/src/schemas/modules.ts`** — Update MODULE_CODES array, remove 'reports'
4. **`packages/shared/src/schemas/module-roles.ts`** — Update ModuleSchema
5. **`packages/auth/src/types.ts`** — Change 'report' to 'analyze'
6. **`packages/auth/src/rbac/permissions.ts`** — Change canReport to canAnalyze
7. **`packages/modules/platform/src/companies/constants/permission-matrix.ts`** — Update all entries
8. **`apps/api/src/lib/companies.ts`** — Update MODULE_DEFINITIONS, COMPANY_MODULE_DEFAULTS, MODULE_ROLE_DEFAULTS

### Phase 2: Database Migration

9. **Create `packages/db/migrations/0147_acl_reorganization.sql`** — Execute migration

### Phase 3: Verification

10. Run all unit tests: `npm run test -w @jurnapod/shared -w @jurnapod/auth -w @jurnapod/modules/platform -w @jurnapod/api`
11. Run integration tests: `npm run test:integration -w @jurnapod/api`
12. Verify database state: `npm run db:smoke -w @jurnapod/db`

---

## 10. File Change Summary

| # | File | Change Type | Lines Changed (Est.) |
|---|------|-------------|---------------------|
| 1 | `packages/shared/src/constants/rbac.ts` | Rename | ~5 |
| 2 | `packages/shared/src/constants/modules.ts` | Rewrite | ~26 |
| 3 | `packages/shared/src/schemas/modules.ts` | Modify | ~15 |
| 4 | `packages/shared/src/schemas/module-roles.ts` | Modify | ~12 |
| 5 | `packages/auth/src/types.ts` | Modify | ~2 |
| 6 | `packages/auth/src/rbac/permissions.ts` | Modify | ~2 |
| 7 | `packages/modules/platform/src/companies/constants/permission-matrix.ts` | Rewrite | ~123 |
| 8 | `apps/api/src/lib/companies.ts` | Rewrite | ~90 |
| 9 | `apps/api/src/lib/auth/permissions.ts` | None | 0 |
| 10 | `packages/db/migrations/0147_acl_reorganization.sql` | Create | ~200 |

---

## 11. Appendix: Permission Mask Reference

### Before (with REPORT)

```
Bit 4 (16): REPORT
Mask 15 (0b01111): CRUD — Read + Create + Update + Delete
Mask 31 (0b11111): CRUDA — CRUD + Report
```

### After (with ANALYZE)

```
Bit 4 (16): ANALYZE
Mask 15 (0b01111): CRUD — Read + Create + Update + Delete
Mask 31 (0b11111): CRUDA — CRUD + Analyze
```

### Common Masks Used

| Mask | Binary | Permissions |
|------|--------|-------------|
| 0 | 0b00000 | None |
| 1 | 0b00001 | READ |
| 2 | 0b00010 | CREATE |
| 3 | 0b00011 | READ + CREATE |
| 7 | 0b00111 | READ + CREATE + UPDATE |
| 15 | 0b01111 | CRUD |
| 17 | 0b10001 | READ + ANALYZE |
| 31 | 0b11111 | CRUDA |
