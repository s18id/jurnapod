# Story 4.5: COGS Integration with Epic 3

**Epic:** Items & Catalog - Product Management  
**Status:** backlog → ready-for-dev  
**Priority:** High  
**Estimated Effort:** 6-8 hours  
**Created:** 2026-03-16  
**Type:** Technical Debt  
**Dependencies:** Epic 3 (Accounting/GL)

---

## Context

When inventory-tracked items (PRODUCT type with `track_stock=true`) are sold, the system must post Cost of Goods Sold (COGS) journal entries. Currently, sales only post revenue journals - the inventory asset reduction and COGS expense are missing.

This is critical for accurate financial reporting and inventory valuation.

---

## Story

As an **accountant**,  
I want **COGS automatically posted when inventory items are sold**,  
So that **financial statements reflect true inventory costs and profitability**.

---

## Acceptance Criteria

### COGS Posting on Sale

**Given** a sale includes inventory-tracked items  
**When** the sale is completed and posted  
**Then** COGS journal entries are created alongside revenue entries

**Given** a COGS journal entry  
**When** it's posted  
**Then** it debits COGS expense account and credits Inventory Asset account

**Given** multiple inventory items in one sale  
**When** COGS is calculated  
**Then** each item's COGS is calculated separately and summed

### Item-Account Mapping

**Given** an inventory-tracked item  
**When** COGS is posted  
**Then** the system uses the item's configured COGS account

**Given** an item has no COGS account configured  
**When** COGS is posted  
**Then** it falls back to company's default COGS account

**Given** an item has no inventory asset account  
**When** COGS is posted  
**Then** it falls back to company's default Inventory Asset account

### Cost Calculation

**Given** inventory item with tracked costs  
**When** COGS is calculated  
**Then** COGS = quantity_sold × item_unit_cost

**Given** item cost changes over time  
**When** COGS is calculated  
**Then** cost is determined by costing method (AVG/FIFO/LIFO - Story 4.6)

---

## Technical Design

### Database Changes

```sql
-- Add account mapping fields to items table
ALTER TABLE items
ADD COLUMN cogs_account_id BIGINT UNSIGNED NULL AFTER item_type,
ADD COLUMN inventory_asset_account_id BIGINT UNSIGNED NULL AFTER cogs_account_id,
ADD FOREIGN KEY (cogs_account_id) REFERENCES chart_of_accounts(id),
ADD FOREIGN KEY (inventory_asset_account_id) REFERENCES chart_of_accounts(id),
ADD INDEX idx_cogs_account (company_id, cogs_account_id),
ADD INDEX idx_inventory_account (company_id, inventory_asset_account_id);

-- Link stock transactions to journal entries
ALTER TABLE inventory_transactions
ADD COLUMN journal_batch_id BIGINT UNSIGNED NULL AFTER id,
ADD FOREIGN KEY (journal_batch_id) REFERENCES journal_batches(id);
```

### Service Integration

```typescript
// apps/api/src/lib/cogs-posting.ts

interface CogsPostingInput {
  saleId: string;
  companyId: number;
  outletId: number;
  items: Array<{
    itemId: number;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
  saleDate: Date;
  postedBy: number;
}

interface CogsPostingResult {
  success: boolean;
  journalBatchId?: number;
  totalCogs: number;
  errors?: string[];
}

// Main function
async function postCogsForSale(
  input: CogsPostingInput
): Promise<CogsPostingResult>;

// Calculate COGS for sale items
async function calculateSaleCogs(
  companyId: number,
  saleItems: SaleItemRow[]
): Promise<Array<{
  itemId: number;
  quantity: number;
  unitCost: number;
  totalCost: number;
}>>;

// Get accounts for item
async function getItemAccounts(
  companyId: number,
  itemId: number
): Promise<{
  cogsAccountId: number;
  inventoryAssetAccountId: number;
}>;
```

### Integration with Sales Posting

Modify `sales.ts` posting flow:

```typescript
// In apps/api/src/lib/sales.ts

export async function postSale(
  companyId: number,
  outletId: number,
  saleId: string,
  userId: number,
  tx?: PoolConnection
): Promise<void> {
  // ... existing revenue posting logic ...
  
  // NEW: Post COGS for inventory items
  const inventoryItems = saleItems.filter(item => item.track_stock);
  if (inventoryItems.length > 0) {
    const cogsResult = await postCogsForSale({
      saleId,
      companyId,
      outletId,
      items: inventoryItems.map(item => ({
        itemId: item.item_id,
        quantity: item.quantity,
        unitCost: item.unit_cost, // From cost tracking
        totalCost: item.quantity * item.unit_cost
      })),
      saleDate: sale.completed_at,
      postedBy: userId
    });
    
    if (!cogsResult.success) {
      throw new Error(`COGS posting failed: ${cogsResult.errors?.join(', ')}`);
    }
  }
}
```

### Journal Entry Structure

For a sale with:
- 2x Coffee ($2.00 cost each) = $4.00 COGS
- 1x Sandwich ($3.50 cost) = $3.50 COGS
- Total COGS: $7.50

Journal Batch:
```
Batch: COGS-{saleId}
Type: COGS
Status: POSTED
Total Debit: 7.50
Total Credit: 7.50

Lines:
1. Debit  COGS Expense     7.50  (account_id: item.cogs_account_id)
2. Credit Inventory Asset  7.50  (account_id: item.inventory_asset_account_id)
```

---

## Implementation Tasks

### 1. Database (30 min)
- [ ] Migration for account mapping fields on items table
- [ ] Migration for linking stock transactions to journals
- [ ] Test migrations

### 2. Service Layer (2 hours)
- [ ] Create `cogs-posting.ts` service
- [ ] Implement `calculateSaleCogs()` with costing method support
- [ ] Implement `postCogsForSale()` with journal creation
- [ ] Add account fallback logic
- [ ] Integrate with existing sales posting flow

### 3. Account Configuration (1 hour)
- [ ] Add COGS account selection to item form
- [ ] Add Inventory Asset account selection to item form
- [ ] Add company default accounts to settings
- [ ] Validation: accounts must be proper types

### 4. Cost Tracking Integration (1.5 hours)
- [ ] Retrieve item costs from stock system
- [ ] Handle cost not found scenarios
- [ ] Support different costing methods (defer to Story 4.6 if complex)

### 5. Testing (1.5 hours)
- [ ] Unit tests for COGS calculation
- [ ] Integration test: sale posting creates COGS journal
- [ ] Test account fallback logic
- [ ] Test with multiple items
- [ ] Verify journal batch balances

### 6. UI Updates (1 hour)
- [ ] Add account fields to item create/edit form
- [ ] Show COGS preview in item details
- [ ] Add company default account settings

---

## Files to Create/Modify

### New Files
```
packages/db/migrations/0XXX_add_cogs_account_fields_to_items.sql
packages/db/migrations/0XXX_link_stock_transactions_to_journals.sql
apps/api/src/lib/cogs-posting.ts
apps/api/src/lib/cogs-posting.test.ts
```

### Modified Files
```
apps/api/src/lib/sales.ts
  - Integrate COGS posting into sale completion flow

apps/backoffice/src/features/items-prices-page.tsx
  - Add COGS account selector
  - Add Inventory Asset account selector

apps/api/app/api/companies/settings/route.ts
  - Add default COGS account setting
  - Add default Inventory Asset account setting
```

---

## Dependencies

### Required (Blockers)
- ✅ Epic 3: Chart of Accounts implemented
- ✅ Epic 3: Journal posting system working
- ✅ Epic 4: Items with inventory tracking

### Optional (Can defer)
- 🔧 Story 4.6: Cost Tracking Methods (can use simple averaging initially)

---

## Dev Notes

### Account Type Validation
```typescript
// COGS account must be Expense type
// Inventory Asset account must be Asset type

const cogsAccount = await getAccountById(companyId, cogsAccountId);
if (cogsAccount.account_type !== 'EXPENSE') {
  throw new Error('COGS account must be an expense account');
}

const inventoryAccount = await getAccountById(companyId, inventoryAssetAccountId);
if (inventoryAccount.account_type !== 'ASSET') {
  throw new Error('Inventory account must be an asset account');
}
```

### COGS Calculation with AVG Costing
```typescript
async function calculateItemCogs(
  companyId: number,
  itemId: number,
  quantity: number
): Promise<number> {
  // Get average cost from inventory
  const stock = await getInventoryStock(companyId, itemId);
  const avgCost = stock.total_cost / stock.quantity_on_hand;
  
  return quantity * avgCost;
}
```

### Journal Line Creation
```typescript
async function createCogsJournalBatch(
  companyId: number,
  outletId: number,
  saleId: string,
  items: CogsItem[],
  userId: number
): Promise<number> {
  const batchId = await createJournalBatch({
    companyId,
    outletId,
    type: 'COGS',
    description: `COGS for sale ${saleId}`,
    status: 'POSTED',
    postedBy: userId
  });
  
  let totalCogs = 0;
  
  for (const item of items) {
    const accounts = await getItemAccounts(companyId, item.itemId);
    totalCogs += item.totalCost;
    
    // Debit COGS
    await createJournalLine({
      batchId,
      accountId: accounts.cogsAccountId,
      debit: item.totalCost,
      credit: 0,
      description: `COGS: ${item.quantity} x item ${item.itemId}`,
      sourceType: 'SALE',
      sourceId: saleId
    });
  }
  
  // Credit Inventory Asset (single line for total)
  const firstItemAccounts = await getItemAccounts(companyId, items[0].itemId);
  await createJournalLine({
    batchId,
    accountId: firstItemAccounts.inventoryAssetAccountId,
    debit: 0,
    credit: totalCogs,
    description: `Inventory reduction for sale ${saleId}`,
    sourceType: 'SALE',
    sourceId: saleId
  });
  
  return batchId;
}
```

---

## Definition of Done

- [ ] Database migrations for account fields
- [ ] COGS posting service with tests
- [ ] Integration with sales posting flow
- [ ] Item form updated with account selectors
- [ ] Company default account settings
- [ ] COGS journals created and balanced
- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation updated

---

## Related Stories

- Story 3.1: Automatic Journal Entry for POS Sales (completed)
- Story 4.6: Cost Tracking Methods (debt - enhances this)

---

**Story Status:** Ready for Development 🔧  
**Priority:** HIGH - Required for accurate financials  
**Next Step:** Coordinate with Epic 3 team on journal integration
