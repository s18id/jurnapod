# Story 6.5: Reservations Domain Extraction

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract reservations into a domain module**,
So that **the 1,849-line reservations.ts monolith follows the same pattern as Epic 3 domain extractions**.

## Context

`apps/api/src/lib/reservations.ts` is 1,849 lines handling:
- Reservation CRUD
- Table assignment
- Availability checking
- Large party support (groups)
- Walk-in management

This is a candidate for domain extraction similar to Epic 3's items/prices extraction.

## Acceptance Criteria

**AC1: Module Extraction**
- Extract reservations into `lib/reservations/` domain module
- Clear `index.ts` public interface
- Maintain all existing functionality

**AC2: Route Migration**
- Update routes to use new domain module
- Maintain API compatibility

**AC3: Test Coverage**
- Add unit tests for reservation domain
- Maintain 100% passing tests

## Tasks

- [ ] Create `lib/reservations/` directory
- [ ] Extract reservation CRUD to `reservations-service.ts`
- [ ] Extract table assignment to `table-assignment.ts`
- [ ] Extract availability checking to `availability.ts`
- [ ] Extract group logic to `groups.ts`
- [ ] Extract walk-in logic to `walk-ins.ts`
- [ ] Create consolidated `index.ts`
- [ ] Update routes to use new domain module
- [ ] Add unit tests
- [ ] Delete or deprecate original `reservations.ts`

## Estimated Effort

3 days

## Risk Level

Medium (user-facing feature)

## Dependencies

None
