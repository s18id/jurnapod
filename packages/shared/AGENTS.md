# AGENTS.md — @jurnapod/shared

## Package Purpose

Cross-app contracts for Jurnapod ERP — shared TypeScript types, Zod schemas, and constants used across all apps and packages.

**Core Capabilities:**
- **Zod schemas**: Type-safe validation for API boundaries, sync contracts, and domain objects
- **TypeScript types**: Derived from schemas for end-to-end type safety
- **Constants**: Shared business constants (account codes, table states, etc.)
- **Temporal helpers**: JS Temporal polyfill utilities for date/time operations

**Boundaries:**
- ✅ In: Schema definitions, type exports, constants, validation helpers
- ❌ Out: Business logic, database operations, API implementation

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Schema-First Design

All shared types are derived from Zod schemas:

```typescript
import { AccountSchema, type Account } from '@jurnapod/shared';

const account = AccountSchema.parse(rawAccount);
```

### Validation at Boundaries

Schemas enforce validation at system boundaries:

```typescript
// API input validation
import { PosSyncPullRequestSchema } from '@jurnapod/shared';

const params = PosSyncPullRequestSchema.parse(request.query);
```

---

## Module Organization

| Module | Files | Purpose |
|--------|-------|---------|
| Schemas | `schemas/*.ts` | Zod schemas for all domain objects |
| Constants | `constants/*.ts` | Shared business constants |
| Client | `client.ts` | Client-side type helpers |

### Schema Categories

| Category | Schemas |
|----------|---------|
| **Auth** | users, sessions |
| **Platform** | companies, outlets, settings |
| **Master Data** | accounts, items, customers, suppliers |
| **Sales** | invoices, payments, credit notes |
| **Inventory** | stock movements, recipes |
| **Reservations** | reservations, table groups, tables |
| **Accounting** | journals, posting rules |
| **Sync** | pos-sync, backoffice-sync contracts |

### RBAC Constants (Epic 39)

This package exports ACL constants for the resource-level permission model:

**Location:** `src/constants/rbac.ts`, `src/constants/modules.ts`

**Canonical Permission Source:** `src/constants/roles.defaults.json`

`roles.defaults.json` is the single source of truth for default role-permission matrix. Seed and validation flows must consume this source directly (or via `rbac.ts` exports), not duplicate hardcoded matrices.

**7 Canonical Modules:**
- platform, pos, sales, inventory, accounting, treasury, reservations

**Permission Bits:**
- READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32

**Permission Masks:**
- CRUD=15, CRUDA=31, CRUDAM=63

See root `AGENTS.md` for full Epic 39 ACL documentation.

### File Structure

```
packages/shared/
├── src/
│   ├── index.ts                    # Main exports
│   ├── client.ts                   # Client-side helpers
│   │
│   ├── schemas/
│   │   ├── accounts.ts            # Chart of accounts
│   │   ├── companies.ts           # Company/org
│   │   ├── users.ts               # User accounts
│   │   ├── outlets.ts             # Outlet/branch
│   │   ├── journals.ts            # Journal entries
│   │   ├── posting.ts             # Posting rules
│   │   ├── sales.ts               # Invoices, payments
│   │   ├── taxes.ts               # Tax rates
│   │   ├── inventory-cost.ts      # Inventory costing
│   │   ├── reservations.ts        # Reservations
│   │   ├── table-reservation.ts   # Table reservations
│   │   ├── pos-sync.ts            # POS sync contracts
│   │   ├── audit-logs.ts          # Audit logging
│   │   └── ...                    # Other schemas
│   │
│   ├── constants/
│   │   ├── account-mapping-types.ts
│   │   └── table-states.ts
│   │
│   └── __tests__/
│       └── table-reservation.test.ts
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance):
   ```typescript
   import { AccountSchema } from './schemas/accounts.js';
   import { COMPANY_STATUS } from './constants/index.js';
   ```

2. **Export from `index.ts`** — all public types/schemas must be re-exported

3. **Prefer schema.parse over type assertions** — never use `as` for external data

### Schema Design Rules

1. **Use snake_case for JSON fields** — aligns with MySQL column names
2. **Prefer optional fields with explicit undefined** — `{ field?: string }` over `{ field: string | undefined }`
3. **Use Zod enums for controlled vocabularies**:
   ```typescript
   export const ServiceTypeSchema = z.enum(['TAKEAWAY', 'DINE_IN']);
   export type ServiceType = z.infer<typeof ServiceTypeSchema>;
   ```

### Money Handling

All money fields use `number` in schemas (represents cents/komain):

```typescript
// Amount in smallest currency unit (cents)
export const MoneySchema = z.number().int().nonnegative();
```

---

## Testing Approach

### Schema Tests

Schemas should have unit tests for edge cases:

```typescript
import { describe, it, expect } from 'vitest';
import { AccountSchema } from './accounts.js';

describe('AccountSchema', () => {
  it('should accept valid account', () => {
    const result = AccountSchema.safeParse({
      code: '1101',
      name: 'Cash',
      type: 'ASSET'
    });
    expect(result.success).toBe(true);
  });
});
```

---

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

This package (`@jurnapod/shared`) contains no database code itself, but packages that depend on it and perform DB operations MUST follow this policy:

DB-backed tests (tests that exercise database queries, transactions, or constraints) MUST use real database connections:

```typescript
// Load .env before other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { createKysely, type KyselySchema } from '@jurnapod/db';

const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// CRITICAL: Clean up in afterAll
afterAll(async () => {
  await db.destroy();
});
```

**Why no mocks for DB-backed tests?**
- Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and can introduce **severe production risk/destruction**
- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks don't reveal transaction isolation issues
- Integration with real DB catches performance problems early

**Non-DB logic (pure computation, schema validation) may use unit tests without database.**

---

## Security Rules

### Critical Constraints

1. **Never introduce breaking schema changes without migration plan** — check all consumers
2. **Validate all external data with schemas** — never trust unvalidated input
3. **Use strict Zod schemas** — avoid `.any()`, `.unknown()`, or excessive optionals

---

## Review Checklist

When modifying this package:

- [ ] Schema changes are backward-compatible or have migration plan
- [ ] All consumers of changed schemas are identified
- [ ] New schemas have corresponding TypeScript types exported
- [ ] Constants are used instead of magic numbers/strings elsewhere
- [ ] Tests cover edge cases (empty string, null, extreme values)
- [ ] Documentation (README) updated if public API changes

---

## Related Packages

- `@jurnapod/api` — Uses shared schemas for API validation
- `@jurnapod/pos-sync` — Uses shared schemas for sync contracts
- `@jurnapod/modules/*` — Domain modules use shared schemas

For project-wide conventions, see root `AGENTS.md`.
