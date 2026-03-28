# Story 12.6: Refactor `export.ts` Route

**Status:** backlog  
**Epic:** Epic 12: Standardize Library Usage for All Routes  
**Story ID:** 12-6-refactor-export-route  
**Estimated Effort:** 4 hours  
**Depends on:** Story 12.5

---

## Context

Refactor the export route (570 lines) to use the extended library functions. The route is complex with multiple export formats and dynamic query generation.

---

## Acceptance Criteria

### AC1: Import Library Functions

Add imports for new library functions:

```typescript
import {
  buildExportQuery,
  executeExportQuery,
  exportEntityStream
} from "../lib/export/index.js";
```

### AC2: Replace Inline Query Building

**Before:**
```typescript
// Dynamic SQL generation inline
let sql = `SELECT i.id, i.code, i.name...`;
const values = [company_id];

if (filters.item_group_id) {
  sql += ' AND i.item_group_id = ?';
  values.push(filters.item_group_id);
}
// ... more conditions

const [rows] = await pool.execute(sql, values);
```

**After:**
```typescript
const { sql, values } = buildExportQuery(
  entityType,
  filters,
  { columns, format }
);

const rows = await executeExportQuery(sql, values);
```

### AC3: Maintain All Export Formats

All formats must continue to work:
- CSV export
- Excel (XLSX) export
- JSON export
- Streaming for large datasets

### AC4: Maintain Column Customization

User can still specify columns:
```typescript
// URL: /api/export/items?columns=id,code,name,price
const columns = c.req.query("columns")?.split(",");

const { sql, values } = buildExportQuery(
  'items',
  filters,
  { columns }  // specific columns
);
```

### AC5: Maintain Filter Support

All filters must work:
- `company_id` (required)
- `outlet_id` (optional)
- `date_from` / `date_to` (date range)
- `search` (text search)
- `is_active` (boolean filter)
- `item_group_id` (entity-specific)

### AC6: Maintain Streaming for Large Exports

Large exports use streaming:
```typescript
if (format === 'csv' && shouldStream(rows)) {
  await exportEntityStream(entityType, filters, responseStream);
} else {
  const rows = await executeExportQuery(sql, values);
  // ... format and return
}
```

### AC7: Error Handling

Maintain existing error handling:
- Invalid entity type → 400
- Missing company_id → 400
- Database errors → 500
- Export format errors → 400

### AC8: Zero Direct SQL

Verify no SQL in route:
- [ ] No `pool.execute()` calls
- [ ] No inline SQL string building
- [ ] No `getDbPool()` (unless for other purposes)
- [ ] All queries go through library

---

## Files to Modify

1. `apps/api/src/routes/export.ts`

---

## Verification Steps

1. **Type Check:** `npm run typecheck -w @jurnapod/api`
2. **Lint:** `npm run lint -w @jurnapod/api`
3. **Test Export Formats:**
   ```bash
   # CSV export
   curl "/api/export/items?company_id=1&format=csv"
   
   # JSON export with columns
   curl "/api/export/items?company_id=1&format=json&columns=id,code,name"
   
   # With filters
   curl "/api/export/items?company_id=1&search=product&is_active=true"
   ```
4. **Large Export:** Test streaming with large dataset

---

## Definition of Done

- [ ] Route uses library for query building
- [ ] Route uses library for query execution
- [ ] All export formats work (CSV, XLSX, JSON)
- [ ] Column customization works
- [ ] All filters work
- [ ] Streaming for large datasets works
- [ ] No direct SQL in route file
- [ ] All existing tests pass
- [ ] TypeScript compilation passes
- [ ] Manual testing confirms functionality

---

## Dependencies

- Story 12.5 complete (library extended)
- `lib/export/query-builder.ts` exists
- `lib/export/index.ts` exports new functions

---

*Ready for implementation after Story 12.5.*
