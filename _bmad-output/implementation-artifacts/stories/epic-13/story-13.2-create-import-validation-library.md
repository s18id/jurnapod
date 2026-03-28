# Story 13.2: Create lib/import/validation.ts

**Status:** backlog  
**Epic:** Epic 13: Complete Library Migration for Deferred Routes  
**Story ID:** 13-2-create-import-validation-library  
**Estimated Effort:** 4 hours

---

## Context

Import validation logic is currently inline in `import.ts`. This should be extracted to a library for reusability and testability.

---

## Current Validation in import.ts

1. **Item validation:**
   - Required fields: name, code
   - Code format validation
   - Duplicate code check within import file
   - Item group existence

2. **Price validation:**
   - Price >= 0
   - Item existence
   - Outlet validation
   - Duplicate price check

---

## Acceptance Criteria

### AC1: Item Validation

```typescript
export interface ItemValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ValidationWarning {
  row: number;
  field: string;
  message: string;
}

export async function validateImportItems(
  companyId: number,
  items: ImportItem[],
  options?: ValidationOptions
): Promise<ItemValidationResult>
```

### AC2: Price Validation

```typescript
export interface PriceValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export async function validateImportPrices(
  companyId: number,
  prices: ImportPrice[],
  options?: ValidationOptions
): Promise<PriceValidationResult>
```

### AC3: Pre-validation (Sync)

```typescript
// Synchronous validation (no DB needed)
export function preValidateItems(
  items: ImportItem[]
): ItemValidationResult;

// Check for duplicates within import file
export function findDuplicateCodes(
  items: ImportItem[]
): Map<string, number[]>;
```

### AC4: Validation Options

```typescript
export interface ValidationOptions {
  strictMode?: boolean;      // Fail on warnings
  skipExistingCheck?: boolean; // Skip DB existence checks
  maxErrors?: number;        // Stop after N errors
}
```

---

## Files to Create

1. `apps/api/src/lib/import/validation.ts`
2. `apps/api/src/lib/import/validation.test.ts`

---

## Implementation Notes

- Separate sync (fast) from async (DB) validation
- Return all errors, not just first
- Support strict/lenient modes
- Reuse existing validation patterns

---

## Definition of Done

- [ ] Item validation implemented
- [ ] Price validation implemented
- [ ] Pre-validation (sync) working
- [ ] All validation options supported
- [ ] Unit tests for all validators
- [ ] TypeScript compilation passes

---

*Ready for implementation.*
