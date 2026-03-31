# Story 19.3: Migrate api/lib Items to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/items` modules to use pure Kysely API,
so that item-related modules are properly migrated.

## Context

Item modules are heavily used by inventory, pricing, and sync. Migrate after foundation modules.

## Acceptance Criteria

1. **Migrate items/index.ts** (AC-1)
2. **Migrate item-prices/index.ts** (AC-2)
3. **Migrate item-groups/index.ts** (AC-3)
4. **Migrate item-variants.ts** (AC-4)
5. **Migrate item-images.ts** (AC-5)
6. **Migrate item-barcodes.ts** (AC-6)
7. **Typecheck passes** (AC-7)

## Tasks

- [ ] Task 1: Migrate items/index.ts
- [ ] Task 2: Migrate item-prices/index.ts
- [ ] Task 3: Migrate item-groups/index.ts
- [ ] Task 4: Migrate item-variants.ts
- [ ] Task 5: Migrate item-images.ts
- [ ] Task 6: Migrate item-barcodes.ts
- [ ] Task 7: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/items/index.ts` | mysql2 → Kysely |
| `apps/api/src/lib/item-prices/index.ts` | mysql2 → Kysely |
| `apps/api/src/lib/item-groups/index.ts` | mysql2 → Kysely |
| `apps/api/src/lib/item-variants.ts` | mysql2 → Kysely |
| `apps/api/src/lib/item-images.ts` | mysql2 → Kysely |
| `apps/api/src/lib/item-barcodes.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.2 (foundation) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] All 6 files migrated to pure Kysely
- [ ] Typecheck passes

## References

- [API AGENTS.md]
- [Epic 19: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
