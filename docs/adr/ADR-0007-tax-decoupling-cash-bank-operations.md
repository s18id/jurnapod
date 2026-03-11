# ADR-0007: Tax Account Decoupling and Cash/Bank Operations

## Status

Draft

## Context

This ADR addresses two related architectural changes to Jurnapod's accounting module:

### Problem 1: Tax Account Coupling in Account Mappings

Currently, `SALES_TAX` is hardcoded as a required mapping key in:

- `outlet_account_mappings` / `company_account_mappings` tables
- Backoffice account mappings page UI
- API validation in `/settings/outlet-account-mappings`
- Posting logic in `sales-posting.ts` and `sync-push-posting.ts`

This design is inflexible because:

- Companies may not be eligible for tax (e.g., below threshold, exempt)
- Tax rates may vary per transaction line (multiple tax rates)
- Tax configuration lives in the separate tax rates module (`tax_rates` table)
- Single `SALES_TAX` key cannot represent per-rate tax liability accounts

### Problem 2: Manual Journal Reliance for Cash/Bank Operations

Current cash/bank operations (mutations, top-up, withdrawal) rely on:

- Manual journal entry page with freeform line creation
- Quick templates that pre-fill accounts (but still require manual verification)
- No dedicated workflow for common cash/bank operations
- No specialized validation for cash/bank transaction semantics

This creates risk of:
- Human error in balancing entries
- Missing audit trail for specific operation types
- No dedicated UI for forex (foreign exchange) handling

## Decision

### Decision 1: Tax Account Source of Truth = Tax Module

We will **remove `SALES_TAX` dependency from account mappings** and source tax liability accounts entirely from the tax module.

**Implementation:**

1. **Account Mappings Domain**
   - Remove `SALES_TAX` from required keys in API validation
   - Remove `SALES_TAX` row from backoffice account mappings page
   - Keep only `AR`, `SALES_REVENUE`, and `INVOICE_PAYMENT_BANK` as mapping keys

2. **Tax Rates Schema Enhancement**
   - Add `account_id` column to `tax_rates` table (nullable for transition)
   - Each tax rate optionally maps to a payable account for tax liability posting

3. **Posting Logic Changes**
   - `sales-posting.ts`: Read `sales_invoice_taxes` lines, join to `tax_rates` to get per-rate `account_id`
   - `sync-push-posting.ts`: Same pattern using `pos_transaction_taxes`
   - For each tax line, post credit to the mapped tax liability account
   - If taxable document exists but any tax rate lacks a valid account → fail with explicit error (`TAX_ACCOUNT_MISSING`)

4. **Error Handling**
   - Add new error code `TAX_ACCOUNT_MISSING` with clear message: "Tax rate [{code}] has no liability account configured. Configure account in Tax Rates page."
   - Distinguish from generic `OUTLET_ACCOUNT_MAPPING_MISSING`

5. **Backward Compatibility**
   - None. This is a clean cutover (no legacy fallback to `SALES_TAX` mapping)
   - Existing data in `SALES_TAX` mappings becomes unused but can remain in DB

### Decision 2: Dedicated Cash & Bank Operations Page

We will create a new **Cash & Bank** page with:

1. **New Database Table: `cash_bank_transactions`**
   ```sql
   CREATE TABLE cash_bank_transactions (
     id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
     company_id BIGINT UNSIGNED NOT NULL,
     outlet_id BIGINT UNSIGNED NULL,
     transaction_type ENUM('MUTATION', 'TOP_UP', 'WITHDRAWAL', 'FOREX') NOT NULL,
     transaction_date DATE NOT NULL,
     reference VARCHAR(100) NULL,
     description VARCHAR(500) NOT NULL,
     source_account_id BIGINT UNSIGNED NOT NULL,
     destination_account_id BIGINT UNSIGNED NOT NULL,
     amount DECIMAL(18,2) NOT NULL,
     currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
     exchange_rate DECIMAL(18,8) NULL,
     base_amount DECIMAL(18,2) NULL,
     fx_gain_loss DECIMAL(18,2) NULL DEFAULT 0,
     fx_account_id BIGINT UNSIGNED NULL,
     status ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'DRAFT',
     posted_at DATETIME NULL,
     created_by_user_id BIGINT UNSIGNED NULL,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     UNIQUE KEY uq_cash_bank_tx_company_ref (company_id, reference),
     KEY idx_cash_bank_tx_company_date (company_id, transaction_date),
     CONSTRAINT fk_cash_bank_tx_company FOREIGN KEY (company_id) REFERENCES companies(id),
     CONSTRAINT fk_cash_bank_tx_source_account FOREIGN KEY (company_id, source_account_id) REFERENCES accounts(company_id, id),
     CONSTRAINT fk_cash_bank_tx_dest_account FOREIGN KEY (company_id, destination_account_id) REFERENCES accounts(company_id, id)
   ) ENGINE=InnoDB;
   ```

2. **Operation Types**

   | Type | Debit (Dr) | Credit (Cr) | Use Case |
   |------|------------|--------------|----------|
   | `MUTATION` | Destination (cash/bank) | Source (cash/bank) | Transfer between same account type |
   | `TOP_UP` | Bank account | Cash account | Deposit cash to bank |
   | `WITHDRAWAL` | Cash account | Bank account | Withdraw cash from bank |
   | `FOREX` | Destination (converted) | Source (original) + FX gain/loss | Currency exchange |

3. **Journal Effect**
   - Each cash/bank transaction creates a balanced journal batch automatically
   - `doc_type` = `CASH_BANK_{TYPE}` (e.g., `CASH_BANK_TOP_UP`)
   - Lines follow standard debit/credit rules per operation type
   - For FOREX: difference between converted amounts posts to configured FX gain/loss account

4. **API Endpoints**
   - `GET /api/cash-bank-transactions` - List with filters (company/outlet/date/type)
   - `POST /api/cash-bank-transactions` - Create new transaction
   - `POST /api/cash-bank-transactions/:id/post` - Post to journal
   - `POST /api/cash-bank-transactions/:id/void` - Reverse with contra entries

5. **Validation Rules**
   - Source and destination accounts must be different
   - Both accounts must be classified as cash or bank (`type_name` contains 'kas'/'cash'/'bank')
   - Amount must be positive
   - For FOREX: `exchange_rate` required, `currency_code` required, `fx_account_id` optional (if provided, gain/loss posts there)
   - Fiscal year must be open for transaction date

6. **Backoffice UI**
   - New page at `/cash-bank` in Accounting nav group
   - Tabs or SegmentedControl for operation type selection
   - Date picker, reference, description fields
   - Two-select for source/destination accounts (filtered to cash/bank accounts)
   - Amount input with currency selector (default IDR)
   - FOREX panel: exchange rate, converted amount display, FX gain/loss preview
   - "Post" button creates transaction and posts journal in one action
   - Recent transactions table with status badges and void action

7. **Permissions**
   - Same roles as journal creation: OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT
   - Module: `cash_bank` with permission `create`

## Consequences

### Positive

- **Tax flexibility**: Companies can configure zero or many tax rates without account mapping constraints
- **Clear error messages**: Tax-account-missing errors guide users to correct configuration location
- **Specialized cash/bank UX**: Dedicated page reduces manual journal errors
- **Audit trail**: Specific transaction types (MUTATION, TOP_UP, WITHDRAWAL, FOREX) enable better reporting
- **Forex support**: Transaction-level forex with gain/loss posting enables multi-currency workflows

### Negative

- **Migration effort**: Existing `SALES_TAX` mappings become unused; need data cleanup strategy
- **New table/endpoint surface**: Adds to API attack surface; requires thorough auth validation
- **Testing scope**: Must verify journal balance for all operation types and edge cases
- **Forex complexity**: Exchange rate accuracy, rounding, and gain/loss calculation need careful handling

### Technical Debt Addressed

- Removes hardcoded `SALES_TAX` from posting engines
- Provides structured workflow instead of manual journal templates
- Establishes foundation for multi-currency (FOREX) without waiting for full multicurrency infrastructure

## Alternatives Considered

### Alternative 1: Keep SALES_TAX in Account Mappings (Status Quo)

- Rejected because tax rates already have their own configuration domain; duplication creates inconsistency and maintenance burden

### Alternative 2: Use Manual Journal for Cash/Bank Operations

- Rejected because manual journal lacks:
  - Type-specific validation (source ≠ destination)
  - Specialized UI with account filtering
  - Dedicated transaction listing/voiding
  - Audit trail by operation type

### Alternative 3: Full Multi-Currency Infrastructure First

- Rejected because:
  - Requires company-level base currency, periodic revaluation, FX revaluation journal entries
  - Delays cash/bank operations that are business-critical now
  - Transaction-level forex (this ADR) provides immediate value without full revaluation cycle

## Implementation Plan

### Phase 1: Tax Decoupling (Priority: High)

1. Add `account_id` column to `tax_rates` (nullable, via migration)
2. Update `tax-rates` API to accept/account for `account_id`
3. Update backoffice tax rates page to show account selector
4. Remove `SALES_TAX` from account mappings UI and required keys
5. Update posting logic to read tax accounts from tax rates
6. Add `TAX_ACCOUNT_MISSING` error handling
7. Run existing integration tests; add new tests for taxable docs without tax account

### Phase 2: Cash & Bank Page (Priority: High)

1. Create `cash_bank_transactions` table via migration
2. Add API routes for CRUD + post/void
3. Create backoffice page with operation type selector
4. Wire up journal creation on post
5. Add account filtering (cash/bank accounts only)
6. Add FOREX operation panel with exchange rate handling
7. Role/module permission configuration

### Phase 3: Testing & Documentation

1. Integration tests for all operation types
2. E2E tests for backoffice flow
3. Update changelog
4. Document new operation types in user guide

## Related ADRs

- ADR-0001: GL as Source of Truth
- ADR-0003: POS App Boundary
- ADR-0004: Item Pricing Scope

## Reviewers

- [ ] Engineering Lead
- [ ] Product Owner
- [ ] QA Lead

---

*Created: 2026-03-12*
*Owner: Backend Team*
*Target Release: Phase 8+*
