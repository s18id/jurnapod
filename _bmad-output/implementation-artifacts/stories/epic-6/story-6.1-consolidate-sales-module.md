# Story 6.1: Consolidate Sales Module

**Status:** in-progress

## Story

As a **Jurnapod developer**,
I want **to extract sub-modules from the sales.ts monolith**,
So that **the codebase is maintainable and changes to invoice logic don't risk breaking payment processing**.

## Context

`apps/api/src/lib/sales.ts` is 4,120 lines handling:
- Invoice creation and validation
- Payment processing
- Journal posting
- Receipt generation
- Credit/Debit notes
- Split payments

This file was the original monolith and has accumulated significant complexity. Extracting focused sub-modules will reduce risk and improve maintainability.

## Acceptance Criteria

**AC1: Module Boundary Extraction**
- Extract invoice-specific logic into `lib/invoices/`
- Extract payment processing into `lib/payments/`
- Extract receipt generation into `lib/receipts/`
- Each sub-module has clear public interface in `index.ts`

**AC2: Type Safety Improvements**
- Replace `as any` casts in `sales.ts` with proper typed queries
- Use Kysely's typed query builders throughout
- Add Zod schemas for all public function parameters

**AC3: Test Coverage**
- Add unit tests for extracted sub-modules
- Maintain 100% passing tests throughout refactor
- No regression in existing invoice/payment flows

## Tasks

- [ ] Create `lib/invoices/` directory with `index.ts`
- [ ] Extract invoice CRUD and validation to `lib/invoices/invoice-service.ts`
- [ ] Extract journal posting to `lib/invoices/posting.ts`
- [ ] Extract credit/debit notes to `lib/invoices/adjustments.ts`
- [ ] Create `lib/payments/` directory with `index.ts`
- [ ] Extract payment processing to `lib/payments/payment-service.ts`
- [ ] Extract split payments to `lib/payments/splits.ts`
- [ ] Create `lib/receipts/` directory with `index.ts`
- [ ] Extract receipt generation to `lib/receipts/receipt-service.ts`
- [ ] Add unit tests for each sub-module
- [ ] Update routes to use new sub-modules
- [ ] Delete or deprecate original `sales.ts`

## Estimated Effort

4 days

## Risk Level

High (core financial module)

## Dependencies

None
