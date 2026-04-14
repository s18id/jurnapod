# Story 13.6: Analyze sync/pull.ts Architecture

**Status:** done  
**Epic:** Epic 13: Complete Library Migration for Deferred Routes  
**Story ID:** 13-6-analyze-sync-pull-architecture  
**Estimated Effort:** 4 hours

---

## Context

The `sync/pull.ts` route has a complex custom database adapter pattern that needs architectural review before refactoring.

---

## Current Architecture

**File:** `apps/api/src/routes/sync/pull.ts`

### Custom DB Adapter Pattern

```typescript
// Creates a custom audit service with DB wrapper
function createSyncAuditService(dbPool: ReturnType<typeof getDbPool>): SyncAuditService {
  return {
    // Custom query method
    query: async (sql: string, params?: unknown[]) => {
      const [rows] = await dbPool.query(sql, params);
      return rows as Record<string, unknown>[];
    },
    // Custom execute method
    execute: async (sql: string, params?: unknown[]) => {
      const [result] = await dbPool.execute(sql, params);
      return result;
    },
    // Transaction support
    withTransaction: async (callback) => {
      const conn = await dbPool.getConnection();
      await conn.beginTransaction();
      try {
        const result = await callback({
          execute: async (sql, params) => {
            const [result] = await conn.execute(sql, params);
            return result;
          }
        });
        await conn.commit();
        return result;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
  };
}
```

---

## Analysis Tasks

### AC1: Document Current Pattern

Create analysis document covering:
1. Why custom adapter exists (sync requirements)
2. How it's used by sync-core
3. SQL operations performed
4. Transaction boundaries

### AC2: Identify Refactoring Options

**Option A: Keep Adapter in Route**
- Pro: Minimal changes
- Con: Still has SQL in route

**Option B: Extract to Library**
- Pro: Route becomes thin
- Con: Complex adapter interface

**Option C: Migrate to Kysely**
- Pro: Modern ORM
- Con: More complex migration

### AC3: Recommendation

Provide recommendation with rationale:
- Which option to pursue
- Implementation approach
- Risk assessment

### AC4: Create Implementation Story

Based on analysis, create detailed story for 13.7.

---

## Output

Create analysis document:
`_bmad-output/implementation-artifacts/stories/epic-13/sync-pull-analysis.md`

Sections:
1. Current State
2. Requirements Analysis
3. Options Evaluation
4. Recommendation
5. Implementation Story Draft

---

## Definition of Done

- [ ] Architecture analysis complete
- [ ] Options documented with pros/cons
- [ ] Recommendation provided
- [ ] Implementation story created
- [ ] Reviewed and approved

---

## Completion Notes

**Completed by:** bmad-agent-architect (delegated agent)
**Completion Date:** 2026-03-28
**Actual Effort:** ~3 hours

### Deliverable Created

1. `sync-pull-analysis.md` (445 lines)
   - Comprehensive architecture analysis
   - Options evaluation (A, B, C, D)
   - Recommendation: Option B (Extract to lib/sync/audit-adapter.ts)

### Key Findings

**Code Duplication Discovered:**
- `routes/sync/pull.ts` (lines 53-84): 32-line adapter
- `lib/sync/pull/index.ts` (lines 105-138): 40-line adapter (with `any` type)

**Issues Identified:**
1. Same logic in two places
2. Library version uses `any` type for `DbPool`
3. Library version uses `require()` instead of ESM import

**Options Evaluated:**

| Option | Description | Verdict |
|--------|-------------|---------|
| A | Keep in route | ❌ Not recommended |
| B | Extract to lib/sync/audit-adapter.ts | ✅ **RECOMMENDED** |
| C | Generic adapter in lib/db/adapter.ts | ❌ Over-engineered |
| D | Use existing DbConn/Kysely | ❌ Out of scope |

### Recommendation

**Adopt Option B**: Extract adapter to `lib/sync/audit-adapter.ts`

**Rationale:**
- Eliminates duplication
- Clear separation of concerns
- Reusable across sync routes
- Easy to test
- Follows Library Usage Rule

### Unblocks

This analysis unblocks **Story 13.7** for implementation.

### Acceptance Criteria

- [x] Architecture analysis complete
- [x] Options documented with pros/cons
- [x] Clear recommendation provided
- [x] Implementation approach defined
- [x] Story 13.7 unblocked

*Analysis completed successfully.*
