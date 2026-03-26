# Story 6.2b: Service Sessions Lifecycle Extraction

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract session lifecycle functions from service-sessions.ts**,
So that **session creation, locking, and closing are isolated**.

## Context

Part of Story 6.2 (Consolidate Service Sessions Module).

## Scope

Functions to extract:
- `getSession` - Get session by ID
- `listSessions` - List sessions with filters
- `getSessionLines` - Get lines for a session
- `lockSessionForPayment` - Lock session for payment
- `closeSession` - Close session
- Helper functions: mapDbRowToServiceSession, getSessionWithConnection

## Acceptance Criteria

**AC1: Lifecycle Functions Extracted**
- Functions moved to `lib/service-sessions/lifecycle.ts`
- Helper functions properly relocated

**AC2: Backward Compatibility**
- `service-sessions.ts` re-exports for backward compatibility

## Tasks

- [ ] Create `lib/service-sessions/lifecycle.ts`
- [ ] Extract lifecycle functions from service-sessions.ts
- [ ] Update `lib/service-sessions/index.ts`
- [ ] Verify typecheck passes
- [ ] Verify tests pass

## Estimated Effort

1 day

## Dependencies

Story 6.2a (types) should complete first
