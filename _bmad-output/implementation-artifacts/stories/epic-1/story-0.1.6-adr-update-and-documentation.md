# Story 0.1.6: ADR Update and Documentation

Status: done

## Story

As a **Jurnapod developer**,
I want **Kysely ORM adoption documented in ADR and development guides**,
So that **the team has clear guidance on when and how to use Kysely vs raw SQL**.

## Acceptance Criteria

1. **AC1: Kysely ADR Created**
   - Given the Kysely adoption decision
   - When ADR-0009 is created
   - Then it documents the rationale, architecture, and usage patterns

2. **AC2: ADR-0007 Updated**
   - Given the existing ADR-0007 (MySQL2 Raw SQL)
   - When the ADR is updated
   - Then it references ADR-0009 for new code guidance
   - And clarifies that raw SQL remains valid for financial-critical queries

3. **AC3: Sprint Status Updated**
   - Given all stories are complete
   - When sprint-status.yaml is updated
   - Then Epic 0 is marked as done

## Tasks / Subtasks

- [x] **Task 1: Create ADR-0009 (AC: #1)**
  - [x] 1.1 Document Kysely rationale (type-safety, explicit SQL, N+1 control)
  - [x] 1.2 Document architecture (DbConn class, pool reuse)
  - [x] 1.3 Document migration patterns (incremental, route-by-route)
  - [x] 1.4 Document count/delete patterns
  - [x] 1.5 Add references to implementation files

- [x] **Task 2: Update ADR-0007 (AC: #2)**
  - [x] 2.1 Add note about Kysely as preferred approach for new code
  - [x] 2.2 Reference ADR-0009 in consequences and references
  - [x] 2.3 Clarify raw SQL still valid for financial-critical queries

- [x] **Task 3: Update Sprint Status (AC: #3)**
  - [x] 3.1 Mark story 0.1.6 as done
  - [x] 3.2 Mark epic-0 as done

## Dev Notes

### Architecture Context

**Kysely ADR Structure:**
```
docs/adr/ADR-0009-kysely-type-safe-query-builder.md
├── Context (why Kysely, evaluated alternatives)
├── Decision (architecture, DbConn, pool reuse)
├── Alternatives Considered (Prisma, Drizzle - why rejected)
├── Consequences (positive, negative/trade-offs)
└── References (implementation files, docs)
```

**Key Points to Document:**
1. Kysely selected over Prisma/Drizzle for explicit SQL control
2. DbConn class as unified interface wrapping Kysely
3. Pool singleton reuse (`createDbPool()`)
4. Incremental migration strategy (route-by-route)
5. N+1 prevention via explicit JOINs (same as raw SQL)
6. Count pattern: `select((eb) => [eb.fn.count('id').as('count')])`
7. Delete result: `result.numDeletedRows` (bigint)

### References

- [Source: packages/db/src/mysql-client.ts] - DbConn class
- [Source: packages/db/src/pool.ts] - Pool factory functions
- [Source: packages/db/src/connection-kysely.ts] - newKyselyConnection helper
- [Source: packages/db/src/kysely/schema.ts] - Generated types (96 tables)
- [Source: ADR-0007-mysql2-pool-singleton-raw-sql.md] - Raw SQL approach
- [External: https://kysely.dev/] - Kysely documentation

## Dev Agent Record

### Agent Model Used

kimi-k2.5

### Completion Notes List

**Story 0.1.6: ADR Update and Documentation - COMPLETED**

**AC Evidence:**
- AC1 (Kysely ADR Created): ✅ ADR-0009 created with full documentation
- AC2 (ADR-0007 Updated): ✅ ADR-0007 updated to reference Kysely ADR
- AC3 (Sprint Status Updated): ✅ epic-0 marked as done

**Files Created/Modified:**
- `docs/adr/ADR-0009-kysely-type-safe-query-builder.md` - Kysely ADR
- `docs/adr/ADR-0007-mysql2-pool-singleton-raw-sql.md` - Updated references

**Validation Results:**
```
git status ✅ (clean working tree after commit)
```

**Note:** ADR-0009 documents:
- Kysely rationale and evaluation
- Architecture (DbConn, pool reuse)
- Migration patterns
- Count/delete patterns
- N+1 prevention strategy
