# Story 18.2: Verify @jurnapod/auth Kysely Pattern

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - Packages

---

## Story

As a developer,
I want to verify `@jurnapod/auth` is using pure Kysely correctly,
so that it can serve as a reference implementation for other packages.

## Context

`@jurnapod/auth` was migrated to Kysely in a previous epic. This story verifies the pattern is correct and documents it for other packages to follow.

## Acceptance Criteria

1. **Verify auth uses pure Kysely** (AC-1)
   - No `mysql2` imports for database access
   - Uses `Kysely<DB>` directly

2. **Document the adapter pattern** (AC-2)
   - `AuthDbAdapter` interface uses `Kysely<DB>`
   - `KyselyAdapter` wraps Kysely

3. **Verify typecheck passes** (AC-3)
   - `npm run typecheck -w @jurnapod/auth`
   - `npm run build -w @jurnapod/auth`

## Tasks

- [ ] Task 1: Read auth package Kysely usage
- [ ] Task 2: Verify no mysql2 patterns
- [ ] Task 3: Document reference pattern

## Files to Verify

| File | Purpose |
|------|---------|
| `packages/auth/src/types.ts` | AuthDbAdapter interface |
| `packages/auth/src/lib/kysely-adapter.ts` | Kysely wrapper |
| `packages/auth/src/lib/db-types.ts` | DB type re-export |

## Dev Notes

### Auth Pattern (Reference)
```typescript
// types.ts - defines interface
export interface AuthDbAdapter {
  db: Kysely<DB>;
  transaction<T>(fn: (trx: AuthDbAdapter) => Promise<T>): Promise<T>;
}

// kysely-adapter.ts - wraps Kysely
export class KyselyAdapter implements AuthDbAdapter {
  db: Kysely<DB>;
  
  async queryAll<T>(sqlStr: string, params: unknown[]): Promise<T[]> {
    // wraps Kysely for raw SQL if needed
  }
  
  async execute(sqlStr: string, params: unknown[]): Promise<{...}> {
    // wraps Kysely for mutations
  }
}
```

## Definition of Done

- [ ] Auth package uses pure Kysely pattern
- [ ] Typecheck passes
- [ ] Build passes
- [ ] Pattern documented for other packages

## References

- [Auth package: `packages/auth/src/`]
- [Epic 18: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
