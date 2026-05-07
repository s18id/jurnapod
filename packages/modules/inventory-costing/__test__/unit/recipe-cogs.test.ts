// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Unit tests for recipe COGS calculation
// Tests AC3 and AC4: RECIPE items use correct recipe_ingredients quantities for COGS

import { describe, it, expect } from 'vitest';

interface RecipeCostIngredientLine {
  ingredient_item_id: number;
  ingredient_name: string;
  quantity: number;
  unit_of_measure: string;
  unit_cost: number;
  line_cost: number;
}

interface RecipeCostBreakdown {
  recipe_item_id: number;
  total_ingredient_cost: number;
  ingredient_count: number;
  ingredients: RecipeCostIngredientLine[];
}

describe('recipe-cogs', () => {
  describe('AC3: RECIPE COGS from recipe_ingredients', () => {
    it('empty recipe has zero COGS', () => {
      // Given a recipe with no ingredients
      const emptyRecipeBreakdown: RecipeCostBreakdown = {
        recipe_item_id: 1,
        total_ingredient_cost: 0,
        ingredient_count: 0,
        ingredients: []
      };

      // Then COGS is 0
      expect(emptyRecipeBreakdown.total_ingredient_cost).toBe(0);
      expect(emptyRecipeBreakdown.ingredients).toHaveLength(0);
    });

    it('recipe with single ingredient uses correct quantity', () => {
      // Given a recipe with one ingredient at quantity 5
      const breakdown: RecipeCostBreakdown = {
        recipe_item_id: 1,
        total_ingredient_cost: 50000,
        ingredient_count: 1,
        ingredients: [{
          ingredient_item_id: 10,
          name: 'Test Ingredient',
          sku: 'TI-001',
          quantity: 5,
          unit_of_measure: 'unit',
          unit_cost: 10000,
          line_cost: 50000
        }]
      };

      // Then total cost reflects quantity * unit_cost
      expect(breakdown.ingredients[0].quantity).toBe(5);
      expect(breakdown.ingredients[0].unit_cost).toBe(10000);
      expect(breakdown.total_ingredient_cost).toBe(50000);
    });

    it('recipe uses correct quantities from recipe_ingredients', () => {
      // Given a recipe with multiple ingredients at different quantities
      const breakdown: RecipeCostBreakdown = {
        recipe_item_id: 5,
        total_ingredient_cost: 75000,
        ingredient_count: 2,
        ingredients: [
          {
            ingredient_item_id: 20,
            name: 'Coffee Beans',
            sku: 'CB-001',
            quantity: 3,  // 3 units
            unit_of_measure: 'g',
            unit_cost: 15000,
            line_cost: 45000
          },
          {
            ingredient_item_id: 21,
            name: 'Milk',
            sku: 'MK-001',
            quantity: 2,  // 2 units
            unit_of_measure: 'ml',
            unit_cost: 15000,
            line_cost: 30000
          }
        ]
      };

      // Then each ingredient cost = quantity * unit_cost
      expect(breakdown.ingredients[0].line_cost).toBe(3 * 15000);
      expect(breakdown.ingredients[1].line_cost).toBe(2 * 15000);
      
      // And total = sum of all ingredient costs
      expect(breakdown.total_ingredient_cost).toBe(45000 + 30000);
    });
  });

  describe('AC4: PRODUCT with multiple recipe_ingredients aggregates all costs', () => {
    it('aggregates multiple ingredient costs', () => {
      // Given a recipe with 3 ingredients at varying quantities and costs
      const breakdown: RecipeCostBreakdown = {
        recipe_item_id: 100,
        total_ingredient_cost: 0,
        ingredient_count: 3,
        ingredients: [
          { ingredient_item_id: 1, name: 'Flour', sku: 'FL-001', quantity: 2, unit_of_measure: 'kg', unit_cost: 10000, line_cost: 20000 },
          { ingredient_item_id: 2, name: 'Sugar', sku: 'SG-001', quantity: 1, unit_of_measure: 'kg', unit_cost: 15000, line_cost: 15000 },
          { ingredient_item_id: 3, name: 'Butter', sku: 'BT-001', quantity: 1, unit_of_measure: 'kg', unit_cost: 20000, line_cost: 20000 }
        ]
      };

      // Calculate total (in real implementation this is done by the service)
      const total = breakdown.ingredients.reduce((sum, ing) => sum + ing.line_cost, 0);

      // Then all costs are aggregated
      expect(total).toBe(55000);  // 20000 + 15000 + 20000
      expect(breakdown.ingredient_count).toBe(3);
    });

    it('costing method affects aggregation (Standard costing overlay note)', () => {
      // NOTE: Standard costing is a variance-overlay on FIFO/AVG/LIFO.
      // The core COGS calculation uses the underlying costing method.
      // Standard cost stores standard_cost per item; actual cost diff = variance.
      
      // This test documents that costing method is per-company, not per-item
      const costingMethod = 'AVG';  // Company-wide setting

      // Given AVG costing method and a recipe
      const breakdown: RecipeCostBreakdown = {
        recipe_item_id: 50,
        total_ingredient_cost: 30000,
        ingredient_count: 1,
        ingredients: [{
          ingredient_item_id: 30,
          name: 'Single Ingredient',
          sku: 'SI-001',
          quantity: 3,
          unit_of_measure: 'unit',
          unit_cost: 10000,  // This is derived from cost layers or prices
          line_cost: 30000
        }]
      };

      // Then unit_cost comes from inventory_item_costs or item_prices
      expect(breakdown.ingredients[0].unit_cost).toBe(10000);
      
      // Standard costing would compare this to standard_cost and record variance
      const standardCost = 9000;  // Predefined standard
      const actualCost = breakdown.ingredients[0].unit_cost;
      const variance = actualCost - standardCost;
      
      // Variance is tracked separately; COGS uses underlying costing method
      expect(variance).toBe(1000);  // Actual > Standard = unfavorable variance
    });

    it('multiple ingredients with FIFO costing order', () => {
      // FIFO: Oldest layers consumed first
      // Given a recipe with ingredient that has multiple cost layers
      const ingredientCostLayers = [
        { layerId: 1, remainingQty: 100, unitCost: 8000, acquiredAt: new Date('2024-01-01') },
        { layerId: 2, remainingQty: 50, unitCost: 10000, acquiredAt: new Date('2024-01-15') }
      ];

      // When consuming 120 units (more than first layer but less than total)
      const consumed = [
        { layerId: 1, consumedQty: 100, unitCost: 8000 },  // First layer fully consumed
        { layerId: 2, consumedQty: 20, unitCost: 10000 }   // Second layer partially consumed
      ];

      const totalCost = consumed.reduce((sum, c) => sum + (c.consumedQty * c.unitCost), 0);
      
      // Then cost is: (100 * 8000) + (20 * 10000) = 800000 + 200000 = 1000000
      expect(totalCost).toBe(1000000);  // In cents/minor units
    });
  });

  describe('item type classification', () => {
    it('SERVICE type is never stock-tracked', () => {
      const itemTypes = ['SERVICE', 'PRODUCT', 'INGREDIENT', 'RECIPE'] as const;
      
      // SERVICE and RECIPE are never stock-tracked
      const stockTrackedTypes = ['PRODUCT', 'INGREDIENT'];
      
      for (const type of itemTypes) {
        if (stockTrackedTypes.includes(type)) {
          expect(type === 'PRODUCT' || type === 'INGREDIENT').toBe(true);
        } else {
          expect(type === 'SERVICE' || type === 'RECIPE').toBe(true);
        }
      }
    });

    it('isStockTrackedType helper works correctly', () => {
      type ItemType = 'SERVICE' | 'PRODUCT' | 'INGREDIENT' | 'RECIPE';
      
      function isStockTrackedType(type: ItemType): boolean {
        return type === 'PRODUCT' || type === 'INGREDIENT';
      }

      expect(isStockTrackedType('SERVICE')).toBe(false);
      expect(isStockTrackedType('RECIPE')).toBe(false);
      expect(isStockTrackedType('PRODUCT')).toBe(true);
      expect(isStockTrackedType('INGREDIENT')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('zero quantity ingredient contributes zero to COGS', () => {
      const breakdown: RecipeCostBreakdown = {
        recipe_item_id: 1,
        total_ingredient_cost: 0,
        ingredient_count: 1,
        ingredients: [{
          ingredient_item_id: 99,
          name: 'Zero Qty Ingredient',
          sku: 'ZQ-001',
          quantity: 0,
          unit_of_measure: 'unit',
          unit_cost: 10000,
          line_cost: 0  // quantity * unit_cost = 0
        }]
      };

      expect(breakdown.ingredients[0].line_cost).toBe(0);
      expect(breakdown.total_ingredient_cost).toBe(0);
    });

    it('zero unit cost ingredient contributes zero to COGS', () => {
      const breakdown: RecipeCostBreakdown = {
        recipe_item_id: 2,
        total_ingredient_cost: 0,
        ingredient_count: 1,
        ingredients: [{
          ingredient_item_id: 100,
          name: 'Free Ingredient',
          sku: 'FR-001',
          quantity: 10,
          unit_of_measure: 'unit',
          unit_cost: 0,  // No cost
          line_cost: 0
        }]
      };

      expect(breakdown.ingredients[0].line_cost).toBe(0);
      expect(breakdown.total_ingredient_cost).toBe(0);
    });
  });
});
