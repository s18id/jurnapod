## Coordination: Epic 20 closeout

Date: 2026-04-01
Owner: primary BMAD build agent

### Goal
Move Epic 20 to DONE by resolving remaining legacy-table and verification gaps.

### Known open gaps
1. Story 20.9 incomplete: `user_outlets` and `sync_operations` not fully retired.
2. Remaining references exist in tests/code for legacy tables.
3. Sprint/story statuses still backlog/review.

### Constraints
- Keep tenant isolation and auditability.
- Prefer pure Kysely query builder in TypeScript.
- Migration SQL must be idempotent and MySQL/MariaDB compatible.

### Planned implementation batches
1. Legacy table retirement batch:
   - Add migration to archive+drop legacy tables as needed.
   - Remove runtime dependencies on dropped tables (`sync_operations`).
   - Remove/replace `user_outlets` joins in tests to modern role assignment model.
   - Update Kysely schema typing to remove dropped tables.
2. Validation batch:
   - Run scoped tests for touched areas.
   - Run Epic 20 final verification commands.
3. Artifact closeout batch:
   - Update story statuses and sprint-status to DONE with evidence.
