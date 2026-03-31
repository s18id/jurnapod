# Story 19.5: Migrate api/lib Accounting to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/accounting` modules to use pure Kysely API,
so that accounting modules are properly migrated.

## Context

Accounting modules handle financial operations. Migrate after business modules.

## Acceptance Criteria

1. **Migrate accounts.ts** (AC-1)
2. **Migrate account-types.ts** (AC-2)
3. **Migrate journals.ts** (AC-3)
4. **Migrate cash-bank.ts** (AC-4)
5. **Migrate accounting-import.ts** (AC-5)
6. **Typecheck passes** (AC-6)

## Tasks

- [ ] Task 1: Migrate accounts.ts
- [ ] Task 2: Migrate account-types.ts
- [ ] Task 3: Migrate journals.ts
- [ ] Task 4: Migrate cash-bank.ts
- [ ] Task 5: Migrate accounting-import.ts
- [ ] Task 6: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/accounts.ts` | mysql2 → Kysely |
| `apps/api/src/lib/account-types.ts` | mysql2 → Kysely |
| `apps/api/src/lib/journals.ts` | mysql2 → Kysely |
| `apps/api/src/lib/cash-bank.ts` | mysql2 → Kysely |
| `apps/api/src/lib/accounting-import.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.4 (business) should be complete first

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
