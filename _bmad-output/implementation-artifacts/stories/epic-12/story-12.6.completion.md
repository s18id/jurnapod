# Story 12.6: Refactor `export.ts` Route - COMPLETION NOTES

**Status:** DONE  
**Story ID:** 12-6-refactor-export-route  
**Epic:** Epic 12: Standardize Library Usage for All Routes  
**Completion Date:** Sat Mar 28 2026

---

## Summary

Successfully refactored `apps/api/src/routes/export.ts` to use the export library functions from Story 12.5, eliminating all inline SQL and direct database pool usage.

---

## Changes Made

### File Modified: `apps/api/src/routes/export.ts`

#### 1. Updated Imports (Lines 21-33)
**Before:**
```typescript
import { getDbPool } from "../lib/db.js";
import {
  generateCSVBuffer,
  generateExcel,
  // ... other generators
} from "../lib/export/index.js";
```

**After:**
```typescript
import {
  generateCSVBuffer,
  generateExcel,
  generateExcelChunked,
  generateCSVStream,
  createReadableStream,
  getContentType,
  getFileExtension,
  buildExportQuery,      // NEW
  executeExportQuery,    // NEW
  type ExportColumn,
  type ExportFormat
} from "../lib/export/index.js";
```

- Removed unused `RowDataPacket` import from `mysql2`
- Removed `getDbPool` import (no longer needed)
- Added `buildExportQuery` and `executeExportQuery` from library

#### 2. Refactored `fetchItemsForExport()` (Lines 182-212)
**Before:** Inline SQL building with `pool.execute()`
```typescript
const pool = getDbPool();
const values: Array<number | string | boolean> = [companyId];
let sql = `SELECT i.id, i.sku, i.name...`;
if (params.status) { sql += " AND i.is_active = ?"; values.push(params.status ? 1 : 0); }
// ... more conditions
const [rows] = await pool.execute<RowDataPacket[]>(sql, values);
```

**After:** Uses library functions
```typescript
const { sql, values } = buildExportQuery("items", {
  company_id: companyId,
  search: params.search,
  is_active: params.status,
  type: params.type,
  group_id: params.groupId
}, { format: params.format, columns: params.columns.length > 0 ? params.columns : undefined });

const rows = await executeExportQuery(sql, values);
```

#### 3. Refactored `fetchPricesForExport()` (Lines 214-243)
**Before:** Complex inline SQL with multiple `values.unshift()` calls
```typescript
const pool = getDbPool();
const values: Array<number | string | boolean> = [companyId];
// Complex query building with COALESCE for outlet-specific prices
// ... 100+ lines of inline SQL
const [rows] = await pool.execute<RowDataPacket[]>(sql, values);
```

**After:** Clean library usage
```typescript
const { sql, values } = buildExportQuery("item_prices", {
  company_id: companyId,
  outlet_id: params.outletId,
  search: params.search,
  is_active: params.status,
  scope_filter: params.scopeFilter,
  date_from: params.dateFrom,
  date_to: params.dateTo
}, { format: params.format, columns: params.columns.length > 0 ? params.columns : undefined });

const rows = await executeExportQuery(sql, values);
```

---

## Verification Results

### Type Check
```bash
npm run typecheck -w @jurnapod/api
✓ TypeScript compilation passed
```

### Lint
```bash
npm run lint -w @jurnapod/api
✓ No lint errors in export.ts
```

### Unit Tests
```bash
npm run test:unit:single -w @jurnapod/api src/routes/export.test.ts
✓ 66 tests passed, 0 failed
```

### Acceptance Criteria Status

| Criteria | Status |
|----------|--------|
| AC1: Import library functions | ✅ DONE |
| AC2: Replace inline query building | ✅ DONE |
| AC3: Maintain all export formats (CSV, XLSX, JSON) | ✅ DONE |
| AC4: Maintain column customization | ✅ DONE |
| AC5: Maintain filter support | ✅ DONE |
| AC6: Maintain streaming for large datasets | ✅ DONE |
| AC7: Error handling | ✅ DONE |
| AC8: Zero direct SQL | ✅ DONE - No `pool.execute()` or `getDbPool()` calls remain |

---

## Files Created/Modified

| File | Change |
|------|--------|
| `apps/api/src/routes/export.ts` | Modified - Refactored to use library |

---

## Dependencies

- Story 12.5 (Export Library Extension) - COMPLETED
- `apps/api/src/lib/export/query-builder.ts` - Used for query building
- `apps/api/src/lib/export/index.ts` - Exports `buildExportQuery`, `executeExportQuery`

---

## Technical Notes

1. **Filter Mapping**: The route's `ExportQueryParams` uses camelCase (`status`, `groupId`, `dateFrom`) while the library's `ExportFilters` uses snake_case (`is_active`, `group_id`, `date_from`). The refactored code maps between these conventions.

2. **Outlet-specific Prices**: The library's `buildItemPricesQuery` handles the outlet-specific view with COALESCE logic for override/default prices, matching the original route's behavior.

3. **Streaming**: The existing streaming logic for large CSV exports (`generateCSVStream`) remains unchanged since the library's streaming support is via `streamExportFromDatabase` which requires different integration.

4. **Transform Functions**: Both `fetchItemsForExport` and `fetchPricesForExport` retain their row transformation logic to ensure consistent output shape regardless of library query changes.

---

## Definition of Done Checklist

- [x] Route uses library for query building (`buildExportQuery`)
- [x] Route uses library for query execution (`executeExportQuery`)
- [x] All export formats work (CSV, XLSX, JSON)
- [x] Column customization works
- [x] All filters work
- [x] Streaming for large datasets works
- [x] No direct SQL in route file
- [x] All existing tests pass (66 tests)
- [x] TypeScript compilation passes
- [x] Lint passes

---

*Story 12.6 COMPLETED*
