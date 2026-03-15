# Story 3.1: Automatic Journal Entry from POS

## Status: done

## Epic: Epic 3: Accounting - GL Posting & Reports

## Overview

As a **system**,
I want to **automatically create journal entries from POS transactions**,
So that **every sale is recorded in the general ledger**.

## Acceptance Criteria

### AC1: Basic POS Transaction Journal Entry

**Given** a completed POS transaction synced to server  
**When** the transaction is validated  
**Then** journal entries are generated automatically

**Given** a POS sale of $100 cash  
**When** journal entries are created  
**Then** Debit: Cash $100, Credit: Revenue $100 (simplified)

### AC2: Tax Handling

**Given** a POS sale with tax  
**When** journal entries are created  
**Then** tax portion is posted to Liabilities account

### AC3: Discount Handling

**Given** a POS sale with discount  
**When** journal entries are created  
**Then** discount is posted to Sales Discounts (contra-revenue) account

### AC4: Batch Reference

**Given** journal entry creation  
**When** process completes  
**Then** all entries are in a single batch with reference to POS transaction

## Implementation Notes

### Database Changes

- **Migration 0104**: Added discount columns to `pos_transactions` table:
  - `discount_percent DECIMAL(5,2)` - percentage discount
  - `discount_fixed DECIMAL(18,2)` - fixed amount discount  
  - `discount_code VARCHAR(50)` - discount code reference

### Journal Entry Logic (sync-push-posting.ts)

1. **Account Mappings**: Added `SALES_DISCOUNTS` to outlet account mapping keys
2. **Discount Calculation**: 
   - Percent discount: `discount_amount = grossSales * (percent / 100)`
   - Fixed discount: added to percent discount
   - Capped at gross sales amount
3. **Explicit Method**: Discounts create separate journal line (contra-revenue)
4. **Journal Lines**:
   - Debit: Cash/AR/Payment accounts (full payment received)
   - Credit: Sales Revenue (gross amount before discount)
   - Credit: Sales Discounts (discount amount)
   - Credit: Tax Liability (if applicable)

### Sync Flow

1. **POS**: Cart stores `discount_percent`, `discount_fixed`, `discount_code`
2. **Sync Push**: `outbox-sender.ts` sends discount fields in payload
3. **API**: `sync/push/route.ts` stores discount values in `pos_transactions`
4. **Posting**: `sync-push-posting.ts` reads discounts and creates journal lines

## Verification

- [x] Migration created and rerunnable
- [x] API accepts discount fields in sync payload
- [x] Discounts stored in pos_transactions table
- [x] Journal entries include SALES_DISCOUNTS line
- [x] TypeScript compiles without errors
- [x] ESLint passes

## Files Modified

- `packages/db/migrations/0104_pos_transactions_add_discount_columns.sql` - migration
- `apps/api/src/lib/sync-push-posting.ts` - journal entry logic with discount handling
- `apps/api/app/api/sync/push/route.ts` - payload type and INSERT statement
- `apps/pos/src/offline/outbox-sender.ts` - sync payload includes discounts
