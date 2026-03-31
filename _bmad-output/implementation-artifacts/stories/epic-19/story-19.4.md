# Story 19.4: Migrate api/lib Business to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/business` modules (stock, inventory, pricing, recipe) to use pure Kysely API,
so that business logic modules are properly migrated.

## Context

Business modules handle core operations. Migrate after items modules.

## Acceptance Criteria

1. **Migrate stock.ts** (AC-1)
2. **Migrate inventory/*.ts** (AC-2)
3. **Migrate pricing/*.ts** (AC-3)
4. **Migrate recipe-composition.ts** (AC-4)
5. **Migrate recipe-ingredients.ts** (AC-5)
6. **Typecheck passes** (AC-6)

## Tasks

- [ ] Task 1: Migrate stock.ts
- [ ] Task 2: Migrate inventory/*.ts
- [ ] Task 3: Migrate pricing/*.ts
- [ ] Task 4: Migrate recipe files
- [ ] Task 5: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/stock.ts` | mysql2 → Kysely |
| `apps/api/src/lib/inventory/*.ts` | mysql2 → Kysely |
| `apps/api/src/lib/pricing/*.ts` | mysql2 → Kysely |
| `apps/api/src/lib/recipe-composition.ts` | mysql2 → Kysely |
| `apps/api/src/lib/recipe-ingredients.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.3 (items) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] All files migrated to pure Kysely
- [ ] Typecheck passes

## References

- [API AGENTS.md]
- [Epic 19: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
