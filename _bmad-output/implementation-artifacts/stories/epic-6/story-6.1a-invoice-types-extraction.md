# Story 6.1a: Invoice Types and Functions Extraction

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract invoice-related types and functions from sales.ts into lib/invoices/**,
So that **invoice operations are isolated in a focused module**.

## Context

This is part of Story 6.1 (Consolidate Sales Module). `sales.ts` is 4,120 lines and handles multiple domains. This story extracts only the invoice-related code.

**Scope:**
- Invoice types (SalesInvoice, SalesInvoiceLine, SalesInvoiceDetail, etc.)
- Invoice CRUD functions: listInvoices, getInvoice, createInvoice, updateInvoice
- Invoice lifecycle: postInvoice, approveInvoice, voidInvoice
- Related helpers: buildInvoiceLines, normalizeInvoice, etc.

**Files to create:**
- `lib/invoices/types.ts` - All invoice-related types
- `lib/invoices/invoice-service.ts` - Invoice CRUD operations
- `lib/invoices/invoice-posting.ts` - Journal posting for invoices
- `lib/invoices/index.ts` - Public exports

## Acceptance Criteria

**AC1: Types Extracted**
- All invoice types moved to `lib/invoices/types.ts`
- Public exports maintained for backward compatibility

**AC2: Functions Extracted**
- Invoice CRUD functions moved to `lib/invoices/invoice-service.ts`
- Invoice posting moved to `lib/invoices/invoice-posting.ts`
- All helper functions properly relocated

**AC3: Imports Updated**
- `routes/sales/invoices.ts` imports from new module
- `sales-posting.ts` imports types from new module
- All tests still pass

**AC4: Test Coverage**
- Unit tests for invoice functions still pass
- No regression in invoice API behavior

## Tasks

- [ ] Create `lib/invoices/` directory
- [ ] Extract types to `lib/invoices/types.ts`
- [ ] Extract invoice CRUD to `lib/invoices/invoice-service.ts`
- [ ] Extract invoice posting to `lib/invoices/invoice-posting.ts`
- [ ] Create `lib/invoices/index.ts` with public exports
- [ ] Update imports in routes/sales/invoices.ts
- [ ] Update imports in sales-posting.ts
- [ ] Verify tests pass

## Estimated Effort

1.5 days

## Risk Level

Medium (core financial module)

## Dependencies

None (can run parallel with other 6.1 sub-stories)
