# Story 36.9: Proof-of-Concept for OpenAPI Auto-Generation with Health + Auth Routes

Status: done

## Summary

Successfully implemented auto-generation of OpenAPI spec using `@hono/zod-openapi` for Health and Auth routes. This replaces the static JSONC file approach with code-generated specs that stay in sync with the implementation.

## Changes Made

### Files Created

| File | Description |
|------|-------------|
| `apps/api/src/routes/openapi-aggregator.ts` | OpenAPIHono instance that aggregates routes and generates spec |

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/health.ts` | Modified | Added `registerHealthRoutes(app)` function with `createRoute()` decorators |
| `apps/api/src/routes/auth.ts` | Modified | Added `registerAuthRoutes(app)` function with `createRoute()` decorators |
| `apps/api/src/routes/swagger.ts` | Modified | Replaced JSONC loading with import from `openapi-aggregator.ts` |

## Implementation Details

### openapi-aggregator.ts

Creates an `OpenAPIHono` instance that:
- Imports registration functions from route modules
- Registers routes with OpenAPI metadata
- Generates spec via `app.getOpenAPIDocument()`

```typescript
const app = new OpenAPIHono();
registerHealthRoutes(app);
registerAuthRoutes(app);
export const openAPISpec = app.getOpenAPIDocument({
  openapi: "3.0.0",
  info: { version: "0.3.0", title: "Jurnapod API" },
});
```

### Route Registration Pattern

Routes now export a registration function that uses `createRoute()`:

```typescript
export const registerHealthRoutes = (app: OpenAPIHono) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/health",
      operationId: "getHealth",
      // ... metadata
    }),
    async (c) => { /* handler */ }
  );
};
```

## Routes Documented

### Health Routes
- ✅ `GET /health` - Health check with optional detailed parameter
- ✅ `GET /health/live` - Liveness probe
- ✅ `GET /health/ready` - Readiness probe

### Auth Routes
- ✅ `POST /auth/login` - User login
- ✅ `POST /auth/logout` - User logout
- ✅ `POST /auth/refresh` - Token refresh

## Validation Evidence

| Check | Result |
|-------|--------|
| `npm run typecheck -w @jurnapod/api` | ✅ Pass |
| `/swagger.json` returns auto-generated spec | ✅ Working |
| Scalar UI renders Health section | ✅ Working |
| Scalar UI renders Auth section | ✅ Working |
| Existing route functionality | ✅ Unchanged |

## Known Limitations (PoC Scope)

1. **Only Health + Auth routes** - Other routes still use JSONC file
2. **No global security schemes** - BearerAuth not yet configured in aggregator
3. **Servers array** - Not yet configured in spec generation

These limitations are acceptable for a proof-of-concept and will be addressed in Story 36.10 (full migration).

## Benefits Demonstrated

1. ✅ **Auto-generation** - Spec generated from code, no manual JSON maintenance
2. ✅ **Type safety** - Zod schemas ensure request/response types match
3. ✅ **Single source of truth** - Code is the documentation
4. ✅ **No drift** - Spec always matches implementation

## Next Steps

Story 36.10: Expand auto-generation to all remaining routes (sync, sales, accounting, inventory, settings, etc.)

## Story

As a **developer**,
I want the OpenAPI spec to be auto-generated from route code using `@hono/zod-openapi`,
So that the documentation always stays in sync with the implementation.

## Context

Story 36.8 extracted the OpenAPI spec to a static JSONC file. While this works, it requires manual maintenance and can drift from the actual code. This story implements auto-generation using `@hono/zod-openapi` to ensure the spec is always derived from the actual route implementations.

## Acceptance Criteria

**AC1: OpenAPI spec is auto-generated**
**Given** the API is running
**When** I request `GET /swagger.json`
**Then** it returns an auto-generated OpenAPI spec (not from JSONC file)

**AC2: Health routes are documented**
**Given** the auto-generated spec
**When** I examine the Health section
**Then** I see GET /health, GET /health/live, GET /health/ready with proper schemas

**AC3: Auth routes are documented**
**Given** the auto-generated spec
**When** I examine the Auth section
**Then** I see POST /auth/login, POST /auth/logout, POST /auth/refresh with proper schemas

**AC4: TypeScript typecheck passes**
**Given** the implementation
**When** I run `npm run typecheck`
**Then** no errors are reported

**AC5: Existing functionality preserved**
**Given** the refactored routes
**When** I call the health and auth endpoints
**Then** they work exactly as before

## Test Coverage Criteria

- [x] Happy paths to test:
  - [x] `/swagger.json` returns valid OpenAPI 3.0 spec
  - [x] Scalar UI shows Health section correctly
  - [x] Scalar UI shows Auth section correctly
- [x] Regression tests:
  - [x] Health endpoints still work
  - [x] Auth endpoints still work

## Tasks / Subtasks

- [x] Create `apps/api/src/routes/openapi-aggregator.ts`
- [x] Add `registerHealthRoutes(app)` function to health.ts
- [x] Add `registerAuthRoutes(app)` function to auth.ts
- [x] Update `swagger.ts` to use aggregator instead of JSONC
- [x] Run typecheck and verify no errors
- [x] Test `/swagger.json` endpoint
- [x] Test Scalar UI rendering

## Estimated Effort

4h

## Risk Level

Low — Proof-of-concept with limited scope (2 route files only)

## Dev Notes

### Why This Approach?

1. **Runtime generation** - Simplest implementation, no build-time complexity
2. **OpenAPIHono** - Provides built-in registry and spec compilation
3. **Registration pattern** - Clean separation, routes can be used standalone or registered
4. **Incremental migration** - Can migrate routes one at a time

### Pattern for Future Routes

```typescript
// In route file:
export const registerXxxRoutes = (app: OpenAPIHono) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/xxx",
      operationId: "getXxx",
      request: { /* params, query, body */ },
      responses: { /* 200, 400, etc. */ },
    }),
    async (c) => { /* handler */ }
  );
};

// In openapi-aggregator.ts:
import { registerXxxRoutes } from "./xxx.js";
registerXxxRoutes(app);
```

## Dependencies

- Story 36.8 (JSONC extraction) - Provides baseline for comparison
- `@hono/zod-openapi` package - Already installed

## Technical Debt Review

- [x] No shortcuts identified for this story
- [x] Pattern established for future route migration

## Notes

This proof-of-concept validates the auto-generation approach before committing to full migration. The pattern is proven and ready to scale to all routes in Story 36.10.
