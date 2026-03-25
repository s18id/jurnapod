<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0007: MySQL2 Pool Singleton with Raw Parameterized SQL

**Status:** Accepted
**Date:** 2026-03-25
**Deciders:** Ahmad Faruk (Signal18 ID)

---

## Context

The API needs to query a MySQL/MariaDB database across all route modules. The key requirements for Jurnapod's financial domain are:

- **Correctness**: Money values, journal entries, and audit records must not be altered by ORM type coercions.
- **Auditability**: SQL must be readable — critical financial queries (GL posting, reconciliation) need to be reviewable without ORM abstraction.
- **Dual compatibility**: All queries must run on both MySQL 8.0.44+ and MariaDB without dialect branching.
- **Idempotency**: POS sync uses `INSERT ... ON DUPLICATE KEY` and conditional `UPDATE` patterns — ORM-friendly patterns for upserts vary across libraries.

---

## Decision

Database access uses **mysql2/promise** directly, via a single connection pool managed as a global singleton.

### Pool singleton

```typescript
// lib/db.ts
const globalForDb = globalThis as typeof globalThis & {
  __jurnapodApiDbPool?: Pool;
};

export function getDbPool(): Pool {
  if (globalForDb.__jurnapodApiDbPool) {
    return globalForDb.__jurnapodApiDbPool;
  }
  const env = getAppEnv();
  const pool = mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    charset: normalizeDbCharset(env.db.collation),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true   // ← dates returned as "YYYY-MM-DD" strings, not Date objects
  });
  globalForDb.__jurnapodApiDbPool = pool;
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (globalForDb.__jurnapodApiDbPool) {
    await globalForDb.__jurnapodApiDbPool.end();
    globalForDb.__jurnapodApiDbPool = undefined;
  }
}
```

The singleton is stored on `globalThis` so it survives module re-evaluation in test environments. Tests **must** call `closeDbPool()` in `test.after()` — without it, the process hangs waiting for open connections.

### Query pattern

All queries use `pool.execute()` (prepared statements) with positional `?` placeholders:

```typescript
const pool = getDbPool();
const [rows] = await pool.execute<MyRow[]>(
  `SELECT id, company_id, amount, posted_at
   FROM journal_lines
   WHERE company_id = ? AND account_id = ? AND posted_at >= ?
   ORDER BY posted_at DESC`,
  [companyId, accountId, dateFrom]
);
```

Row types use TypeScript intersections with mysql2's `RowDataPacket`:

```typescript
type JournalLineRow = RowDataPacket & {
  id: number;
  company_id: number;
  amount: string;   // DECIMAL returned as string — never parsed to float
  posted_at: string; // date string (dateStrings: true)
};
```

### Money values

`DECIMAL` columns are returned as strings by mysql2 when using `dateStrings: true` (or when the mysql2 typeCast is default). Money values are kept as strings through the API response layer — they are never coerced to JavaScript `number` (IEEE 754). Arithmetic is done at the DB layer (SQL `+`, `-`, `*`) or deferred to the reporting layer.

### Transactions

Multi-statement operations (e.g., posting a journal batch with multiple lines) use explicit transactions acquired from the pool:

```typescript
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await conn.execute("INSERT INTO journal_batches ...", [...]);
  await conn.execute("INSERT INTO journal_lines ...", [...]);
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
```

---

## Note: Kysely Preferred for New Code

**For new route development, prefer Kysely (see [ADR-0009](./ADR-0009-kysely-type-safe-query-builder.md))** over raw SQL. Kysely provides:
- Compile-time type safety for column/table names
- Explicit SQL generation (no ORM magic)
- Reduced CRUD boilerplate
- Same mysql2 pool singleton reuse

**Raw SQL remains valid and preferred for:**
- Complex financial queries (GL aggregations, reconciliation joins)
- Custom upsert patterns (`INSERT ... ON DUPLICATE KEY`)
- Performance-critical queries requiring specific index hints
- Any query where explicit SQL readability is critical

---

## Alternatives Considered

### Prisma ORM

Evaluated for type safety and migration tooling. Rejected for three reasons:
1. Prisma's MariaDB support has compatibility gaps with MySQL 8.0.44+ features used in migrations (information_schema guards, conditional DDL).
2. Prisma coerces `DECIMAL` to JavaScript `number` by default — unacceptable for financial data without custom configuration.
3. Complex financial queries (GL aggregations, reconciliation joins) are easier to write, review, and index-tune in raw SQL.

### Drizzle ORM

Evaluated. Better type inference than Prisma and supports raw SQL escape hatches. Rejected because:
- The benefit (TypeScript inference for table shapes) is partially achieved already via typed `RowDataPacket` intersections.
- Introducing a build-time ORM adds a dependency on Drizzle's schema definition layer, which would need to stay in sync with the migration files in `packages/db`.

### Per-request connections (no pool)

Rejected. Creating a new connection per request has significant latency overhead (~20–50ms per connection handshake) and limits throughput. A pool with `connectionLimit: 10` saturates typical single-node traffic without holding connections idle indefinitely.

---

## Consequences

### Positive

- Full control over SQL: financial queries (GL posting, reconciliation, audit joins) are exactly what is committed to the database — no ORM-generated query surprises.
- `DECIMAL` values are handled as strings end-to-end — no silent float precision loss.
- `dateStrings: true` prevents timezone coercion via JavaScript `Date` object — dates arrive as `"YYYY-MM-DD"` strings and are handled by the `date-helpers` package (see Epic 16).
- Pool is shared across all modules — no per-module connection overhead.

### Negative / Trade-offs

- **Tests must call `closeDbPool()`** in `test.after()`. Forgetting this causes tests to hang indefinitely. This is a recurring footgun — documented in AGENTS.md and enforced in code review.
- No query builder means column name typos in SQL strings are runtime errors, not compile-time errors. TypeScript types on `RowDataPacket` intersections mitigate this but don't catch SQL syntax errors.
- Manual transaction management (`getConnection()` / `beginTransaction()` / `rollback()` / `release()`) is verbose. A thin helper function wrapping this pattern would reduce boilerplate — tracked as future improvement.
- `connectionLimit: 10` is a static default. Under high concurrent load, requests queue (`waitForConnections: true`). This has not been a bottleneck in single-node deployment but would require tuning for multi-worker setups.

---

## References

- `apps/api/src/lib/db.ts` — pool singleton, `getDbPool()`, `closeDbPool()`
- `AGENTS.md § Test cleanup (CRITICAL)` — required `closeDbPool()` pattern
- `packages/db/` — migration files (MySQL/MariaDB compatible DDL)
- `ADR-0009-kysely-type-safe-query-builder.md` — Kysely ORM adoption (preferred for new code)
- Epic 7: Sync infrastructure (DB-integrated version manager, composite indexes)
- Epic 16: Unified time handling via date-helpers (`dateStrings: true` motivation)
- Epic 0: Kysely ORM Infrastructure (Stories 0.1.1–0.1.6)
