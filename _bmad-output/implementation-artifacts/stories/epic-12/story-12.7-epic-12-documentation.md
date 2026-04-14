# Story 12.7: Epic 12 Documentation & ADR Update

**Status:** done  
**Epic:** Epic 12: Standardize Library Usage for All Routes  
**Story ID:** 12-7-epic-12-documentation  
**Estimated Effort:** 3 hours

---

## Context

Document the library-first architecture pattern established in Epic 12. This includes creating an Architecture Decision Record (ADR), updating project documentation, and creating a template for future library modules.

---

## Acceptance Criteria

### AC1: Create ADR-0012: Library-First Architecture

Create `docs/adr/ADR-0012-library-first-architecture.md`:

```markdown
# ADR-0012: Library-First Architecture for API Routes

## Status
Accepted

## Context
API routes were mixing HTTP handling with database operations, leading to:
- Inconsistent patterns across routes
- Difficult to test routes (required database setup)
- Duplicated SQL queries
- Routes that were too large and complex

## Decision
All database operations must go through library modules in `lib/`.
Routes are thin HTTP handlers that:
1. Validate input (Zod schemas)
2. Call library functions
3. Format responses
4. Handle HTTP-specific errors

## Consequences

### Positive
- Routes are simple and testable
- Business logic is reusable
- Consistent error handling
- Easier to migrate to Kysely later

### Negative
- More files to maintain
- Additional layer of abstraction
- Need discipline to not add SQL to routes

## Implementation
Epic 12 standardized all routes to use libraries:
- Created missing libraries (settings-modules, sync/check-duplicate)
- Extended existing libraries (export)
- Refactored 7 routes to use libraries

## References
- Epic 12: Standardize Library Usage for All Routes
- `apps/api/src/lib/TEMPLATE.md`
```

### AC2: Update project-context.md

Add section **"Route Library Pattern"** after "Epic Documentation Structure":

```markdown
#### Route Library Pattern

All API routes must follow the library-first architecture:

**Rule: Routes delegate to libraries**
- Routes must NOT contain direct SQL queries
- Routes import database operations from `lib/` modules
- Routes are thin HTTP handlers (validation → library → response)

**Directory Responsibilities:**
| Directory | Responsibility |
|-----------|---------------|
| `routes/` | HTTP handling, auth, validation, response formatting |
| `lib/` | Database operations, business logic, domain rules |

**Example:**
```typescript
// routes/settings-modules.ts - HTTP layer
import { listCompanyModules } from "../lib/settings-modules.js";

modulesRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const modules = await listCompanyModules(auth.companyId);
  return successResponse(modules);
});

// lib/settings-modules.ts - Business logic
export async function listCompanyModules(companyId: number) {
  const pool = getDbPool();
  const [rows] = await pool.execute(
    `SELECT ... FROM modules WHERE company_id = ?`,
    [companyId]
  );
  return rows.map(transform);
}
```

**Anti-patterns:**
- ❌ SQL queries in route files
- ❌ `pool.execute()` in routes
- ❌ Business logic mixed with HTTP handling

**Enforcement:**
- ESLint rules detect direct SQL in routes
- Code review checklist includes library usage
- Epic 12 completion means zero exceptions
```

### AC3: Create Library Template

Create `apps/api/src/lib/TEMPLATE.md`:

```markdown
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
```

### AC4: Update AGENTS.md (API)

Add to `apps/api/AGENTS.md`:

```markdown
### Library Usage Rule

Routes must delegate database operations to library modules:

**Correct:**
```typescript
// routes/example.ts
import { listItems } from "../lib/items.js";

route.get("/", async (c) => {
  const items = await listItems(companyId);
  return c.json({ items });
});
```

**Incorrect:**
```typescript
// routes/example.ts
import { getDbPool } from "../lib/db.js";

route.get("/", async (c) => {
  const pool = getDbPool();
  const [rows] = await pool.execute("SELECT * FROM items");  // ❌ No!
  return c.json({ items: rows });
});
```

**Flag in code review:**
- Any `pool.execute()` in route files
- Any SQL strings in routes
- Routes importing `getDbPool` directly
```

### AC5: Update epics.md Index

Add Epic 12 to `_bmad-output/planning-artifacts/epics.md`:

```markdown
## Epic 12: Standardize Library Usage for All Routes

Establish library-first architecture by moving all database operations from routes to library modules.

### Stories
| Story | Title |
|-------|-------|
| 12.1 | Create `lib/settings-modules.ts` Library |
| 12.2 | Refactor `settings-modules.ts` Route |
| 12.3 | Create `lib/sync/check-duplicate.ts` Library |
| 12.4 | Refactor `sync/check-duplicate.ts` Route |
| 12.5 | Extend `lib/export/` for Route Queries |
| 12.6 | Refactor `export.ts` Route |
| 12.7 | Epic 12 Documentation & ADR Update |

**Path:** [epic-12](../implementation-artifacts/stories/epic-12/epic-12.md)
```

### AC6: Update sprint-status.yaml

Add Epic 12 tracking:

```yaml
# Epic 12: Standardize Library Usage for All Routes
epic-12: backlog
12-1-create-settings-modules-library: backlog
12-2-refactor-settings-modules-route: backlog
12-3-create-sync-check-duplicate-library: backlog
12-4-refactor-sync-check-duplicate-route: backlog
12-5-extend-export-library: backlog
12-6-refactor-export-route: backlog
12-7-epic-12-documentation: backlog
epic-12-retrospective: backlog
```

---

## Files to Create/Modify

1. `docs/adr/ADR-0012-library-first-architecture.md` - New ADR
2. `_bmad-output/project-context.md` - Add Route Library Pattern section
3. `apps/api/src/lib/TEMPLATE.md` - New library template
4. `apps/api/AGENTS.md` - Add library usage rule
5. `_bmad-output/planning-artifacts/epics.md` - Add Epic 12 index
6. `_bmad-output/implementation-artifacts/sprint-status.yaml` - Add Epic 12 tracking

---

## Definition of Done

- [ ] ADR-0012 created and complete
- [ ] project-context.md updated with Route Library Pattern
- [ ] Library template created (TEMPLATE.md)
- [ ] AGENTS.md updated with library usage rule
- [ ] epics.md updated with Epic 12 index
- [ ] sprint-status.yaml updated with Epic 12 stories
- [ ] All documentation links work
- [ ] No typos or formatting issues

---

## Completion Notes

**Completed by:** bmad-agent-dev (delegated agent)  
**Completion Date:** 2026-03-28  
**Actual Effort:** ~3 hours  
**Depends on:** Stories 12.1-12.6 (all completed)

### Documentation Created/Updated

1. **ADR-0012: Library-First Architecture** (Created)
   - `docs/adr/ADR-0012-library-first-architecture.md`
   - Documents the decision to use libraries for all DB operations
   - Explains consequences and implementation

2. **project-context.md** (Updated)
   - Added "Route Library Pattern" section
   - Documented directory responsibilities
   - Added before/after examples
   - Documented anti-patterns

3. **Library Template** (Created)
   - `apps/api/src/lib/TEMPLATE.md`
   - Standard structure for future libraries
   - Type definitions, error classes, CRUD operations
   - Best practices and testing guidance

4. **AGENTS.md** (Updated)
   - Added "Library Usage Rule" section
   - Correct vs incorrect examples
   - Code review checklist items

5. **epics.md** (Updated)
   - Added Epic 12 to central index
   - Story titles and links

6. **sprint-status.yaml** (Updated)
   - Added Epic 12 tracking
   - All stories marked as done

### Documentation Deliverables

| Document | Purpose | Status |
|----------|---------|--------|
| ADR-0012 | Architecture decision record | ✅ Created |
| project-context.md | Project patterns and rules | ✅ Updated |
| TEMPLATE.md | Library template | ✅ Created |
| AGENTS.md | API development rules | ✅ Updated |
| epics.md | Epic index | ✅ Updated |
| sprint-status.yaml | Story tracking | ✅ Updated |

### Key Patterns Documented

1. **Route → Library → Database** flow
2. **Connection parameter** pattern for transactions
3. **Error class** pattern for domain errors
4. **Export types** for library consumers

### Acceptance Criteria

- [x] ADR-0012 created and complete
- [x] project-context.md updated with Route Library Pattern
- [x] Library template created (TEMPLATE.md)
- [x] AGENTS.md updated with library usage rule
- [x] epics.md updated with Epic 12 index
- [x] sprint-status.yaml updated with Epic 12 stories
- [x] All documentation links work
- [x] No typos or formatting issues

*Story completed successfully.*

---

*Final story of Epic 12 - documentation only.*
