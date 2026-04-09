# Story 36.2: Auth & Health Routes OpenAPI Documentation

Status: done

## Story

As an **API consumer**,
I want complete OpenAPI annotations on auth and health routes,
So that I can understand request/response shapes and authenticate properly.

## Context

Story 36.1 established the OpenAPI infrastructure. This story annotates the auth and health routes with full `openapi()` metadata including:
- Request body schemas (validated via Zod)
- Response schemas
- HTTP status codes
- Security requirements

## Routes to Document

### Auth Routes (`apps/api/src/routes/auth.ts`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/auth/login | User login with email/password | No |
| POST | /api/auth/logout | User logout, clears refresh token | Yes |
| POST | /api/auth/refresh | Rotate access token using refresh cookie | No |

### Health Routes (`apps/api/src/routes/health.ts`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/health | Health check with optional subsystem details | No |
| GET | /api/health/live | Liveness probe | No |
| GET | /api/health/ready | Readiness probe (checks DB) | No |

## Acceptance Criteria

**AC1: POST /api/auth/login documented**
**Given** the OpenAPI spec
**When** I examine POST /api/auth/login
**Then** I see:
- Request body: `{ companyCode: string, email: string, password: string }`
- Response 200: `{ success: true, data: { access_token: string, token_type: "Bearer", expires_in: number } }`
- Response 400: `{ success: false, error: { code: "INVALID_REQUEST", message: string } }`
- Response 401: `{ success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } }`
- No security requirement (unauthenticated endpoint)

**AC2: POST /api/auth/logout documented**
**Given** the OpenAPI spec
**When** I examine POST /api/auth/logout
**Then** I see:
- Security requirement: BearerAuth
- Response 200: `{ success: true, data: null }`

**AC3: POST /api/auth/refresh documented**
**Given** the OpenAPI spec
**When** I examine POST /api/auth/refresh
**Then** I see:
- Security requirement: None (uses httpOnly cookie)
- Response 200: `{ success: true, data: { access_token: string, token_type: "Bearer", expires_in: number } }`
- Response 401: `{ success: false, error: { code: "UNAUTHORIZED", message: string } }`

**AC4: GET /api/health documented**
**Given** the OpenAPI spec
**When** I examine GET /api/health
**Then** I see:
- Query param: `detailed=true` (optional boolean)
- Response 200: `{ status: "ok"|"degraded"|"unhealthy", timestamp: string, subsystems?: {...} }`
- Response 503: Returned when unhealthy
- No security requirement

**AC5: GET /api/health/live documented**
**Given** the OpenAPI spec
**When** I examine GET /api/health/live
**Then** I see:
- Response 200: `{ success: true, data: { status: "alive", timestamp: string } }`

**AC6: GET /api/health/ready documented**
**Given** the OpenAPI spec
**When** I examine GET /api/health/ready
**Then** I see:
- Response 200: `{ success: true, data: { status: "ready", timestamp: string } }`
- Response 503: `{ success: false, data: { status: "not_ready", timestamp: string, reason: string } }`

**AC7: Scalar renders all endpoints**
**Given** Scalar UI at `/swagger`
**When** I browse to Auth section
**Then** I see all three auth endpoints with correct schemas

## Test Coverage Criteria

- [x] Happy paths to test:
  - [x] Scalar UI renders all auth and health endpoints
  - [x] Schema references are valid JSON Schema
- [x] Error paths to test:
  - [x] Invalid login payload shows 400 response

## Tasks / Subtasks

- [x] Add `openapi()` metadata to POST /api/auth/login with Zod schema
- [x] Add `openapi()` metadata to POST /api/auth/logout with security
- [x] Add `openapi()` metadata to POST /api/auth/refresh with cookie auth
- [x] Add `openapi()` metadata to GET /api/health with query params
- [x] Add `openapi()` metadata to GET /api/health/live
- [x] Add `openapi()` metadata to GET /api/health/ready
- [x] Verify `/swagger.json` is valid OpenAPI 3.0
- [x] Run typecheck and build

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/auth.ts` | Modify | Add openapi() Zod schemas for documentation |
| `apps/api/src/routes/health.ts` | Modify | Add openapi() Zod schemas for documentation |
| `apps/api/src/routes/swagger.ts` | Modify | Update OpenAPI spec to match schema requirements |

## File List

```
apps/api/src/routes/auth.ts
apps/api/src/routes/health.ts
apps/api/src/routes/swagger.ts
```

## Estimated Effort

4h

## Risk Level

Low — Documentation only, no business logic changes

## Dev Notes

### Zod Schema to OpenAPI Pattern

```typescript
import { z } from 'zod';
import { z as zodOpenApi } from '@hono/zod-openapi';

const LoginRequestSchema = zodOpenApi
  .object({
    companyCode: zodOpenApi.string().min(1).max(32).openapi({ description: "Company code" }),
    email: zodOpenApi.string().email().max(191).openapi({ description: "User email address" }),
    password: zodOpenApi.string().min(1).max(255).openapi({ description: "User password" }),
  })
  .openapi("LoginRequest");
```

### Health Response Schema

```typescript
const SubsystemStatusSchema = zodOpenApi
  .object({
    status: zodOpenApi.enum(["healthy", "degraded", "unhealthy"]).openapi({ description: "Health status" }),
    latencyMs: zodOpenApi.number().optional().openapi({ description: "Latency in milliseconds" }),
    message: zodOpenApi.string().optional().openapi({ description: "Optional message" }),
    details: zodOpenApi.unknown().optional().openapi({ description: "Additional details" }),
  })
  .openapi("SubsystemStatus");

const HealthResponseSchema = zodOpenApi
  .object({
    status: zodOpenApi.enum(["ok", "degraded", "unhealthy"]).openapi({ description: "Overall health status" }),
    timestamp: zodOpenApi.string().openapi({ description: "ISO 8601 timestamp" }),
    subsystems: zodOpenApi.object({...}).optional().openapi({ description: "Subsystem health details" }),
    version: zodOpenApi.string().optional().openapi({ description: "API version" }),
  })
  .openapi("HealthResponse");
```

## Dependencies

- Story 36.1 (OpenAPI Infrastructure) must be completed first

## Technical Debt Review

- [x] No shortcuts identified for this story
- [x] No TODO/FIXME comments expected

## Notes

This story focuses on annotating routes that don't require extensive refactoring. Auth routes use manual validation (not zValidator) to ensure audit logging for invalid requests, so the OpenAPI docs should reflect the actual request body shape after transformation.

## Dev Agent Record

### Implementation Plan

1. Added Zod schemas with `.openapi()` metadata to `apps/api/src/routes/auth.ts`:
   - `LoginRequestSchema` - for login request body (companyCode, email, password)
   - `LoginSuccessResponseSchema` - for 200 response
   - `LoginErrorResponseSchema` - for 400/401 error responses
   - `LogoutResponseSchema` - for logout response
   - `RefreshSuccessResponseSchema` - for refresh success response
   - `RefreshErrorResponseSchema` - for refresh error response

2. Added Zod schemas with `.openapi()` metadata to `apps/api/src/routes/health.ts`:
   - `SubsystemStatusSchema` - for subsystem health status
   - `HealthResponseSchema` - for GET /api/health response
   - `LivenessResponseSchema` - for GET /api/health/live response
   - `ReadinessSuccessResponseSchema` - for GET /api/health/ready 200 response
   - `ReadinessFailureResponseSchema` - for GET /api/health/ready 503 response

3. Updated `apps/api/src/routes/swagger.ts` to reflect proper schema requirements:
   - Changed `company_code` to `companyCode` in login request schema
   - Added proper error response schemas for login (400, 401)
   - Added BearerAuth security to `/auth/logout`
   - Added httpOnly cookie note to `/auth/refresh` description
   - Added 401 error response schema to `/auth/refresh`
   - Added `detailed` query parameter to `/api/health`

### Completion Notes

✅ All acceptance criteria satisfied:
- AC1: POST /api/auth/login documented with request body `{ companyCode, email, password }` and all response schemas
- AC2: POST /api/auth/logout has BearerAuth security requirement
- AC3: POST /api/auth/refresh documented with no security (uses httpOnly cookie) and 401 error schema
- AC4: GET /api/health documented with `detailed` query param
- AC5: GET /api/health/live documented
- AC6: GET /api/health/ready documented with 200 and 503 responses
- AC7: Scalar renders all endpoints (verified by integration tests)

✅ Validation evidence:
- `npm run typecheck -w @jurnapod/api` passes
- `npm run build -w @jurnapod/api` passes
- `npm run test:single -w @jurnapod/api -- __test__/integration/swagger/swagger.test.ts` passes (5/5 tests)

### Change Log

- Added OpenAPI Zod schemas to auth.ts for documentation (Date: 2026-04-09)
- Added OpenAPI Zod schemas to health.ts for documentation (Date: 2026-04-09)
- Updated swagger.ts to reflect proper schema requirements per ACs (Date: 2026-04-09)
