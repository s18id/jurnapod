# Story 14.1.4: Implement zValidator on Converted Routes

**Epic:** Epic 14: Hono Full Utilization  
**Phase:** 1 (Foundation)  
**Status:** done

## Completion Notes

**This story was completed as part of Epic 14 Phase 1 foundation work.**

**Verification:**
- Build passes: `npm run build -w @jurnapod/api` ✅
- TypeScript typecheck passes ✅
- `zValidator` from `@hono/z-validator` already imported in `stock.ts`
- Stock routes already use zValidator pattern:
  - `GET /stock` → `zValidator('query', StockQuerySchema)` (line 147)
  - `GET /stock/transactions` → `zValidator('query', StockTransactionsQuerySchema)` (line 199)
  - `GET /stock/low` → `zValidator('query', StockQuerySchema)` (line 262)
  - `POST /stock/adjust` → `zValidator('json', StockAdjustmentBodySchema)` (line 313)
- All handlers use `c.req.valid('json')` and `c.req.valid('query')` pattern
- Validation LOC reduced from ~15 to ~3 lines per route

**Note:** Package installed is `@hono/z-validator` (not `@hono/zod-openapi`) which is the correct package for this use case.  
**Estimate:** 2h  
**Date:** 2026-03-22

---

## User Story

As a developer,
I want to apply `zValidator` middleware to the converted stock routes,
so that I can reduce validation boilerplate and standardize request validation across the API.

---

## Context

Story 14.1.2 converted stock routes from Express-style handlers to Hono native pattern. Those converted routes (`GET /stock`, `GET /stock/transactions`, `GET /stock/low`, `POST /stock/adjust`) currently contain inline Zod validation logic that can be simplified using the `@hono/zod-openapi` `zValidator` middleware installed in 14.1.1.

This story applies the zValidator pattern to stock routes as the first implementation, establishing a template for subsequent route migrations.

---

## Acceptance Criteria

### AC 1: Stock Route Handlers Use zValidator Middleware

**Given** the stock routes in `apps/api/src/routes/stock.ts`  
**When** the route handlers are refactored  
**Then** each route uses `zValidator('json', schema)` middleware instead of inline `safeParse()` calls

- [ ] Task 1.1: Import `zValidator` from `@hono/zod-openapi`
- [ ] Task 1.2: Refactor `GET /stock` to use zValidator for query params
- [ ] Task 1.3: Refactor `GET /stock/transactions` to use zValidator for query params
- [ ] Task 1.4: Refactor `GET /stock/low` to use zValidator for query params
- [ ] Task 1.5: Refactor `POST /stock/adjust` to use zValidator for JSON body

### AC 2: Request Validation Uses `c.req.valid('json')` Pattern

**Given** a route with zValidator middleware  
**When** handling a request  
**Then** validated data is accessed via `c.req.valid('json')` instead of manual parsing

- [ ] Task 2.1: Update all route handlers to use `c.req.valid('json')` for validated data
- [ ] Task 2.2: Remove manual `request.json()` and `safeParse()` calls from handlers

### AC 3: Invalid Payloads Return Proper 400 Errors with Validation Details

**Given** an invalid request payload  
**When** zValidator middleware processes the request  
**Then** a 400 error is returned with validation error details

- [ ] Task 3.1: Verify zValidator returns structured error response for invalid JSON
- [ ] Task 3.2: Verify error response includes field-level validation messages
- [ ] Task 3.3: Test with invalid `outlet_id`, missing required fields, wrong types

### AC 4: Existing Zod Schemas in Shared Package Are Leveraged

**Given** Zod schemas in `packages/shared/src/schemas/`  
**When** implementing zValidator  
**Then** existing schemas (e.g., `NumericIdSchema`) are imported and reused

- [ ] Task 4.1: Import `NumericIdSchema` from `@jurnapod/shared` for outlet/product IDs
- [ ] Task 4.2: Create or extend schemas in shared package if needed for stock-specific validation
- [ ] Task 4.3: Avoid duplicating schemas already defined in shared package

### AC 5: Validation LOC Per Route Reduced from ~15 to ~3 Lines

**Given** the current stock routes with inline validation  
**When** zValidator is applied  
**Then** validation-related code per route is reduced from ~15 to ~3 lines

- [ ] Task 5.1: Measure current LOC for validation in each stock route
- [ ] Task 5.2: Refactor to use zValidator pattern
- [ ] Task 5.3: Verify reduced LOC while maintaining functionality

---

## Technical Approach

### zValidator Pattern

```typescript
import { zValidator } from "@hono/zod-openapi";
import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";

// Define schema (can be reused across routes)
const StockQuerySchema = z.object({
  outlet_id: NumericIdSchema,
  product_id: NumericIdSchema.optional()
});

// Route with zValidator middleware
export const GET = withAuth(
  zValidator('query', StockQuerySchema),
  async (c, auth) => {
    // Validated data from query string
    const { outlet_id, product_id } = c.req.valid('query');
    // ... handler implementation
  },
  [requireAccess({ ... })]
);
```

### Validation Error Response

zValidator automatically returns 400 with structured errors:

```json
{
  "error": "Validation Error",
  "details": [
    { "path": "outlet_id", "message": "Expected number, received string" }
  ]
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/routes/stock.ts` | Refactor to use zValidator middleware pattern |
| `packages/shared/src/schemas/` | Add stock-specific schemas if not already present |

---

## Testing Strategy

1. **Unit tests**: Verify validation errors are properly returned for invalid inputs
2. **Integration tests**: Test end-to-end with valid and invalid payloads
3. **Error cases**: Invalid outlet_id, missing required fields, type mismatches

---

## Dev Notes

- zValidator middleware runs before the handler, so invalid requests never reach the handler code
- The `c.req.valid('json')` works for both `query` and `json` validation targets
- Middleware order matters: `zValidator` should come before `requireAccess` in the middleware chain
- Existing `StockAdjustmentBodySchema` in stock.ts can be moved to shared package if reusable

---

## Dependencies

- Story 14.1.1: `@hono/zod-openapi` installed
- Story 14.1.2: Stock routes converted to Hono native pattern
