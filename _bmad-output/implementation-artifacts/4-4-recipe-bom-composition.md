# Story 4.4: Recipe/BOM Composition

**Epic:** Items & Catalog - Product Management  
**Status:** backlog → ready-for-dev  
**Priority:** Medium  
**Estimated Effort:** 4-6 hours  
**Created:** 2026-03-16  
**Type:** Technical Debt  

---

## Context

Epic 4's item type system supports PRODUCT, SERVICE, INGREDIENT, and RECIPE types. While the schema exists, there's no way to define which ingredients make up a recipe or calculate recipe costs.

This story completes the RECIPE type functionality by allowing managers to define recipe compositions (Bill of Materials).

---

## Story

As a **store manager**,  
I want to **define recipes by linking ingredients with quantities**,  
So that **recipe costs are calculated automatically from ingredient costs**.

---

## Acceptance Criteria

### Recipe Composition CRUD

**Given** a RECIPE type item exists  
**When** manager adds ingredients with quantities  
**Then** the recipe composition is saved

**Given** a recipe with ingredients  
**When** manager views the recipe  
**Then** all ingredients with quantities are displayed

**Given** a recipe ingredient  
**When** manager updates the quantity  
**Then** the change is saved and cost recalculated

**Given** a recipe ingredient  
**When** manager removes it  
**Then** it's deleted from the recipe

### Cost Calculation

**Given** a recipe with ingredients  
**When** ingredient costs are known  
**Then** recipe cost = sum(ingredient_qty × ingredient_unit_cost)

**Given** ingredient costs change  
**When** cost is recalculated  
**Then** recipe reflects new total cost

### Validation

**Given** adding an ingredient to a recipe  
**When** the ingredient is the recipe itself (circular)  
**Then** error: "Cannot add recipe as its own ingredient"

**Given** adding an ingredient  
**When** ingredient is not INGREDIENT or PRODUCT type  
**Then** error: "Only ingredients and products can be recipe components"

---

## Technical Design

### Database Schema

```sql
-- Migration: 0XXX_create_recipe_ingredients.sql
CREATE TABLE recipe_ingredients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  recipe_item_id BIGINT UNSIGNED NOT NULL,
  ingredient_item_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(10,3) NOT NULL, -- Allow fractional quantities
  unit_of_measure VARCHAR(20) DEFAULT 'unit', -- kg, liter, piece, etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_item_id) REFERENCES items(id) ON DELETE CASCADE,
  
  -- Prevent duplicate ingredients in same recipe
  UNIQUE KEY uk_recipe_ingredient (company_id, recipe_item_id, ingredient_item_id),
  
  INDEX idx_recipe (company_id, recipe_item_id),
  INDEX idx_ingredient (company_id, ingredient_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API Design

```typescript
// POST /api/inventory/recipes/[recipeId]/ingredients
interface CreateRecipeIngredientRequest {
  ingredient_item_id: number;
  quantity: number;
  unit_of_measure?: string;
}

// GET /api/inventory/recipes/[recipeId]/ingredients
interface RecipeIngredientResponse {
  id: number;
  recipe_item_id: number;
  ingredient_item_id: number;
  ingredient_name: string;
  ingredient_sku: string;
  quantity: number;
  unit_of_measure: string;
  unit_cost: number; // From item's current cost
  total_cost: number; // quantity × unit_cost
  is_active: boolean;
}

// GET /api/inventory/recipes/[recipeId]/cost
interface RecipeCostResponse {
  recipe_item_id: number;
  total_ingredient_cost: number;
  ingredient_count: number;
  ingredients: Array<{
    ingredient_item_id: number;
    name: string;
    quantity: number;
    unit_cost: number;
    line_cost: number;
  }>;
}
```

### Service Layer

```typescript
// apps/api/src/lib/recipe-composition.ts

interface RecipeIngredient {
  id: number;
  companyId: number;
  recipeItemId: number;
  ingredientItemId: number;
  quantity: number;
  unitOfMeasure: string;
  isActive: boolean;
}

interface RecipeCostBreakdown {
  totalCost: number;
  ingredientCount: number;
  ingredients: Array<{
    ingredientItemId: number;
    name: string;
    quantity: number;
    unitCost: number;
    lineCost: number;
  }>;
}

// Core functions
async function addIngredientToRecipe(
  companyId: number,
  recipeItemId: number,
  input: CreateRecipeIngredientInput
): Promise<RecipeIngredient>;

async function updateRecipeIngredient(
  companyId: number,
  ingredientId: number,
  updates: Partial<RecipeIngredient>
): Promise<RecipeIngredient>;

async function removeIngredientFromRecipe(
  companyId: number,
  ingredientId: number
): Promise<void>;

async function getRecipeIngredients(
  companyId: number,
  recipeItemId: number
): Promise<RecipeIngredient[]>;

async function calculateRecipeCost(
  companyId: number,
  recipeItemId: number
): Promise<RecipeCostBreakdown>;

// Validation
async function validateRecipeComposition(
  companyId: number,
  recipeItemId: number,
  ingredientItemId: number
): Promise<{ valid: boolean; error?: string }>;
```

---

## Implementation Tasks

### 1. Database (30 min)
- [ ] Create migration for `recipe_ingredients` table
- [ ] Add indexes for performance
- [ ] Test migration on MySQL and MariaDB

### 2. Service Layer (1.5 hours)
- [ ] Create `recipe-composition.ts` service
- [ ] Implement CRUD operations with transactions
- [ ] Add circular reference detection
- [ ] Implement cost calculation
- [ ] Add audit logging

### 3. API Routes (1 hour)
- [ ] `POST /inventory/recipes/[recipeId]/ingredients`
- [ ] `GET /inventory/recipes/[recipeId]/ingredients`
- [ ] `PATCH /inventory/recipes/ingredients/[ingredientId]`
- [ ] `DELETE /inventory/recipes/ingredients/[ingredientId]`
- [ ] `GET /inventory/recipes/[recipeId]/cost`
- [ ] Add Zod validation schemas

### 4. UI Components (1.5 hours)
- [ ] Recipe composition editor in items page
- [ ] Ingredient search/selector
- [ ] Quantity input with unit selection
- [ ] Cost preview/calculation display
- [ ] Validation error display

### 5. Testing (30 min)
- [ ] Unit tests for service layer
- [ ] API integration tests
- [ ] Test circular reference prevention
- [ ] Test cost calculation accuracy

---

## Files to Create/Modify

### New Files
```
packages/db/migrations/0XXX_create_recipe_ingredients.sql
apps/api/src/lib/recipe-composition.ts
apps/api/src/lib/recipe-composition.test.ts
apps/api/app/api/inventory/recipes/[recipeId]/ingredients/route.ts
apps/api/app/api/inventory/recipes/[recipeId]/ingredients/route.test.ts
apps/api/app/api/inventory/recipes/[recipeId]/cost/route.ts
apps/backoffice/src/features/recipe-composition-editor.tsx
```

### Modified Files
```
apps/backoffice/src/features/items-prices-page.tsx
  - Add "Manage Recipe" button for RECIPE type items
```

---

## Dependencies

- ✅ Item types already implemented
- ✅ Items table exists
- 🔧 Cost tracking (Story 4.6) - can use placeholder costs initially

---

## Dev Notes

### Circular Reference Detection
```typescript
async function detectCircularReference(
  companyId: number,
  recipeId: number,
  ingredientId: number,
  visited: Set<number> = new Set()
): Promise<boolean> {
  if (visited.has(ingredientId)) return true;
  if (ingredientId === recipeId) return true;
  
  visited.add(ingredientId);
  
  // Check if ingredient is itself a recipe
  const ingredient = await getItemById(companyId, ingredientId);
  if (ingredient.item_type === 'RECIPE') {
    const subIngredients = await getRecipeIngredients(companyId, ingredientId);
    for (const sub of subIngredients) {
      if (await detectCircularReference(companyId, recipeId, sub.ingredient_item_id, visited)) {
        return true;
      }
    }
  }
  
  return false;
}
```

### Cost Calculation
```typescript
async function calculateRecipeCost(
  companyId: number,
  recipeId: number
): Promise<RecipeCostBreakdown> {
  const ingredients = await getRecipeIngredients(companyId, recipeId);
  
  const ingredientCosts = await Promise.all(
    ingredients.map(async (ing) => {
      const item = await getItemById(companyId, ing.ingredient_item_id);
      const cost = await getItemCost(companyId, ing.ingredient_item_id); // From Story 4.6
      
      return {
        ingredientItemId: ing.ingredient_item_id,
        name: item.name,
        quantity: ing.quantity,
        unitCost: cost,
        lineCost: ing.quantity * cost
      };
    })
  );
  
  return {
    totalCost: ingredientCosts.reduce((sum, ing) => sum + ing.lineCost, 0),
    ingredientCount: ingredients.length,
    ingredients: ingredientCosts
  };
}
```

---

## Definition of Done

- [ ] Database migration created and tested
- [ ] Service layer with full CRUD operations
- [ ] API endpoints with validation
- [ ] UI for managing recipe composition
- [ ] Circular reference prevention working
- [ ] Cost calculation displaying correctly
- [ ] Tests passing
- [ ] Code review completed
- [ ] Documentation updated

---

**Story Status:** Ready for Development 🔧  
**Next Step:** Delegate to `bmad-dev-story` when ready to implement
