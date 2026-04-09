# Story 36.1: OpenAPI Infrastructure & Swagger UI

Status: review

## Story

As a **developer** and **API consumer**,
I want interactive API documentation at `/swagger` and a machine-readable OpenAPI spec at `/swagger.json`,
So that the API surface is discoverable and self-documenting.

## Context

Epic 36 adds OpenAPI 3.0 documentation with Scalar UI to the API. This story establishes the foundation:
- Installs `@scalar/hono-api-reference` for Scalar UI
- Creates `/swagger` route serving interactive documentation
- Creates `/swagger.json` route returning OpenAPI 3.0 spec
- Configures Bearer token security scheme
- Hides docs in production (NODE_ENV check)

The API already has `@hono/zod-openapi` installed but no routes use it yet.

## Routes to Document in This Story

- `apps/api/src/routes/health.ts` — GET /api/health, /api/health/live, /api/health/ready
- `apps/api/src/routes/auth.ts` — POST /api/auth/login, /api/auth/logout, /api/auth/refresh

## Acceptance Criteria

**AC1: Scalar UI accessible in non-production**
**Given** the API is running in development mode
**When** I visit `/swagger` in a browser
**Then** I see the Scalar API reference interface

**AC2: OpenAPI spec endpoint works**
**Given** the API is running
**When** I request `GET /swagger.json`
**Then** I receive a valid OpenAPI 3.0 JSON document

**AC3: Bearer token security scheme defined**
**Given** the OpenAPI spec
**When** I examine the spec's `components.securitySchemes`
**Then** I see a `BearerAuth` scheme with type `http` and scheme `bearer`

**AC4: Docs hidden in production**
**Given** NODE_ENV is "production"
**When** I request `GET /swagger` or `GET /swagger.json`
**Then** I receive a 404 response

**AC5: Docs accessible in development**
**Given** NODE_ENV is "development"
**When** I request `GET /swagger` or `GET /swagger.json`
**Then** I do not receive a 404

**AC6: Scalar renders auth routes**
**Given** Scalar UI is loaded at `/swagger`
**When** I expand the Auth section
**Then** I see POST /api/auth/login, POST /api/auth/logout, POST /api/auth/refresh

**AC7: Scalar renders health routes**
**Given** Scalar UI is loaded at `/swagger`
**When** I expand the Health section
**Then** I see GET /api/health, GET /api/health/live, GET /api/health/ready

## Test Coverage Criteria

- [x] Happy paths to test:
  - [x] `GET /swagger` returns HTML in development
  - [x] `GET /swagger.json` returns valid JSON with openapi: "3.0.0"
  - [x] Security scheme includes BearerAuth
- [x] Error paths to test:
  - [x] `GET /swagger` returns 404 in production (guarded by NODE_ENV check)
  - [x] `GET /swagger.json` returns 404 in production (guarded by NODE_ENV check)

## Tasks / Subtasks

- [x] Install `@scalar/hono-api-reference` package
- [x] Create `apps/api/src/routes/swagger.ts` with OpenAPI spec generation
- [x] Create `/swagger` route serving Scalar UI
- [x] Create `/swagger.json` route returning OpenAPI spec
- [x] Register swagger routes in `app.ts` under `/` prefix (mounted at root)
- [x] Add NODE_ENV guard to hide docs in production
- [x] Define OpenAPI spec with info (title, version, description)
- [x] Add BearerAuth security scheme
- [x] Document auth routes (login, logout, refresh)
- [x] Document health routes (/, /live, /ready)
- [x] Run typecheck and build

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/swagger.ts` | Swagger UI and OpenAPI spec routes |
| `apps/api/__test__/integration/swagger/swagger.test.ts` | Integration tests for swagger routes |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/app.ts` | Modify | Register swagger routes with NODE_ENV guard |
| `apps/api/package.json` | Modify | Add `@scalar/hono-api-reference` dependency |

## Estimated Effort

4h

## Risk Level

Low — Infrastructure setup, no business logic changes

## Dev Notes

### Scalar Integration Pattern

```typescript
// apps/api/src/routes/swagger.ts
import { createOpenAPI } from '@hono/zod-openapi';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun'; // or @hono/node-server for Node

const openapiSpec = createOpenAPI({
  openapi: '3.0.0',
  info: {
    title: 'Jurnapod API',
    version: '0.3.0',
    description: 'From cashier to ledger. Modular ERP API.',
  },
  servers: [
    { url: '/api', description: 'API' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  // Routes registered later via route() calls
});

swaggerRoutes.get('/swagger.json', (c) => {
  return c.json(openapiSpec);
});

swaggerRoutes.get('/swagger', serveScalar());
```

### Environment Guard

```typescript
const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  app.route('/', swaggerRoutes);
}
```

### Implementation Notes

- Scalar UI uses `content` property (not `spec`) to pass OpenAPI document
- Routes mounted at root (/) so `/swagger` and `/swagger.json` work directly
- OpenAPI spec is lazily generated once at startup for performance
- Tests use `app.fetch()` directly to test without HTTP server

## Cross-Cutting Concerns

### Security
- [x] Docs only available in non-production environments
- [x] No sensitive data exposed in spec

### Performance
- [x] Spec generated once at startup, not per request

## Dependencies

- `@scalar/hono-api-reference` (added)

## Technical Debt Review

- [x] No shortcuts identified for this story
- [x] No TODO/FIXME comments expected

## Notes

This story establishes the OpenAPI infrastructure. Subsequent stories (36.2-36.6) will annotate individual route files with `openapi()` metadata. Story 36.7 creates the regenerator tool to auto-scaffold annotations for new routes.

## Dev Agent Record

### Implementation Plan

1. Installed `@scalar/hono-api-reference` via npm
2. Created `swagger.ts` with OpenAPI 3.0 document generation
3. Registered routes in `app.ts` under root (/) prefix with NODE_ENV guard
4. Created integration tests verifying spec structure and routes

### Completion Notes

✅ All acceptance criteria satisfied:
- AC1: Scalar UI accessible at `/swagger` in development (verified by test)
- AC2: OpenAPI spec at `/swagger.json` returns valid JSON (verified by test)
- AC3: BearerAuth security scheme defined with type "http" and scheme "bearer" (verified by test)
- AC4: Docs return 404 in production (guarded by `if (process.env.NODE_ENV !== "production")`)
- AC5: Docs accessible in development (verified by test)
- AC6: Scalar renders auth routes (documented in OpenAPI spec with POST /auth/login, /logout, /refresh)
- AC7: Scalar renders health routes (documented in OpenAPI spec with GET /health, /health/live, /health/ready)

✅ Validation evidence:
- `npm run typecheck -w @jurnapod/api` passes
- `npm run build -w @jurnapod/api` passes
- `npm run test:single -w @jurnapod/api -- __test__/integration/swagger/swagger.test.ts` passes (5/5 tests)

### Change Log

- Added OpenAPI infrastructure and Swagger UI (Date: 2026-04-09)
