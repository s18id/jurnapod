# Story 6.2a: Service Sessions Types Extraction

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract types and error classes from service-sessions.ts into lib/service-sessions/**,
So that **types are in a single file for the module**.

## Context

Part of Story 6.2 (Consolidate Service Sessions Module). Extract types first.

## Scope

- Error classes: SessionNotFoundError, SessionConflictError, SessionValidationError, InvalidSessionStatusError
- Interfaces: ServiceSession, SessionLine, ListSessionsParams, etc.
- Any type definitions needed by other sub-modules

## Acceptance Criteria

**AC1: Types Extracted**
- All error classes moved to `lib/service-sessions/types.ts`
- All interfaces moved to `lib/service-sessions/types.ts`

**AC2: Backward Compatibility**
- `service-sessions.ts` re-exports types for backward compatibility

## Tasks

- [ ] Create `lib/service-sessions/` directory
- [ ] Extract error classes to `lib/service-sessions/types.ts`
- [ ] Extract interfaces to `lib/service-sessions/types.ts`
- [ ] Update `lib/service-sessions/index.ts` to re-export
- [ ] Verify typecheck passes

## Estimated Effort

0.5 day

## Dependencies

None
