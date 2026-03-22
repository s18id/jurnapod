# Story 14.1.3: Add typed context extensions for auth and telemetry

Status: done

## Completion Notes

**This story was completed as part of Epic 14 Phase 1 foundation work.**

**Verification:**
- TypeScript typecheck passes with no `any` types in context access
- `AuthContext` defined in `apps/api/src/lib/auth-guard.ts` (lines 42-47)
- `TelemetryContext` defined in `apps/api/src/middleware/telemetry.ts` (lines 50-58)
- Both context types declared via `declare module "hono"` for type safety
- Build passes: `npm run build -w @jurnapod/api` ✅

**Evidence that context is fully typed:**
- `c.get("auth")` returns `AuthContext` (not `any`)
- `c.get("telemetry")` returns `TelemetryContext | undefined` (not `any`)
- No `as any` casts in context access patterns

## Story

As a developer,
I want typed context extensions in Hono,
so that I can access auth and telemetry data without `any` casts and enable type-safe dependency injection.

## Context

Epic 14 Phase 1 (Foundation) focuses on fully utilizing Hono's capabilities. Type-safe context extensions eliminate the need for `any` casts when accessing auth/telemetry from `c.get()`, improving type safety across the codebase.

## Acceptance Criteria

### AC 1: AuthContext Type Definition

**Given** the Hono app context
**When** accessing `c.get('auth')`
**Then** returns a typed `AuthContext` object without `any` casts
**And** includes `companyId`, `userId`, and `role` properties

- [x] Task 1.1: Define `AuthContext` interface with `companyId`, `userId`, `role`
- [x] Task 1.2: Register auth context extension on Hono app
- [x] Task 1.3: Update all middleware to use typed extension

### AC 2: Telemetry Type Definition

**Given** the Hono app context
**When** accessing `c.get('telemetry')`
**Then** returns a typed telemetry object
**And** no `any` casts are required

- [x] Task 2.1: Define telemetry interface/type
- [x] Task 2.2: Register telemetry context extension
- [x] Task 2.3: Verify no `any` types in context access patterns

### AC 3: Middleware Update

**Given** existing middleware that sets auth/telemetry context
**When** the extensions are typed
**Then** all middleware is updated to use typed extensions
**And** no `any` casts remain in context access

- [x] Task 3.1: Audit existing middleware for context usage
- [x] Task 3.2: Update middleware to use typed extensions
- [x] Task 3.3: Remove any remaining `any` casts

## Dev Notes

### Context Extensions in Hono

Hono provides `c.set()` and `c.get()` for context-level storage. TypeScript can infer types by passing a generic to the app:

```typescript
type AuthContext = {
  companyId: string;
  userId: string;
  role: string;
};

type TelemetryContext = {
  requestId: string;
  timestamp: number;
};

const app = new Hono<{
  Variables: {
    auth: AuthContext;
    telemetry: TelemetryContext;
  };
}>();
```

### Files to Modify

- `apps/api/src/` - Middleware and route files using context

### Type Safety Goal

After this story:
- `c.get('auth')` returns `AuthContext` (not `any`)
- `c.get('telemetry')` returns `TelemetryContext` (not `any`)
- No `as any` casts in context access patterns

## Tasks / Subtasks

- [x] Task 1: Define AuthContext interface
- [x] Task 2: Define TelemetryContext interface
- [x] Task 3: Update Hono app with typed Variables
- [x] Task 4: Update all middleware to use typed extensions
- [x] Task 5: Verify no `any` casts remain in context access
- [x] Task 6: Run typecheck and build validation

## Technical Notes

- Auth context should include: `companyId`, `userId`, `role`
- Telemetry context typically includes: `requestId`, `timestamp`, potentially trace info
- All context access via `c.get('key')` should be typed after this change
- Search for existing `as any` casts related to context access for remediation

## Definition of Done

- [x] `c.get('auth')` returns typed `AuthContext` without `any` casts
- [x] `c.get('telemetry')` returns typed telemetry object
- [x] Auth context includes `companyId`, `userId`, `role`
- [x] All existing middleware updated to use typed extensions
- [x] No `any` types in context access patterns
- [x] TypeScript typecheck passes
- [x] Build passes
