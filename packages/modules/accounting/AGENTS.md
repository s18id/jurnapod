# AGENTS.md

## Scope
Accounting module rules for chart of accounts, journal generation, posting integrity, imports, and financial reporting.

## Review guidelines

### Priority
- Treat unbalanced journals, incorrect account mapping, posting bypasses, or broken transactional integrity as P1.
- This package should optimize for financial correctness and auditability first.

### Journal integrity
- Flag any path that can create unbalanced entries.
- Flag any path where `journal_batches` and `journal_lines` can become inconsistent, detached, or partially written.
- Verify posting logic is deterministic and reproducible from source documents.

### Source-of-truth rules
- Journals are the source for GL, trial balance, P&L, and balance sheet style reporting.
- Flag code that introduces parallel financial truth outside the journal model without a very clear reason and reconciliation strategy.

### Mapping and posting logic
- Review account mapping carefully, especially for sales revenue, tax, AR, cash/bank, discounts, refunds, and voids.
- Flag hidden assumptions that can misclassify entries across outlets or companies.
- Verify date, reference, and source-document linkage stays auditable.

### Imports
- Review ODS/Excel import logic for traceability, idempotency, and mapping correctness.
- Flag missing hash/idempotency protections or weak validation around imported COA and journal data.

### Money math
- Flag use of floating-point math for money.
- Review rounding behavior carefully, especially where tax or split lines are involved.

### Testing expectations
- Expect tests when changing:
  - posting mappers
  - journal balancing
  - report calculations
  - import mapping
  - account classification logic

### DB Testing Policy

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

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
- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks don't reveal transaction isolation issues
- Integration with real DB catches performance problems early

**What to mock instead:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic (pure computation) may use unit tests without database.**