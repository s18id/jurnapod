# Story 0.1.2: DbClient Integration

Status: done

## Story

As a **Jurnapod developer**,
I want **Kysely integrated with the existing DbClient interface pattern**,
So that **services can use either raw SQL or Kysely queries with full transaction support**.

## Acceptance Criteria

1. **AC1: Interface Extension**
   - Given the existing `AccountsDbClient`, `JournalsDbClient`, and `AuditDbClient` interfaces
   - When Kysely is integrated
   - Then interfaces include a `kysely: Kysely<DB>` property
   - And raw SQL methods (`query`, `execute`) are preserved

2. **AC2: MySQL Adapter Implementation**
   - Given the existing MySQL adapter classes
   - When Kysely support is added
   - Then adapters provide a `kysely` getter property
   - And connection management is preserved

3. **AC3: Transaction Support**
   - Given the existing transaction pattern (`begin`, `commit`, `rollback`)
   - When Kysely is integrated
   - Then Kysely transactions work alongside raw SQL transactions
   - And both can be used in the same transaction block

4. **AC4: Raw SQL Fallback**
   - Given complex queries that need raw SQL
   - When a service needs to use raw SQL
   - Then the `query` and `execute` methods remain available
   - And no breaking changes to existing code

5. **AC5: Type Safety Validation**
   - Given the DbClient interface with Kysely
   - When `npm run typecheck -w @jurnapod/api` is run
   - Then type checking passes with zero errors

## Tasks / Subtasks

- [ ] **Task 1: Add kysely to AccountsDbClient interface (AC: #1)**
  - [ ] 1.1 Import Kysely and DB types in accounts-service.ts
  - [ ] 1.2 Add kysely property to AccountsDbClient interface
  - [ ] 1.3 Verify type checking passes

- [ ] **Task 2: Add kysely to JournalsDbClient interface (AC: #1)**
  - [ ] 2.1 Import Kysely and DB types in journals-service.ts
  - [ ] 2.2 Add kysely property to JournalsDbClient interface
  - [ ] 2.3 Verify type checking passes

- [ ] **Task 3: Add kysely to AuditDbClient interface (AC: #1)**
  - [ ] 3.1 Import Kysely and DB types in audit-service.ts
  - [ ] 3.2 Add kysely property to AuditDbClient interface
  - [ ] 3.3 Verify type checking passes

- [ ] **Task 4: Implement kysely getter in MySQLAccountsDbClient (AC: #2, #3)**
  - [ ] 4.1 Import createKysely from @jurnapod/db/kysely
  - [ ] 4.2 Add lazy kysely instance field
  - [ ] 4.3 Implement kysely getter with transaction support
  - [ ] 4.4 Verify type checking passes

- [ ] **Task 5: Implement kysely getter in MySQLJournalsDbClient (AC: #2, #3)**
  - [ ] 5.1 Import createKysely from @jurnapod/db/kysely
  - [ ] 5.2 Add lazy kysely instance field
  - [ ] 5.3 Implement kysely getter with transaction support
  - [ ] 5.4 Verify type checking passes

- [ ] **Task 6: Implement kysely getter in MySQLAuditDbClient (AC: #2, #3)**
  - [ ] 6.1 Import createKysely from @jurnapod/db/kysely
  - [ ] 6.2 Add lazy kysely instance field
  - [ ] 6.3 Implement kysely getter with transaction support
  - [ ] 6.4 Verify type checking passes

- [ ] **Task 7: Implement kysely getter in MySQLAccountTypesDbClient (AC: #2, #3)**
  - [ ] 7.1 Import createKysely from @jurnapod/db/kysely
  - [ ] 7.2 Add lazy kysely instance field
  - [ ] 7.3 Implement kysely getter with transaction support
  - [ ] 7.4 Verify type checking passes

- [ ] **Task 8: Validate Type Checking (AC: #5)**
  - [ ] 8.1 Run npm run typecheck -w @jurnapod/api
  - [ ] 8.2 Fix any type errors
  - [ ] 8.3 Verify zero errors

- [ ] **Task 9: Run Unit Tests (AC: #4)**
  - [ ] 9.1 Run npm run test:unit -w @jurnapod/api
  - [ ] 9.2 Verify all tests pass
  - [ ] 9.3 No breaking changes

## Dev Notes

### Architecture Context

**Current State:**
- Raw SQL via `mysql2/promise` with connection pooling
- Custom `DbClient` interface pattern for dependency injection
- `AccountsDbClient`, `JournalsDbClient`, `AuditDbClient` interfaces in modules packages
- MySQL adapter classes in `apps/api/src/lib/`

**Integration Pattern:**
```typescript
// Interface in modules package
export interface AccountsDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;
  begin?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
  
  // NEW: Type-safe query builder
  readonly kysely: Kysely<DB>;
}

// MySQL adapter implementation
class MySQLAccountsDbClient implements AccountsDbClient {
  private connection: PoolConnection | null = null;
  private _kysely: Kysely<DB> | null = null;
  
  get kysely(): Kysely<DB> {
    if (!this._kysely) {
      this._kysely = createKysely(this.pool);
    }
    // Use transaction connection if in transaction mode
    return this.connection 
      ? this._kysely.withConnection(this.connection)
      : this._kysely;
  }
}
```

### Kysely Transaction Support

When a transaction is in progress (`begin()` called), the `kysely` getter returns a Kysely instance bound to the transaction connection via `withConnection()`. This allows Kysely queries to participate in the same transaction as raw SQL queries.

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/src/accounts-service.ts` | Modify | Add kysely property to AccountsDbClient |
| `packages/modules/accounting/src/journals-service.ts` | Modify | Add kysely property to JournalsDbClient |
| `packages/modules/accounting/src/account-types-service.ts` | Modify | Add kysely property to AccountTypesDbClient |
| `packages/modules/platform/src/audit-service.ts` | Modify | Add kysely property to AuditDbClient |
| `apps/api/src/lib/accounts.ts` | Modify | Implement kysely getter in MySQLAccountsDbClient |
| `apps/api/src/lib/journals.ts` | Modify | Implement kysely getter in MySQLJournalsDbClient |
| `apps/api/src/lib/account-types.ts` | Modify | Implement kysely getter in MySQLAccountTypesDbClient |
| `apps/api/src/lib/audit.ts` | Modify | Implement kysely getter in MySQLAuditDbClient |

### References

- [Source: packages/modules/accounting/src/accounts-service.ts] - AccountsDbClient interface
- [Source: packages/modules/accounting/src/journals-service.ts] - JournalsDbClient interface
- [Source: packages/modules/platform/src/audit-service.ts] - AuditDbClient interface
- [Source: apps/api/src/lib/accounts.ts] - MySQLAccountsDbClient implementation
- [Source: apps/api/src/lib/journals.ts] - MySQLJournalsDbClient implementation
- [Source: apps/api/src/lib/audit.ts] - MySQLAuditDbClient implementation
- [Source: packages/db/kysely/index.ts] - createKysely factory function
- [Source: packages/db/kysely/schema.ts] - DB type definitions
- [External: https://kysely.dev/docs/API/interfaces/Kysely.html] - Kysely API

## Dev Agent Record

### Agent Model Used

kimi-k2.5

### Debug Log References

N/A

### Completion Notes List

(To be filled during implementation)

### File List

**Files Modified:**
- `packages/modules/accounting/src/accounts-service.ts`
- `packages/modules/accounting/src/journals-service.ts`
- `packages/modules/accounting/src/account-types-service.ts`
- `packages/modules/platform/src/audit-service.ts`
- `apps/api/src/lib/accounts.ts`
- `apps/api/src/lib/journals.ts`
- `apps/api/src/lib/account-types.ts`
- `apps/api/src/lib/audit.ts`

**Estimated Effort:** 1 day

**Risk Level:** Low (additive changes only)

**Dependencies:** Story 0.1.1

**FRs Covered:** FR2, FR4, FR5
