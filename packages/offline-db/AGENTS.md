# AGENTS.md — @jurnapod/offline-db

## Package Purpose

Offline-first IndexedDB wrapper using Dexie for POS Progressive Web App. Provides local data persistence for offline operation with sync-ready data structures.

**Core Capabilities:**
- **Dexie.js wrapper**: Type-safe IndexedDB abstraction
- **Offline storage**: Local persistence for POS operational data
- **Sync-ready**: Data structures aligned with server sync contracts
- **Schema versioning**: Database migrations for schema evolution

**Boundaries:**
- ✅ In: Local IndexedDB operations, data caching, offline storage
- ❌ Out: Sync logic (in pos-sync), server communication, authentication state

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run build:watch` | Watch mode for development |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Dexie Database Setup

```typescript
import { createOfflineDb } from '@jurnapod/offline-db/dexie';

const db = createOfflineDb({
  version: 1,
  tables: ['items', 'variants', 'orders', 'transactions']
});
```

### Data Access

```typescript
// Store data locally
await db.items.put({ id: 1, name: 'Latte', price: 25000 });

// Query with Dexie
const items = await db.items.where('companyId').equals(1).toArray();

// Delete
await db.items.delete(1);
```

### Sync-Ready Structure

Data structures mirror server schemas for easy sync:

```typescript
interface LocalItem {
  id: number;
  companyId: number;
  outletId: number;
  name: string;
  code: string;
  price: number;
  // ... matches server Item schema
}
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| DexieWrapper | `dexie/db.ts` | Dexie database factory |
| Types | `dexie/types.ts` | TypeScript type definitions |
| Index | `dexie/index.ts` | Main exports |

### File Structure

```
packages/offline-db/
├── dexie/
│   ├── index.ts              # Main exports (createOfflineDb)
│   ├── db.ts                 # Dexie database setup and migrations
│   └── types.ts             # Type definitions
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
   import { createOfflineDb } from './dexie/index.js';
   ```

2. **Use Dexie query builder** — never raw IndexedDB APIs:
   ```typescript
   // CORRECT - Dexie query
   const items = await db.items.toArray();
   
   // WRONG - raw IndexedDB
   const request = indexedDB.open('name', 1);
   ```

3. **Export types from `dexie/index.ts`** for public API surface

### Database Schema

Schema must be defined with Dexie's schema syntax:

```typescript
const db = new Dexie('JurnapodPOS');
db.version(1).stores({
  items: 'id, companyId, outletId, code',
  variants: 'id, itemId, code',
  orders: 'id, companyId, outletId, status',
  transactions: 'client_tx_id, companyId, outletId'
});
```

---

## Testing Approach

### Unit Tests

Dexie operations can be tested with in-memory mock or direct IndexedDB:

```typescript
import { describe, it, expect } from 'vitest';

describe('OfflineDb', () => {
  it('should store and retrieve items', async () => {
    const db = createOfflineDb({ version: 1, tables: ['items'] });
    await db.items.put({ id: 1, name: 'Test' });
    const item = await db.items.get(1);
    expect(item?.name).toBe('Test');
  });
});
```

---

## DB Testing Policy

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

This package (`@jurnapod/offline-db`) uses IndexedDB (Dexie) for local storage, not a server-side database. The testing approach differs:

- **Local IndexedDB (Dexie)**: Uses Dexie's in-memory/adapter approach for testing - this is appropriate since the data store IS the Dexie wrapper
- **Server-side DB (MySQL/MariaDB via Kysely)**: For packages that use `@jurnapod/db`, DB-backed tests MUST use real database connections

If your tests involve both offline-db AND server-side DB (e.g., sync operations), use real DB integration for the server-side portion:

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

**Non-DB logic (pure computation) may use unit tests without database.**

---

## Security Rules

### Critical Constraints

1. **Never store sensitive data unencrypted** — POS may be lost/stolen
2. **Clear sensitive data on logout** — implement `db.delete()` on sign-out
3. **No PII in IndexedDB logs** — log only non-sensitive identifiers

---

## Review Checklist

When modifying this package:

- [ ] Schema version incremented for breaking changes
- [ ] Migration logic handles upgrade/downgrade
- [ ] No sensitive data stored without encryption
- [ ] Dexie query builder used (not raw IndexedDB)
- [ ] Data structures match server sync contracts
- [ ] Tests cover CRUD operations

---

## Related Packages

- `@jurnapod/pos-sync` — Sync module that reads/writes from offline DB
- `@jurnapod/shared` — Shared Zod schemas for validation

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

For project-wide conventions, see root `AGENTS.md`.