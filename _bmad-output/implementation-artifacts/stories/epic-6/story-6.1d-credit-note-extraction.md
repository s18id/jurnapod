# Story 6.1d: Credit Note Types and Functions Extraction

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract credit-note types and functions from sales.ts into lib/credit-notes/**,
So that **credit note operations are isolated in a focused module**.

## Context

This is part of Story 6.1 (Consolidate Sales Module). `sales.ts` is 4,120 lines and handles multiple domains. This story extracts only the credit-note related code.

**Scope:**
- Credit note types (SalesCreditNote, SalesCreditNoteDetail)
- Credit note functions: createCreditNote, getCreditNote, listCreditNotes, updateCreditNote
- Credit note lifecycle: postCreditNote, voidCreditNote

**Files to create:**
- `lib/credit-notes/types.ts` - All credit note types
- `lib/credit-notes/credit-note-service.ts` - CRUD and lifecycle
- `lib/credit-notes/index.ts` - Public exports

## Acceptance Criteria

**AC1: Types Extracted**
- All credit note types moved to `lib/credit-notes/types.ts`
- Public exports maintained for backward compatibility

**AC2: Functions Extracted**
- All credit note functions moved to `lib/credit-notes/credit-note-service.ts`

**AC3: Imports Updated**
- `routes/sales/credit-notes.ts` imports from new module
- All tests still pass

**AC4: Test Coverage**
- Unit tests for credit note functions still pass
- No regression in credit note API behavior

## Tasks

- [ ] Create `lib/credit-notes/` directory
- [ ] Extract types to `lib/credit-notes/types.ts`
- [ ] Extract credit note functions to `lib/credit-notes/credit-note-service.ts`
- [ ] Create `lib/credit-notes/index.ts` with public exports
- [ ] Update imports in routes/sales/credit-notes.ts
- [ ] Verify tests pass

## Estimated Effort

1 day

## Risk Level

Low-Medium

## Dependencies

None (can run parallel with other 6.1 sub-stories)
