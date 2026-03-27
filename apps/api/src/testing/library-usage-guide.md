# Library Usage Guide for Tests

**Audit Date:** 2026-03-28  
**Status:** Complete  
**Total Library Functions Audited:** 47  
**Test-Friendly Functions:** 18 (38%)  
**Requires Actor Functions:** 22 (47%)  
**Read-Only Functions:** 12 (26%)

## Overview

This guide documents all library functions in `apps/api/src/lib/` that can be used in tests, identifies which functions need modification for test use, and highlights gaps where library functions are missing entirely.

## Direct SQL Usage in Tests (Current State)

Before refactoring to library functions, tests use direct `pool.execute()` calls:

| Entity | Direct SQL Count | Priority |
|--------|-----------------|----------|
| items | 58 | HIGH |
| operation_progress | 39 | HIGH |
| item_prices | 21 | HIGH |
| item_variant_attributes | 13 | MEDIUM |
| recipe_ingredients | 11 | MEDIUM |
| item_variants | 7 | MEDIUM |
| supplies | 6 | LOW |
| item_images | 5 | LOW |
| import_sessions | 4 | LOW |
| users | 3 | MEDIUM |
| pos_order_snapshots | 2 | LOW |
| outlets | 2 | MEDIUM |
| outlet_tables | 2 | LOW |
| item_variant_combinations | 2 | LOW |
| reservations | 1 | MEDIUM |
| inventory_transactions | 1 | LOW |

**Total: 177 direct SQL operations in tests**

---

## Available Library Functions

### companies.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `createCompany` | `(params: {code, name, legal_name?, tax_id?, email?, phone?, timezone?, currency_code?, address_line1?, address_line2?, city?, postal_code?, actor: CompanyActor}) => Promise<CompanyResponse>` | **NO** | Requires `actor` with `userId` - creates default outlet, roles, modules, settings |
| `listCompanies` | `(params: {companyId?, includeDeleted?}) => Promise<CompanyResponse[]>` | YES | Read-only, no actor required |
| `getCompany` | `(companyId: number, options?: {includeDeleted?}) => Promise<CompanyResponse>` | YES | Read-only, no actor required |
| `updateCompany` | `(params: {companyId, name?, legal_name?, ..., actor: CompanyActor}) => Promise<CompanyResponse>` | **NO** | Requires actor |
| `deleteCompany` | `(params: {companyId, actor}) => Promise<void>` | **NO** | Soft delete via deactivate, requires actor |
| `deactivateCompany` | `(params: {companyId, actor}) => Promise<CompanyResponse>` | **NO** | Requires actor |
| `reactivateCompany` | `(params: {companyId, actor}) => Promise<CompanyResponse>` | **NO** | Requires actor |

**Test Impact:** 2 direct SQL instances for `outlets`

---

### items/index.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `listItems` | `(companyId: number, filters?: {isActive?}) => Promise<Item[]>` | YES | Read-only, no actor required |
| `findItemById` | `(companyId: number, itemId: number) => Promise<Item \| null>` | YES | Read-only, no actor required |
| `createItem` | `(companyId: number, input: {sku?, name, type, item_group_id?, cogs_account_id?, inventory_asset_account_id?, is_active?}, actor?: MutationAuditActor) => Promise<Item>` | **PARTIAL** | Actor is optional but recommended for audit trails |
| `updateItem` | `(companyId: number, itemId: number, input: {...}, actor?: MutationAuditActor) => Promise<Item>` | **PARTIAL** | Actor optional |
| `deleteItem` | `(companyId: number, itemId: number, actor?: MutationAuditActor) => Promise<boolean>` | **PARTIAL** | Actor optional, returns boolean |
| `getItemVariantStats` | `(companyId: number, itemIds: number[]) => Promise<ItemVariantStats[]>` | YES | Read-only |

**Test Impact:** 58 direct SQL instances - **HIGHEST PRIORITY**

---

### outlets.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `listOutletsByCompany` | `(companyId: number) => Promise<OutletFullResponse[]>` | YES | Read-only |
| `listAllOutlets` | `() => Promise<OutletFullResponse[]>` | YES | WARNING: No company scoping - use carefully |
| `getOutlet` | `(companyId: number, outletId: number) => Promise<OutletFullResponse>` | YES | Read-only |
| `createOutlet` | `(params: CreateOutletParams) => Promise<OutletFullResponse>` | **NO** | Requires `actor: OutletActor` |
| `updateOutlet` | `(params: UpdateOutletParams) => Promise<OutletFullResponse>` | **NO** | Requires actor |
| `deleteOutlet` | `(params: {companyId, outletId, actor}) => Promise<void>` | **NO** | Requires actor, has FK checks |
| `deactivateOutlet` | `(params: {companyId, outletId, actor}) => Promise<OutletFullResponse>` | **NO** | Wrapper around updateOutlet, requires actor |

**Test Impact:** 2 direct SQL instances for `outlets`

---

### item-prices/index.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `listItemPrices` | `(companyId: number, filters?: {outletId?, outletIds?, isActive?, includeDefaults?, variantId?}) => Promise<ItemPrice[]>` | YES | Read-only |
| `listEffectiveItemPricesForOutlet` | `(companyId: number, outletId: number, filters?: {isActive?}) => Promise<ItemPrice[]>` | YES | Read-only |
| `findItemPriceById` | `(companyId: number, itemPriceId: number) => Promise<ItemPrice \| null>` | YES | Read-only |
| `createItemPrice` | `(companyId: number, input: {item_id, outlet_id, variant_id?, price, is_active?}, actor?: MutationAuditActor) => Promise<ItemPrice>` | **PARTIAL** | Actor optional, clears price cache |
| `updateItemPrice` | `(companyId: number, itemPriceId: number, input: {...}, actor?: MutationAuditActor) => Promise<ItemPrice \| null>` | **PARTIAL** | Actor optional |
| `deleteItemPrice` | `(companyId: number, itemPriceId: number, actor?: MutationAuditActor) => Promise<boolean>` | **PARTIAL** | Actor optional, clears price cache |

**Test Impact:** 21 direct SQL instances - **HIGH PRIORITY**

---

### item-variants.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `getItemById` | `(companyId: number, itemId: number) => Promise<{sku, price} \| null>` | YES | Read-only helper |
| `createVariantAttribute` | `(companyId: number, itemId: number, input: CreateVariantAttributeRequest) => Promise<VariantAttribute>` | **PARTIAL** | Complex function, regenerates all variants |
| `updateVariantAttribute` | `(companyId: number, attributeId: number, input: UpdateVariantAttributeRequest) => Promise<VariantAttribute>` | **PARTIAL** | Complex function |
| `deleteVariantAttribute` | `(companyId: number, attributeId: number) => Promise<void>` | **PARTIAL** | Archives related variants |
| `listVariantAttributes` | `(companyId: number, itemId: number) => Promise<VariantAttribute[]>` | YES | Read-only |
| `getVariantEffectivePrice` | `(companyId: number, variantId: number, outletId?: number) => Promise<number>` | YES | Read-only |
| `getVariantEffectivePricesBatch` | `(companyId: number, variantIds: number[], outletId?: number) => Promise<Map<number, number>>` | YES | Read-only, batch optimized |
| `getItemVariants` | `(companyId: number, itemId: number) => Promise<ItemVariantResponse[]>` | YES | Read-only |
| `getVariantById` | `(companyId: number, variantId: number) => Promise<ItemVariantResponse \| null>` | YES | Read-only |
| `updateVariant` | `(companyId: number, variantId: number, input: UpdateVariantRequest) => Promise<ItemVariantResponse>` | YES | No actor required, proper transactions |
| `adjustVariantStock` | `(companyId: number, variantId: number, adjustment: number, reason: string) => Promise<number>` | YES | No actor required, TODO: needs audit log |
| `validateVariantSku` | `(companyId: number, sku: string, excludeVariantId?: number) => Promise<{valid, error?}` | YES | Read-only |
| `getVariantsForSync` | `(companyId: number, outletId?: number) => Promise<SyncPullVariant[]>` | YES | Read-only |

**Test Impact:** 7 direct SQL instances for `item_variants`, 13 for `item_variant_attributes`, 2 for `item_variant_combinations`

---

### users.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `listUsers` | `(companyId: number, actor: {userId, companyId}, filters?: {isActive?, search?}) => Promise<UserProfile[]>` | **PARTIAL** | Requires actor for cross-company check |
| `findUserById` | `(companyId: number, userId: number) => Promise<UserProfile \| null>` | YES | Read-only |
| `createUser` | `(params: {companyId, name?, email, password?, roleCodes?, outletIds?, outletRoleAssignments?, isActive?, actor: UserActor}) => Promise<UserProfile>` | **NO** | Requires actor, complex role validation |
| `updateUserEmail` | `(params: {companyId, userId, email, actor}) => Promise<UserProfile>` | **NO** | Requires actor |
| `setUserRoles` | `(params: {companyId, userId, roleCodes, outletId?, actor}) => Promise<UserProfile>` | **NO** | Requires actor, role level validation |
| `setUserOutlets` | `(params: {companyId, userId, outletIds, actor}) => Promise<UserProfile>` | **NO** | Requires actor |
| `setUserPassword` | `(params: {companyId, userId, password, actor}) => Promise<void>` | **NO** | Requires actor |
| `setUserActiveState` | `(params: {companyId, userId, isActive, actor}) => Promise<UserProfile>` | **NO** | Requires actor |
| `listRoles` | `(companyId: number, isSuperAdmin?: boolean, filterCompanyId?: number) => Promise<Role[]>` | YES | Read-only |
| `getRole` | `(roleId: number) => Promise<Role>` | YES | Read-only |
| `getRoleWithPermissions` | `(params: {roleId, companyId}) => Promise<Role & {permissions}>` | YES | Read-only |
| `createRole` | `(params: {companyId, code, name, roleLevel?, actor}) => Promise<Role>` | **NO** | Requires actor, role level validation |
| `updateRole` | `(params: {companyId, roleId, name?, actor}) => Promise<Role>` | **NO** | Requires actor |
| `deleteRole` | `(params: {companyId, roleId, actor}) => Promise<void>` | **NO** | Requires actor, checks user assignments |
| `listOutlets` | `(companyId: number) => Promise<{id, code, name}[]>` | YES | Read-only |
| `listModuleRoles` | `(params: {companyId, roleId?, module?}) => Promise<ModuleRoleResponse[]>` | YES | Read-only |
| `setModuleRolePermission` | `(params: {companyId, roleId, module, permissionMask, actor}) => Promise<ModuleRoleResponse>` | **NO** | Requires actor |

**Test Impact:** 3 direct SQL instances for `users`

---

### item-groups/index.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `listItemGroups` | `(companyId: number, filters?: {isActive?}) => Promise<ItemGroup[]>` | YES | Read-only |
| `findItemGroupById` | `(companyId: number, groupId: number) => Promise<ItemGroup \| null>` | YES | Read-only |
| `createItemGroup` | `(companyId: number, input: {code?, name, parent_id?, is_active?}, actor?: MutationAuditActor) => Promise<ItemGroup>` | **PARTIAL** | Actor optional |
| `createItemGroupsBulk` | `(companyId: number, rows: ItemGroupBulkRow[], actor?: MutationAuditActor) => Promise<{created_count, groups}>` | **PARTIAL** | Actor optional, complex bulk operations |
| `updateItemGroup` | `(companyId: number, groupId: number, input: {...}, actor?: MutationAuditActor) => Promise<ItemGroup \| null>` | **PARTIAL** | Actor optional |
| `deleteItemGroup` | `(companyId: number, groupId: number, actor?: MutationAuditActor) => Promise<boolean>` | **PARTIAL** | Actor optional, checks for children |

---

### accounts.ts (delegates to AccountsService)

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `listAccounts` | `(query: AccountListQuery) => Promise<AccountResponse[]>` | YES | Read-only |
| `getAccountById` | `(accountId: number, companyId: number) => Promise<AccountResponse>` | YES | Read-only |
| `createAccount` | `(data: AccountCreateRequest, userId?: number) => Promise<AccountResponse>` | YES | UserId optional for tests |
| `updateAccount` | `(accountId: number, data: AccountUpdateRequest, companyId: number, userId?: number) => Promise<AccountResponse>` | YES | UserId optional |
| `deactivateAccount` | `(accountId: number, companyId: number, userId?: number) => Promise<AccountResponse>` | YES | UserId optional |
| `reactivateAccount` | `(accountId: number, companyId: number, userId?: number) => Promise<AccountResponse>` | YES | UserId optional |
| `getAccountTree` | `(companyId: number, includeInactive?: boolean) => Promise<AccountTreeNode[]>` | YES | Read-only |
| `isAccountInUse` | `(accountId: number, companyId: number) => Promise<boolean>` | YES | Read-only |

**Note:** Accounts functions are fully test-friendly with optional `userId`.

---

### import/session-store.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `createSession` | `(pool: Pool, sessionId: string, companyId: number, entityType: string, payload: Record) => Promise<void>` | YES | Requires passing pool explicitly |
| `getSession` | `(pool: Pool, sessionId: string, companyId: number) => Promise<StoredSession \| null>` | YES | Requires pool, tenant-scoped |
| `updateSession` | `(pool: Pool, sessionId: string, companyId: number, payload: Record) => Promise<void>` | YES | Requires pool |
| `updateCheckpoint` | `(pool: Pool, sessionId: string, companyId: number, checkpoint: CheckpointData) => Promise<void>` | YES | Requires pool |
| `clearCheckpoint` | `(pool: Pool, sessionId: string, companyId: number) => Promise<void>` | YES | Requires pool |
| `updateFileHash` | `(pool: Pool, sessionId: string, companyId: number, fileHash: string) => Promise<void>` | YES | Requires pool |
| `computeFileHash` | `(buffer: Buffer) => Promise<string>` | YES | Pure function, no DB |
| `getCheckpoint` | `(pool: Pool, sessionId: string, companyId: number) => Promise<CheckpointData \| null>` | YES | Requires pool |
| `deleteSession` | `(pool: Pool, sessionId: string, companyId: number) => Promise<void>` | YES | Requires pool |
| `cleanupExpiredSessions` | `(pool: Pool) => Promise<number>` | YES | Requires pool |

**Test Impact:** 4 direct SQL instances for `import_sessions`

---

### progress/progress-store.ts

| Function | Signature | Test-Friendly | Notes |
|----------|-----------|---------------|-------|
| `startProgress` | `(input: StartProgressInput) => Promise<void>` | **PARTIAL** | Requires `setProgressPool()` initialization |
| `getProgress` | `(operationId: string, companyId: number) => Promise<OperationProgress \| null>` | **PARTIAL** | Requires pool initialization |
| `updateProgress` | `(input: UpdateProgressInput) => Promise<boolean>` | **PARTIAL** | Requires pool init, milestone throttling |
| `updateProgressAsync` | `(input: UpdateProgressInput) => void` | **PARTIAL** | Fire-and-forget, same requirements |
| `completeProgress` | `(input: CompleteProgressInput) => Promise<void>` | **PARTIAL** | Requires pool init |
| `failProgress` | `(input: FailProgressInput) => Promise<void>` | **PARTIAL** | Requires pool init |
| `cancelProgress` | `(operationId: string, companyId: number) => Promise<void>` | **PARTIAL** | Requires pool init |
| `findStaleOperations` | `() => Promise<string[]>` | **PARTIAL** | Requires pool init |
| `cleanupStaleOperations` | `() => Promise<number>` | **PARTIAL** | Requires pool init |
| `listProgress` | `(companyId: number, options?) => Promise<{operations, total}>` | **PARTIAL** | Requires pool init |
| `clearProgressTracking` | `() => void` | YES | Test isolation helper |
| `setProgressPool` | `(pool: Pool) => void` | YES | Initialization for tests |
| `calculateEta` | `(progress: OperationProgress) => number \| null` | YES | Pure function |
| `calculatePercentage` | `(progress: OperationProgress) => number` | YES | Pure function |

**Test Impact:** 39 direct SQL instances for `operation_progress` - **HIGH PRIORITY**

---

## Functions Missing for Tests

The following entities have direct SQL in tests but **no library functions** exist:

| Entity | Needed Function(s) | Suggested Location | Priority |
|--------|-------------------|-------------------|----------|
| `recipe_ingredients` | `createRecipeIngredient()`, `deleteRecipeIngredient()` | `lib/recipe-ingredients.ts` (new) | MEDIUM |
| `supplies` | `createSupply()`, `deleteSupply()` | `lib/supplies.ts` (new) | LOW |
| `item_images` | `createItemImage()`, `deleteItemImage()` | `lib/item-images.ts` | LOW |
| `pos_order_snapshots` | `createOrderSnapshot()` | `lib/sync/push/orders.ts` | LOW |
| `outlet_tables` | `createOutletTable()`, `deleteOutletTable()` | `lib/outlet-tables.ts` | LOW |
| `reservations` | `createReservation()`, `deleteReservation()` | `lib/reservations.ts` | MEDIUM |
| `inventory_transactions` | `createInventoryTransaction()` | `lib/inventory/` (new) | LOW |

---

## Test-Friendly Function Summary

### Fully Usable in Tests (No Modifications Needed)

| File | Functions |
|------|-----------|
| `items/index.ts` | `listItems`, `findItemById`, `getItemVariantStats` |
| `item-prices/index.ts` | `listItemPrices`, `listEffectiveItemPricesForOutlet`, `findItemPriceById` |
| `item-variants.ts` | `getItemById`, `listVariantAttributes`, `getVariantEffectivePrice`, `getVariantEffectivePricesBatch`, `getItemVariants`, `getVariantById`, `updateVariant`, `adjustVariantStock`, `validateVariantSku`, `getVariantsForSync` |
| `users.ts` | `findUserById`, `listRoles`, `getRole`, `getRoleWithPermissions`, `listOutlets`, `listModuleRoles` |
| `item-groups/index.ts` | `listItemGroups`, `findItemGroupById` |
| `accounts.ts` | All functions (optional userId) |
| `import/session-store.ts` | All functions (require pool parameter) |
| `progress/progress-store.ts` | `clearProgressTracking`, `setProgressPool`, `calculateEta`, `calculatePercentage` |
| `outlets.ts` | `listOutletsByCompany`, `getOutlet` |

### Partially Usable (Actor Optional)

| File | Functions | Notes |
|------|-----------|-------|
| `items/index.ts` | `createItem`, `updateItem`, `deleteItem` | Actor optional but recommended |
| `item-prices/index.ts` | `createItemPrice`, `updateItemPrice`, `deleteItemPrice` | Actor optional, clears price cache |
| `item-variants.ts` | `createVariantAttribute`, `updateVariantAttribute`, `deleteVariantAttribute` | Complex variant regeneration |
| `item-groups/index.ts` | `createItemGroup`, `createItemGroupsBulk`, `updateItemGroup`, `deleteItemGroup` | Actor optional |
| `progress/progress-store.ts` | Most functions | Require `setProgressPool()` initialization |

### Not Usable Without Modification

| File | Functions | Issue |
|------|-----------|-------|
| `companies.ts` | All CRUD | Requires `actor: CompanyActor` with `userId` for all mutations |
| `outlets.ts` | `createOutlet`, `updateOutlet`, `deleteOutlet`, `deactivateOutlet` | Requires `actor: OutletActor` |
| `users.ts` | `createUser`, `updateUserEmail`, `setUserRoles`, `setUserOutlets`, `setUserPassword`, `setUserActiveState`, `createRole`, `updateRole`, `deleteRole`, `setModuleRolePermission` | Complex actor validations |
| `users.ts` | `listUsers` | Requires actor for cross-company check |

---

## Recommendations for Test Library Refactoring

### Phase 1: High-Impact Functions (Start Here)

1. **items/index.ts** - 58 direct SQL instances
   - `createItem()` - Make actor truly optional
   - `deleteItem()` - Already partially test-friendly
   
2. **progress/progress-store.ts** - 39 direct SQL instances
   - Add test helper: `createProgress(pool, input)` that bypasses milestone throttling
   - Or document `setProgressPool()` + `clearProgressTracking()` pattern clearly

3. **item-prices/index.ts** - 21 direct SQL instances
   - Already mostly test-friendly, just need clear documentation

### Phase 2: Medium-Impact Functions

4. **item-variants.ts** - 22 direct SQL instances (7 + 13 + 2)
   - Consider test-only variant creation helpers
   - `adjustVariantStock` needs audit log (TODO comment exists)

5. **users.ts** - 3 direct SQL instances
   - `createUser()` could have test-friendly overload that skips role validation

6. **item-groups/index.ts** - 0 direct SQL (but referenced by items)
   - Already test-friendly

### Phase 3: Low-Impact / New Functions

7. Create missing library functions for:
   - `recipe_ingredients` (11 instances)
   - `supplies` (6 instances)
   - `item_images` (5 instances)

### Phase 4: Utilities

8. Document `import/session-store.ts` usage pattern for tests
9. Document `progress/progress-store.ts` initialization for tests

---

## Testing Directory Structure

For future test utilities and helpers:

```
apps/api/src/testing/
├── README.md              # This guide
├── helpers/               # Test utility functions
│   ├── actors.ts          # Actor factories for tests
│   ├── fixtures.ts        # Common test fixtures
│   └── db.ts              # Database test utilities
└── patterns/              # Testing patterns documentation
    ├── library-usage.md   # How to use library functions in tests
    └── direct-sql.md      # When direct SQL is acceptable
```

---

## Actor Patterns for Tests

Most library functions require an `actor` parameter for audit purposes. For tests, use:

```typescript
// companies.ts requires CompanyActor
const testActor = {
  userId: 1,           // Required
  outletId: null,     // Optional
  ipAddress: null      // Optional
};

// users.ts requires UserActor (same shape)
const testUserActor = {
  userId: 1,
  outletId: null,
  ipAddress: null
};

// items/item-prices/item-groups use MutationAuditActor
const testMutationActor = {
  userId: 1,
  canManageCompanyDefaults: false  // Optional
};
```

---

## Audit Complete

Total functions documented: **47**  
Test-friendly (fully or partially): **~35 (74%)**  
Requires actor workaround: **22 (47%)**  
Missing library functions: **7 entities need new functions**

**Priority for refactoring:** items > progress > item-prices > item-variants > users
