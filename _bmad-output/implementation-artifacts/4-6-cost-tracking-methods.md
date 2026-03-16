# Story 4.6: Cost Tracking Methods

**Epic:** Items & Catalog - Product Management  
**Status:** backlog → ready-for-dev  
**Priority:** Medium  
**Estimated Effort:** 8-12 hours  
**Created:** 2026-03-16  
**Type:** Technical Debt

---

## Context

The inventory settings page allows selecting costing methods (AVG, FIFO, LIFO), but there's no actual implementation. This story builds the cost tracking infrastructure to support accurate inventory valuation and COGS calculation.

---

## Story

As an **accountant**,  
I want **inventory costs tracked using AVG, FIFO, or LIFO methods**,  
So that **inventory valuation and COGS reflect the chosen accounting method**.

---

## Acceptance Criteria

### Cost Method Configuration

**Given** company inventory settings  
**When** accountant selects costing method (AVG/FIFO/LIFO)  
**Then** all inventory calculations use that method

**Given** different costing methods  
**When** methods are applied to same transactions  
**Then** different costs result (method-specific behavior)

### Average Costing (AVG)

**Given** inventory purchases:
- 100 units @ $10 = $1,000
- 50 units @ $12 = $600  
**When** average cost is calculated  
**Then** avg cost = ($1,000 + $600) / 150 = $10.67 per unit

**Given** average cost is $10.67  
**When** 30 units are sold  
**Then** COGS = 30 × $10.67 = $320.10

### FIFO Costing

**Given** inventory purchases in order:
1. 100 units @ $10
2. 50 units @ $12  
**When** 120 units are sold  
**Then** COGS = (100 × $10) + (20 × $12) = $1,240  
**And** remaining inventory = 30 units @ $12 = $360

### LIFO Costing

**Given** inventory purchases in order:
1. 100 units @ $10
2. 50 units @ $12  
**When** 120 units are sold  
**Then** COGS = (50 × $12) + (70 × $10) = $1,300  
**And** remaining inventory = 30 units @ $10 = $300

### Cost Layer Tracking

**Given** inventory transactions over time  
**When** costs are tracked  
**Then** each purchase creates a cost layer with quantity and unit cost

**Given** inventory is sold  
**When** costs are consumed  
**Then** cost layers are reduced according to costing method

---

## Technical Design

### Database Schema

```sql
-- Migration: 0XXX_create_inventory_cost_layers.sql
CREATE TABLE inventory_cost_layers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  layer_type ENUM('PURCHASE', 'ADJUSTMENT', 'OPENING_BALANCE') DEFAULT 'PURCHASE',
  quantity DECIMAL(10,3) NOT NULL,
  unit_cost DECIMAL(15,4) NOT NULL,
  remaining_quantity DECIMAL(10,3) NOT NULL, -- For FIFO/LIFO tracking
  total_cost DECIMAL(15,4) NOT NULL,
  transaction_id BIGINT UNSIGNED, -- Reference to purchase/adjustment
  transaction_type VARCHAR(50), -- 'PURCHASE_ORDER', 'ADJUSTMENT', etc.
  acquired_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  
  INDEX idx_item_layers (company_id, item_id, acquired_at),
  INDEX idx_remaining (company_id, item_id, remaining_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Track current average cost per item
CREATE TABLE inventory_item_costs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  current_avg_cost DECIMAL(15,4) DEFAULT 0,
  total_quantity DECIMAL(10,3) DEFAULT 0,
  total_value DECIMAL(15,4) DEFAULT 0,
  last_calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  
  UNIQUE KEY uk_company_item (company_id, item_id),
  INDEX idx_item_cost (company_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Cost Calculation Service

```typescript
// packages/modules-inventory/src/costing/cost-calculator.ts

type CostingMethod = 'AVG' | 'FIFO' | 'LIFO';

interface CostLayer {
  id: number;
  companyId: number;
  itemId: number;
  layerType: 'PURCHASE' | 'ADJUSTMENT' | 'OPENING_BALANCE';
  quantity: number;
  unitCost: number;
  remainingQuantity: number;
  totalCost: number;
  acquiredAt: Date;
}

interface CostCalculationResult {
  totalCost: number;
  layersConsumed: Array<{
    layerId: number;
    quantityTaken: number;
    unitCost: number;
    lineCost: number;
  }>;
  newAvgCost?: number; // For AVG method
}

// Main calculator class
export class CostCalculator {
  constructor(
    private method: CostingMethod,
    private companyId: number
  ) {}
  
  async calculateCogs(
    itemId: number,
    quantityToSell: number
  ): Promise<CostCalculationResult> {
    switch (this.method) {
      case 'AVG':
        return this.calculateAvgCost(itemId, quantityToSell);
      case 'FIFO':
        return this.calculateFifoCost(itemId, quantityToSell);
      case 'LIFO':
        return this.calculateLifoCost(itemId, quantityToSell);
      default:
        throw new Error(`Unknown costing method: ${this.method}`);
    }
  }
  
  async addInventory(
    itemId: number,
    quantity: number,
    unitCost: number,
    transactionId: number,
    transactionType: string
  ): Promise<void> {
    // Create new cost layer
    await createCostLayer({
      companyId: this.companyId,
      itemId,
      quantity,
      remainingQuantity: quantity,
      unitCost,
      totalCost: quantity * unitCost,
      transactionId,
      transactionType,
      acquiredAt: new Date()
    });
    
    // Update AVG cost if using AVG method
    if (this.method === 'AVG') {
      await recalculateAvgCost(this.companyId, itemId);
    }
  }
  
  private async calculateAvgCost(
    itemId: number,
    quantity: number
  ): Promise<CostCalculationResult> {
    const currentCost = await getItemCurrentCost(this.companyId, itemId);
    const totalCost = quantity * currentCost.currentAvgCost;
    
    return {
      totalCost,
      layersConsumed: [{
        layerId: 0, // AVG doesn't use layers
        quantityTaken: quantity,
        unitCost: currentCost.currentAvgCost,
        lineCost: totalCost
      }]
    };
  }
  
  private async calculateFifoCost(
    itemId: number,
    quantity: number
  ): Promise<CostCalculationResult> {
    const layers = await getCostLayers(this.companyId, itemId, 'ASC');
    return this.consumeLayers(layers, quantity);
  }
  
  private async calculateLifoCost(
    itemId: number,
    quantity: number
  ): Promise<CostCalculationResult> {
    const layers = await getCostLayers(this.companyId, itemId, 'DESC');
    return this.consumeLayers(layers, quantity);
  }
  
  private async consumeLayers(
    layers: CostLayer[],
    quantityNeeded: number
  ): Promise<CostCalculationResult> {
    const consumed: CostCalculationResult['layersConsumed'] = [];
    let remainingToConsume = quantityNeeded;
    let totalCost = 0;
    
    for (const layer of layers) {
      if (remainingToConsume <= 0) break;
      if (layer.remainingQuantity <= 0) continue;
      
      const takeFromLayer = Math.min(
        remainingToConsume,
        layer.remainingQuantity
      );
      
      const lineCost = takeFromLayer * layer.unitCost;
      totalCost += lineCost;
      
      consumed.push({
        layerId: layer.id,
        quantityTaken: takeFromLayer,
        unitCost: layer.unitCost,
        lineCost
      });
      
      // Update layer remaining quantity
      await updateLayerRemainingQuantity(
        layer.id,
        layer.remainingQuantity - takeFromLayer
      );
      
      remainingToConsume -= takeFromLayer;
    }
    
    if (remainingToConsume > 0) {
      throw new InsufficientInventoryError(
        `Not enough inventory layers to fulfill quantity. Missing: ${remainingToConsume}`
      );
    }
    
    return { totalCost, layersConsumed: consumed };
  }
}

// Helper functions
async function recalculateAvgCost(companyId: number, itemId: number): Promise<void> {
  const layers = await getCostLayers(companyId, itemId);
  
  const totalQty = layers.reduce((sum, l) => sum + l.remainingQuantity, 0);
  const totalValue = layers.reduce(
    (sum, l) => sum + (l.remainingQuantity * l.unitCost),
    0
  );
  
  const avgCost = totalQty > 0 ? totalValue / totalQty : 0;
  
  await upsertItemCost(companyId, itemId, {
    currentAvgCost: avgCost,
    totalQuantity: totalQty,
    totalValue: totalValue
  });
}
```

### Integration Points

1. **Purchase Orders** - When items received, add to cost layers
2. **Stock Adjustments** - Adjust cost layers appropriately
3. **Sales** - Calculate COGS when items sold (Story 4.5)
4. **Inventory Reports** - Show current valuation by method

---

## Implementation Tasks

### 1. Database (1 hour)
- [ ] Migration for `inventory_cost_layers` table
- [ ] Migration for `inventory_item_costs` table
- [ ] Indexes for performance
- [ ] Test migrations on MySQL and MariaDB

### 2. Core Costing Module (3 hours)
- [ ] Create `packages/modules-inventory/src/costing/` module
- [ ] Implement `CostCalculator` class with all three methods
- [ ] Implement cost layer CRUD operations
- [ ] Add average cost recalculation logic
- [ ] Handle edge cases (negative inventory, zero costs)

### 3. Purchase Integration (1.5 hours)
- [ ] Add cost layers when purchase orders received
- [ ] Handle purchase returns (reverse layers)
- [ ] Support purchase price adjustments

### 4. Stock Adjustment Integration (1 hour)
- [ ] Update cost layers on inventory adjustments
- [ ] Handle positive adjustments (add layers)
- [ ] Handle negative adjustments (consume layers)

### 5. API Endpoints (1 hour)
- [ ] `GET /inventory/items/[itemId]/cost-layers` - View cost history
- [ ] `GET /inventory/items/[itemId]/current-cost` - Get current valuation
- [ ] `POST /inventory/cost-layers/recalculate` - Recalculate AVG costs

### 6. UI Updates (1.5 hours)
- [ ] Display cost layers in item details
- [ ] Show current average cost
- [ ] Cost history chart/graph
- [ ] Method selection validation

### 7. Testing (2 hours)
- [ ] Unit tests for each costing method
- [ ] FIFO/LIFO layer consumption tests
- [ ] Average cost recalculation tests
- [ ] Edge case tests (zero qty, negative, etc.)
- [ ] Integration tests with purchases/sales

---

## Files to Create/Modify

### New Files
```
packages/db/migrations/0XXX_create_inventory_cost_layers.sql
packages/db/migrations/0XXX_create_inventory_item_costs.sql
packages/modules-inventory/src/costing/cost-calculator.ts
packages/modules-inventory/src/costing/cost-calculator.test.ts
packages/modules-inventory/src/costing/layer-repository.ts
packages/modules-inventory/src/costing/index.ts
apps/api/app/api/inventory/items/[itemId]/cost-layers/route.ts
apps/api/app/api/inventory/items/[itemId]/current-cost/route.ts
apps/backoffice/src/features/item-cost-history.tsx
```

### Modified Files
```
apps/api/src/lib/purchase-orders.ts
  - Add cost layers on item receipt

apps/api/src/lib/stock.ts
  - Use CostCalculator for COGS (integrate with Story 4.5)

apps/backoffice/src/features/inventory-settings-page.tsx
  - Validate costing method selection

apps/backoffice/src/features/items-prices-page.tsx
  - Show current cost in item list
  - Link to cost history
```

---

## Cost Method Examples

### Scenario: Coffee Inventory
**Purchases:**
- Jan 1: 100 units @ $10.00
- Jan 15: 50 units @ $12.00
- Jan 20: Sell 120 units

**AVG Method:**
- Average = ((100 × $10) + (50 × $12)) / 150 = $10.67
- COGS = 120 × $10.67 = $1,280.40
- Remaining: 30 units @ $10.67 = $320.10

**FIFO Method:**
- From Jan 1 layer: 100 units @ $10 = $1,000
- From Jan 15 layer: 20 units @ $12 = $240
- COGS = $1,240
- Remaining: 30 units @ $12 = $360

**LIFO Method:**
- From Jan 15 layer: 50 units @ $12 = $600
- From Jan 1 layer: 70 units @ $10 = $700
- COGS = $1,300
- Remaining: 30 units @ $10 = $300

---

## Definition of Done

- [ ] All three costing methods implemented
- [ ] Cost layers tracked in database
- [ ] Purchase integration complete
- [ ] Adjustment integration complete
- [ ] API endpoints for cost queries
- [ ] UI shows cost history and current valuation
- [ ] Unit tests for all methods
- [ ] Integration tests passing
- [ ] Documentation updated

---

## Dependencies

- ✅ Inventory settings page (exists)
- ✅ Items table with inventory tracking
- 🔧 Story 4.5: COGS Integration (uses this for cost calculation)
- 🔧 Purchase order system (for adding cost layers)

---

**Story Status:** Ready for Development 🔧  
**Note:** This enhances Story 4.5 (COGS Integration) - can be done in parallel or after
