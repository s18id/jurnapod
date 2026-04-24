# AGENTS.md — @jurnapod/modules-purchasing

## Package Purpose

Purchasing module for Jurnapod ERP — supplier management, purchase orders, goods receipts, AP invoices, and AP payment/credit workflows.

**Core Capabilities:**
- **Supplier management**: Supplier CRUD and status control
- **Purchase ordering**: PO creation, approval, and fulfillment tracking
- **Goods receipt**: GRN recording against purchase orders
- **AP invoicing**: Supplier invoice recording against GRNs
- **AP payments/credits**: Payment and credit note processing

**Boundaries:**
- ✅ In: Purchasing domain logic, domain fixtures, posting mappers
- ❌ Out: Chart of accounts management (modules-accounting), treasury management (modules-treasury)

---

## Owner-Package Fixture Model

This package **MUST** provide all purchasing domain fixtures for tests. All fixture functions:

- Are deterministic (no `Date.now()`, `Math.random()` for business-identifying defaults)
- Accept injected `db: KyselySchema` (from `@jurnapod/db`)
- Return typed interfaces matching production domain shapes
- Throw `NotImplementedError` with clear message until behavior is migrated from legacy location

**Fixture ownership rules:**
- `@jurnapod/db/test-fixtures` MUST contain only DB-generic primitives/assertions
- `@jurnapod/modules-purchasing/test-fixtures` MUST contain all purchasing domain fixtures
- `@jurnapod/modules-accounting/test-fixtures` MUST contain all accounting domain fixtures
- `@jurnapod/modules-platform/test-fixtures` MUST contain all platform domain fixtures

**Migration contract:**
- Legacy purchasing fixtures in `apps/api/src/lib/test-fixtures.ts` remain functional during migration
- New fixture implementations MUST be added to this package first
- Consumer flip (imports from owner packages) happens after new fixtures are verified

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Supplier Fixture

```typescript
import { createSupplierFixture } from '@jurnapod/modules-purchasing/test-fixtures';

const supplier = await createSupplierFixture(db, {
  companyId: 1,
  code: 'SUP-001',
  name: 'Test Supplier',
});
```

### Purchasing Accounts Fixture

```typescript
import { createPurchasingAccountsFixture } from '@jurnapod/modules-purchasing/test-fixtures';

const accounts = await createPurchasingAccountsFixture(db, {
  companyId: 1,
});
```

### Purchasing Settings Fixture

```typescript
import { createPurchasingSettingsFixture } from '@jurnapod/modules-purchasing/test-fixtures';

const settings = await createPurchasingSettingsFixture(db, {
  companyId: 1,
  apAccountId: 10,
  expenseAccountId: 11,
});
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| Test Fixtures | `test-fixtures/index.ts` | Fixture exports |
| Types | `test-fixtures/types.ts` | Fixture type definitions |
| Supplier | `test-fixtures/supplier.ts` | Supplier fixture |
| Purchasing Accounts | `test-fixtures/purchasing-accounts.ts` | AP and expense accounts fixture |
| Purchasing Settings | `test-fixtures/purchasing-settings.ts` | Company-level purchasing config |

### File Structure

```
packages/modules/purchasing/
├── src/
│   ├── index.ts                    # Main exports
│   └── test-fixtures/
│       ├── index.ts               # Fixture exports
│       ├── types.ts               # Type definitions
│       ├── supplier.ts            # Supplier fixture
│       ├── purchasing-accounts.ts # AP/expense accounts fixture
│       └── purchasing-settings.ts # Purchasing settings fixture
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance)
2. **Export from `index.ts`** for public API
3. **Use Kysely query builder** — never raw SQL

### Fixture Conventions

1. All fixture functions MUST accept `db: KyselySchema` as first parameter
2. Deterministic defaults MUST use fixed seeds (not `Date.now()`)
3. All types MUST match production domain shapes from `packages/shared`
4. NOT YET MIGRATED functions MUST throw `NotImplementedError` with descriptive message

---

## Review Checklist

When modifying this package:

- [ ] Supplier fixtures are deterministic and tenant-scoped
- [ ] All fixture functions accept injected `db` (no global state)
- [ ] No `Date.now()` or `Math.random()` in business-identifying defaults
- [ ] Kysely query builder used (not raw SQL)
- [ ] Company/outlet scoping on all queries
- [ ] Fixture types match production domain shapes

---

## Related Packages

- `@jurnapod/db` — Database connectivity and KyselySchema
- `@jurnapod/shared` — Shared schemas and types
- `@jurnapod/modules-accounting` — Accounting domain fixtures
- `@jurnapod/modules-platform` — Platform domain fixtures
- `@jurnapod/modules-treasury` — Treasury domain fixtures

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

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

For project-wide conventions, see root `AGENTS.md`.
