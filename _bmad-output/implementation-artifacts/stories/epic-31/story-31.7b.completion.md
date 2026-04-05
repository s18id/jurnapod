# Story 31.7b Completion: Route Thinning - Reports Routes

## Summary

Successfully extracted shared report context builder helper and refactored `routes/reports.ts` to be a thin HTTP adapter.

## What Was Done

### 1. Shared Orchestration Patterns Found

The audit of `routes/reports.ts` (~900 lines, 9 endpoints) revealed these repeated patterns:

| Pattern | Description | Instances |
|---------|-------------|-----------|
| Auth extraction | `const auth = c.get("auth") as AuthContext` | 9 |
| Start time tracking | `const startTime = Date.now()` | 9 |
| Module permission check | `requireAccess({ module, permission: "report" })` | 9 |
| URL param parsing | `new URL(c.req.raw.url)` + Zod validation | 9 |
| Date range resolution | `resolveDateRange(companyId, parsed)` | 8 |
| Outlet scope resolution | outlet access check + `listUserOutletIds` fallback | 9 |
| Timezone resolution | `companyService.getCompany` + `timezone ?? 'UTC'` | 9 |
| Cashier-only detection | `isCashierOnly(auth)` for POS reports | 4 |
| Telemetry wrapping | `withQueryTimeout(..., QUERY_TIMEOUT_MS)` | 9 |
| Telemetry emission | `emitReportMetrics(...)` | 9 |
| Error handling | `handleReportError(...)` | 9 |

### 2. Extracted Helpers

#### `apps/api/src/lib/report-context.ts`
- `reportQuerySchema` - base query schema with outlet_id, date_from, date_to
- `reportPaginationSchema` - pagination schema with limit/offset
- `isCashierOnly(auth)` - checks if user is cashier-only
- `resolveDateRange(companyId, parsed)` - resolves fiscal year defaults
- `buildReportContext(c, module, parsedQuery, options)` - builds complete report context
- `parseReportQuery(schema, url)` - URL param parsing helper
- `parseReportPaginationQuery(schema, url, extraFields)` - pagination parsing helper

#### `apps/api/src/lib/report-error-handler.ts`
- `executeReport(reportType, companyId, queryFn, options)` - timeout + telemetry wrapper
- `emitReportSuccess(reportType, companyId, startTime, rowCount)` - success telemetry
- `handleReportError(error, startTime, companyId, reportType)` - consolidated error handling

### 3. Refactored Routes

Routes now contain only HTTP concerns:
- **Validation**: Zod schema parsing
- **Auth**: Via `buildReportContext`
- **Response**: `successResponse` mapping

Routes no longer import:
- `getDbPool` ❌
- `pool.execute` ❌
- SQL helpers ❌

## Files Modified/Created

| File | Change |
|------|--------|
| `apps/api/src/lib/report-context.ts` | **Created** - new helper module |
| `apps/api/src/lib/report-error-handler.ts` | **Created** - new helper module |
| `apps/api/src/routes/reports.ts` | **Refactored** - reduced from 904 to ~460 lines |

## Validation Results

```bash
✅ npm run typecheck -w @jurnapod/api      # Passed
✅ npm run build -w @jurnapod/api           # Passed
✅ npm run typecheck -w @jurnapod/modules-reporting  # Passed
```

## Acceptance Criteria Status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Extract shared report context builder helper | ✅ Done |
| 2 | Route handlers become thin endpoint declarations | ✅ Done |
| 3 | Routes contain only HTTP concerns | ✅ Done |
| 4 | Routes do not import getDbPool, pool.execute, SQL helpers | ✅ Done |
| 5 | npm run typecheck passes | ✅ Done |
| 6 | npm run build passes | ✅ Done |

## Notes

- The `receivables-ageing` endpoint required special handling because it doesn't use date_from/date_to
- Telemetry is now consolidated into `executeReport` and `emitReportSuccess`
- Error handling is centralized in `handleReportError`
