# Story 14.5: Epic 14 Documentation

**Epic:** Epic 14  
**Story Number:** 14.5  
**Status:** backlog  
**Estimated Time:** 1 hour  
**Priority:** P2

---

## Summary

Update documentation to reflect Epic 14 migration work.

## Tasks

### 1. Update ADR-0011 (Kysely Migration Guide)

Add new patterns from batch-operations migration:

```markdown
## Batch Operations Pattern

For batch UPDATE/INSERT in MySQL:

```typescript
// UPDATE loop (Kysely)
for (const item of updates) {
  await kysely
    .updateTable('items')
    .set({ sku: item.sku, name: item.name })
    .where('id', '=', item.id)
    .execute();
}

// INSERT loop (Kysely)
for (const item of inserts) {
  await kysely
    .insertInto('items')
    .values({ company_id: companyId, sku: item.sku })
    .execute();
}
```

Note: Kysely's batch operations are PostgreSQL-optimized. For MySQL, loop-based approach with individual statements is acceptable.
```

### 2. Verify Test Coverage

- Run full test suite for affected modules
- Ensure all migration tests pass

### 3. Update TECHNICAL-DEBT.md (if needed)

- Check if any new technical debt was introduced
- Document any issues found during migration

## Acceptance Criteria

- [ ] ADR-0011 updated with batch operations patterns
- [ ] Bitwise permission pattern documented
- [ ] All migration tests pass
- [ ] No new technical debt identified

## Files Modified

- `docs/adr/ADR-0011-kysely-migration-guide.md`

---

*Story file created: 2026-03-28*
