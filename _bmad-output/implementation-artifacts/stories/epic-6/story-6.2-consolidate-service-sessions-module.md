# Story 6.2: Consolidate Service Sessions Module

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract sub-modules from service-sessions.ts**,
So that **the session lifecycle, line management, and checkpoint logic can be developed and tested independently**.

## Context

`apps/api/src/lib/service-sessions.ts` is 2,051 lines handling dine-in service sessions with multi-cashier support. The module handles:
- Session lifecycle (create, lock, close)
- Line management (add, adjust, remove)
- Checkpoint/finalize logic
- Table occupancy tracking

## Acceptance Criteria

**AC1: Sub-module Extraction**
- Extract session lifecycle into `lib/service-sessions/lifecycle.ts`
- Extract line management into `lib/service-sessions/lines.ts`
- Extract checkpoint/finalize logic into `lib/service-sessions/checkpoint.ts`
- Clear `index.ts` public interface

**AC2: Type Safety**
- Replace `as any` casts with typed queries
- Add runtime validation for session state transitions

**AC3: Test Coverage**
- Add unit tests for each sub-module
- Maintain 100% passing tests

## Tasks

- [ ] Create `lib/service-sessions/` directory structure
- [ ] Extract session state machine to `lifecycle.ts`
- [ ] Extract line operations to `lines.ts`
- [ ] Extract checkpoint logic to `checkpoint.ts`
- [ ] Create consolidated `index.ts`
- [ ] Add unit tests for each sub-module
- [ ] Update routes to use new sub-modules
- [ ] Delete original `service-sessions.ts`

## Estimated Effort

3 days

## Risk Level

Medium (POS-facing but isolated)

## Dependencies

None
