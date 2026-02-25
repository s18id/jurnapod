# Payment Method Defaults Implementation

## Overview
This document describes the implementation of default payment method flags for `outlet_payment_method_mappings`, allowing outlets to configure default payment methods for invoice payments and POS transactions.

## Implementation Approach
Instead of adding a `CASH_BANK` key to `outlet_account_mappings` (which was the original plan), we enhanced the existing `outlet_payment_method_mappings` table with default flags. This approach:

1. ✅ Leverages the existing flexible payment method mapping system
2. ✅ Avoids creating redundant mapping tables
3. ✅ Provides better UX with explicit default selections
4. ✅ Maintains backward compatibility

## Database Changes

### Migration: `0027_outlet_payment_default_flags.sql`
Added one new column to `outlet_payment_method_mappings`:

- `is_invoice_default TINYINT(1) NOT NULL DEFAULT 0` - Indicates the default payment method for backoffice invoice payments

Index added for efficient querying:
```sql
CREATE INDEX idx_outlet_payment_invoice_default 
  ON outlet_payment_method_mappings(company_id, outlet_id, is_invoice_default);
```

**Validation:** Only one payment method can be marked as invoice default per outlet. This is enforced at the application level for better error messaging.

**Note:** No POS default is needed since cashiers manually select payment methods at the point of sale.

## API Changes

### `/api/outlet-payment-method-mappings` (GET/PUT)

**Updated Request Schema:**
```typescript
{
  outlet_id: number,
  mappings: Array<{
    method_code: string,
    account_id: number,
    label?: string,
    is_invoice_default?: boolean  // NEW
  }>
}
```

**Validation Rules:**
1. Only one mapping can have `is_invoice_default: true` per outlet
2. All accounts must have `is_payable = 1`

**Error Codes:**
- `MULTIPLE_INVOICE_DEFAULTS` - Multiple methods marked as invoice default
- `INVALID_PAYMENT_ACCOUNT` - Account not eligible for payments

## Frontend Changes

### 1. Settings UI (`apps/backoffice/src/features/account-mappings-page.tsx`)

Added one new column to the payment method mappings table:
- **Invoice Default** - Checkbox to mark method as default for invoice payments

UI includes helpful description:
- "Pre-selected payment account when creating sales payments in backoffice. Cashiers will manually select payment methods in POS."

### 2. Sales Payments UI (`apps/backoffice/src/features/sales-payments-page.tsx`)

**Auto-selection behavior:**
- When creating a new payment, the `account_id` field is automatically populated with the invoice default payment method (if configured)
- Users can still manually select a different account from the dropdown

**Warning message:**
- If no invoice default is configured, a helpful warning banner appears:
  ```
  ℹ️ No invoice default payment method configured. 
     Please set a default in Settings → Payment Methods.
  ```

### 3. TypeScript Type Updates

Updated `PaymentMethodMapping` type in `use-outlet-payment-method-mappings.ts`:
```typescript
export type PaymentMethodMapping = {
  method_code: string;
  account_id: number;
  label?: string;
  is_invoice_default?: boolean;  // NEW
};
```

## Current System Architecture

### Payment Flow for Sales Payments
1. **User selects or auto-fills account** from payment methods marked as `is_invoice_default`
2. **Payment record created** with direct `account_id` reference
3. **Posting to journal** uses the `account_id` from payment record (no lookup needed)
4. **Journal entries:**
   - DEBIT: Cash/Bank account (from `payment.account_id`)
   - CREDIT: AR account (from `outlet_account_mappings`)

### Payment Flow for POS Transactions
1. **POS uses payment method codes** (e.g., CASH, QRIS, CARD_BCA)
2. **Sync process looks up account** from `outlet_payment_method_mappings`
3. **Fallback behavior:** If not found in mappings, checks `outlet_account_mappings` for legacy CASH/QRIS/CARD keys
4. **Posting to journal** uses looked-up account IDs

## Key Files Modified

### Database
- `packages/db/migrations/0027_outlet_payment_default_flags.sql` - New migration

### API
- `apps/api/app/api/outlet-payment-method-mappings/route.ts` - Added default flag support and validation

### Hooks
- `apps/backoffice/src/hooks/use-outlet-payment-method-mappings.ts` - Updated type definitions

### UI Components
- `apps/backoffice/src/features/account-mappings-page.tsx` - Added default flag checkboxes
- `apps/backoffice/src/features/sales-payments-page.tsx` - Added auto-selection and warning banner

## Testing

### Automated Tests
Created `test-payment-defaults.mjs` to verify:
1. ✅ Fetch payment method mappings with default flag
2. ✅ Update mappings with default flag
3. ✅ Validation rejects multiple invoice defaults

Run with:
```bash
API_BASE=http://localhost:3001/api node test-payment-defaults.mjs
```

### Manual Testing Checklist
- [ ] Configure invoice default in Settings → Payment Methods
- [ ] Verify auto-selection when creating sales payment
- [ ] Verify warning appears when no default is configured
- [ ] Change default and verify new selection is used
- [ ] Attempt to set multiple defaults (should be rejected with clear error)

## Migration Path (if needed)

If you have existing outlets with CASH/QRIS mappings in `outlet_account_mappings`:

1. **Query existing mappings:**
   ```sql
   SELECT outlet_id, mapping_key, account_id 
   FROM outlet_account_mappings 
   WHERE mapping_key IN ('CASH', 'QRIS');
   ```

2. **Create payment method mappings:**
   ```sql
   INSERT INTO outlet_payment_method_mappings 
     (company_id, outlet_id, method_code, account_id, is_invoice_default)
   SELECT company_id, outlet_id, mapping_key, account_id, 1
   FROM outlet_account_mappings
   WHERE mapping_key = 'CASH'
   ON DUPLICATE KEY UPDATE is_invoice_default = 1;
   ```

3. **Optionally remove legacy keys** (after verifying POS still works):
   ```sql
   DELETE FROM outlet_account_mappings 
   WHERE mapping_key IN ('CASH', 'QRIS', 'CARD');
   ```

## Benefits of This Approach

1. **Unified System:** All payment methods use `outlet_payment_method_mappings`
2. **Flexible:** Support any payment method code without DB schema changes
3. **Clear Defaults:** Explicit flags make default selection transparent
4. **Better UX:** Auto-selection reduces manual data entry
5. **Backward Compatible:** Existing POS flows continue to work
6. **Scalable:** Easy to add more default types in the future (e.g., `is_ecommerce_default`)

## Future Enhancements

Potential improvements:
- [ ] Add additional default types if needed (e.g., `is_ecommerce_default` for online sales)
- [ ] Support multiple defaults per context (e.g., different defaults per user role)
- [ ] Add payment method ordering/priority for POS display
- [ ] Add payment method icons/colors for better UX
- [ ] Track usage statistics per payment method

## Related Documents

- Original plan: `docs/CASH_BANK_MAPPING_PLAN.md` (superseded by this implementation)
- Agent guidelines: `AGENTS.md`
- Database schema: `packages/db/migrations/`
