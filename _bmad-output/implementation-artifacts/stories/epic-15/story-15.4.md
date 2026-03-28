# Story 15.4: Epic 15 Documentation + Epic 16 Planning

**Epic:** Epic 15
**Story Number:** 15.4
**Status:** backlog
**Estimated Time:** 1 hour
**Priority:** P2

---

## Summary

Update documentation with Epic 15 patterns and plan Epic 16.

## Tasks

### 1. Update ADR-0011 (Kysely Migration Guide)

Add connection guard pattern:

```markdown
## Connection Guard Pattern (Epic 15)

Use `withKysely()` wrapper to prevent connection leaks:

```typescript
import { withKysely } from "@/lib/db";

export async function myQuery(companyId: number) {
  return withKysely(async (db) => {
    return db
      .selectFrom("items")
      .where("company_id", "=", companyId)
      .execute();
  });
}
```

The wrapper automatically handles connection acquisition and release.
```

### 2. Update TECHNICAL-DEBT.md

- Mark TD-030 as resolved
- Review for any new TD items

### 3. Plan Epic 16

Based on remaining TD items:
- TD-031: Alert retry logic (P2)
- TD-032: Batch processing backfills (P2)

Create initial Epic 16 scope draft.

### 4. Update project-context.md

Add any new patterns from Epic 15.

## Acceptance Criteria

- [ ] ADR-0011 updated with connection guard pattern
- [ ] TECHNICAL-DEBT.md updated (TD-030 resolved)
- [ ] Epic 16 initial scope drafted
- [ ] project-context.md updated if needed

## Files to Modify

- `docs/adr/ADR-0011-kysely-migration-guide.md`
- `docs/adr/TECHNICAL-DEBT.md`
- `_bmad-output/planning-artifacts/epics.md`

---

*Story file created: 2026-03-28*
