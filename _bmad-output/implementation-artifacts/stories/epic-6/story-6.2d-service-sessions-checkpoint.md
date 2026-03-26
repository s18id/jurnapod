# Story 6.2d: Service Sessions Checkpoint Extraction

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract checkpoint and adjustment functions from service-sessions.ts**,
So that **finalize and adjust operations are isolated**.

## Context

Part of Story 6.2 (Consolidate Service Sessions Module).

## Scope

Functions to extract:
- `finalizeSessionBatch` - Finalize batch of lines
- `adjustSessionLine` - Adjust line quantity
- `getSessionEvents` - Get session events
- Helper functions: logTableEventWithConnection, logSessionEvent, etc.

## Acceptance Criteria

**AC1: Checkpoint Functions Extracted**
- Functions moved to `lib/service-sessions/checkpoint.ts`
- Helper functions properly relocated

**AC2: Backward Compatibility**
- `service-sessions.ts` re-exports for backward compatibility

## Tasks

- [ ] Create `lib/service-sessions/checkpoint.ts`
- [ ] Extract checkpoint functions from service-sessions.ts
- [ ] Update `lib/service-sessions/index.ts`
- [ ] Verify typecheck passes
- [ ] Verify tests pass

## Estimated Effort

1 day

## Dependencies

Story 6.2a (types) should complete first
