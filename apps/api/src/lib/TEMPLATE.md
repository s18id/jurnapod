# Library Module Template

Use this template when creating new library modules.

## File Structure

```typescript
// lib/[module-name].ts
import { getDbPool } from "./db.js";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

// ============================================================================
// Types
// ============================================================================

export interface EntitySettings {
  id: number;
  company_id: number;
  name: string;
  // ... other fields
}

// ============================================================================
// Error Classes
// ============================================================================

export class EntityNotFoundError extends Error {
  constructor(id: number) {
    super(`Entity ${id} not found`);
    this.name = "EntityNotFoundError";
  }
}

export class EntityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityValidationError";
  }
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * List entities for a company
 * @param companyId - Company ID
 * @param filters - Optional filters
 * @returns Array of entities
 */
export async function listEntities(
  companyId: number,
  filters?: EntityFilters
): Promise<EntitySettings[]> {
  const pool = getDbPool();
  // ... implementation
}

/**
 * Get single entity by ID
 * @param id - Entity ID
 * @param companyId - Company ID (for scoping)
 * @returns Entity or undefined if not found
 */
export async function getEntityById(
  id: number,
  companyId: number
): Promise<EntitySettings | undefined> {
  const pool = getDbPool();
  // ... implementation
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Create new entity
 * @param companyId - Company ID
 * @param data - Entity data
 * @param connection - Optional connection for transactions
 * @returns Created entity
 * @throws EntityValidationError if validation fails
 */
export async function createEntity(
  companyId: number,
  data: EntityCreateData,
  connection?: PoolConnection
): Promise<EntitySettings> {
  const db = connection || getDbPool();
  // ... implementation
}

/**
 * Update existing entity
 * @param id - Entity ID
 * @param companyId - Company ID
 * @param data - Update data
 * @param connection - Optional connection for transactions
 * @throws EntityNotFoundError if entity doesn't exist
 */
export async function updateEntity(
  id: number,
  companyId: number,
  data: EntityUpdateData,
  connection?: PoolConnection
): Promise<void> {
  const db = connection || getDbPool();
  // ... implementation
}

/**
 * Delete/Deactivate entity
 * @param id - Entity ID
 * @param companyId - Company ID
 * @param connection - Optional connection for transactions
 * @throws EntityNotFoundError if entity doesn't exist
 */
export async function deleteEntity(
  id: number,
  companyId: number,
  connection?: PoolConnection
): Promise<void> {
  const db = connection || getDbPool();
  // ... implementation
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Validate entity data
 * @param data - Data to validate
 * @throws EntityValidationError if invalid
 */
export function validateEntityData(data: unknown): asserts data is EntityCreateData {
  // ... validation logic
}
```

## Best Practices

1. **Always accept optional `PoolConnection`** for transaction support
2. **Export interfaces** for type safety
3. **Export error classes** for route error handling
4. **Use JSDoc comments** for all public functions
5. **Scope by company_id** in all queries
6. **Throw domain errors** (don't return null for errors)
7. **Create `.test.ts` file** with same name

## Testing Template

Create `[module-name].test.ts`:

```typescript
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { getDbPool, closeDbPool } from "./db.js";
import {
  listEntities,
  createEntity,
  EntityNotFoundError
} from "./[module-name].js";

describe("[Module Name]", () => {
  test.after(async () => {
    await closeDbPool();
  });

  test("listEntities returns scoped results", async () => {
    // ... test
  });
});
```