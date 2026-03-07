# AGENTS.md

## Scope
Database schema, migrations, indexes, constraints, and persistence-safety rules.

## Review guidelines

### Priority
- Be strict on migration safety, financial integrity, uniqueness guarantees, foreign keys, and production viability.
- Treat schema changes that can silently corrupt accounting or sync invariants as P1.

### Money and types
- Do not use `FLOAT` or `DOUBLE` for monetary values.
- Prefer fixed-precision decimal types for money.
- Review type changes carefully for rounding, truncation, and compatibility risk.

### Critical constraints
- Preserve uniqueness guarantees such as `pos_transactions.client_tx_id`.
- Review invoice, receipt, and journal reference uniqueness carefully.
- Flag schema changes that weaken auditability, traceability, or tenant isolation.

### Transactional safety
- Verify schema and migration changes still support atomic posting flows and safe rollback behavior.
- Flag destructive changes that can break existing posting or sync flows without a clear migration path.

### Indexes and query safety
- Review indexes needed for journal and reporting access patterns.
- Flag missing indexes on tenant-scoped, outlet-scoped, or date-heavy accounting queries when a change obviously increases risk.

### Migration review
- Prefer additive and backward-safe migrations where possible.
- Flag irreversible or destructive migrations unless they are clearly intentional and operationally planned.
- Watch for backfill logic that can create inconsistent historical state.

### Testing expectations
- Expect migration or smoke coverage when changing:
  - financial tables
  - sync tables
  - tenant scoping columns
  - unique indexes
  - foreign-key relationships