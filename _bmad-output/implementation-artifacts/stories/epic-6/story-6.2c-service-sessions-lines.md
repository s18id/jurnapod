# Story 6.2c: Service Sessions Lines Extraction

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract session line functions from service-sessions.ts**,
So that **line management (add, update, remove) is isolated**.

## Context

Part of Story 6.2 (Consolidate Service Sessions Module).

## Scope

Functions to extract:
- `addSessionLine` - Add line to session
- `updateSessionLine` - Update line
- `removeSessionLine` - Remove line
- Helper functions: getSessionLineWithConnection, etc.

## Acceptance Criteria

**AC1: Line Functions Extracted**
- Functions moved to `lib/service-sessions/lines.ts`
- Helper functions properly relocated

**AC2: Backward Compatibility**
- `service-sessions.ts` re-exports for backward compatibility

## Tasks

- [ ] Create `lib/service-sessions/lines.ts`
- [ ] Extract line functions from service-sessions.ts
- [ ] Update `lib/service-sessions/index.ts`
- [ ] Verify typecheck passes
- [ ] Verify tests pass

## Estimated Effort

1 day

## Dependencies

Story 6.2a (types) should complete first
