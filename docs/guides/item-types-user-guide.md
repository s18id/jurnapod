# Item Types User Guide

## Overview

Jurnapod supports four types of items to help you organize your catalog. This guide explains when to use each type and provides practical examples for coffee shop operations.

---

## The Four Item Types

### 🔧 SERVICE - Non-tangible Offerings

**What is it?**  
Services are things you do for customers, not physical products.

**When to use:**
- Charges for labor or time
- Delivery fees
- Special services

**Examples:**
- Delivery Fee ($5)
- Gift Wrapping Service ($2)
- Event Catering Service (hourly rate)
- Express Service Surcharge

**Inventory:**
- Services are never tracked in inventory (you can't have "3 deliveries in stock")

**Tips:**
- ✅ Use for fees and surcharges
- ✅ Great for add-on services
- ❌ Don't use for physical items

---

### ☕ PRODUCT - Finished Goods (Default)

**What is it?**  
Products are the main items you sell to customers - your menu items and retail goods.

**When to use:**
- Menu items (drinks, food)
- Packaged goods for retail
- Ready-to-eat items
- **This is the default choice for most items**

**Examples:**
- Latte ($4.50)
- Cappuccino ($4.00)
- Croissant ($3.50)
- House Blend Coffee Bag - 250g ($12.00)
- Chocolate Chip Cookie ($2.50)

**Inventory:**
- Currently: No tracking (inventory level 0)
- Future: Optional stock tracking when inventory module is enabled

**Tips:**
- ✅ Default choice for menu items
- ✅ Use for everything you sell regularly
- ✅ Set prices per outlet
- 💡 When inventory level 2 is enabled, products can be made from recipes

---

### 🥛 INGREDIENT - Raw Materials

**What is it?**  
Ingredients are the raw materials you use to make your products.

**When to use:**
- Items you purchase to use in production
- Consumables (cups, lids, straws)
- Raw materials that go into your recipes

**Examples:**
- Coffee Beans - Arabica ($45.00/kg)
- Milk - Whole ($3.50/liter)
- Sugar ($2.00/kg)
- Paper Cups - Medium ($0.15 each)
- Chocolate Syrup ($8.00/bottle)

**Inventory:**
- Currently: Can be created but no tracking
- Future (Level 1): Track stock levels, purchases, usage
- Future (Level 2): Auto-deducted when products are made

**Common Question:**  
**"Can I sell ingredients directly to customers?"**

Yes! The system allows it for flexibility. For example:
- Selling bags of coffee beans retail
- Selling bottles of syrup to wholesale customers

**However**, for retail sales we recommend:
- ✅ Create a PRODUCT item: "Coffee Beans Retail - 250g Bag" ($12.00)
- ✅ Keep INGREDIENT for internal use: "Coffee Beans - Raw" ($45.00/kg)

This keeps your POS menu clean and your inventory accurate.

**Tips:**
- ✅ Use for items you purchase for production
- ✅ Track what goes into making products
- ⚠️ If selling retail, consider creating a separate PRODUCT item
- 💡 Helpful for cost tracking even before inventory module is enabled

---

### 📋 RECIPE - Bill of Materials (BOM)

**What is it?**  
Recipes are formulas that define how to make a product from ingredients.

**When to use:**
- Documenting how products are made
- Planning for inventory level 2 (future)
- Standardizing production

**Examples:**
- Latte Recipe: 1 espresso shot + 250ml milk + 1 pump vanilla
- Cappuccino Recipe: 1 espresso shot + 180ml milk foam
- Chocolate Chip Cookie Recipe: flour + sugar + chocolate chips + butter
- House Blend Coffee Recipe: 60% arabica beans + 40% robusta beans

**Inventory:**
- Currently (Level 0-1): Recipes are for documentation only
- Future (Level 2): Recipes become functional - when you sell a product, ingredients auto-deduct

**Important:**  
- ❌ Don't set prices on RECIPE items (price the PRODUCT instead)
- ❌ Don't sell recipes via POS (sell the PRODUCT)
- ✅ Use recipes to document your formulas
- ✅ Prepare for future inventory automation

**Example Workflow (Future):**
1. Create RECIPE "Latte Recipe"
2. Link to PRODUCT "Latte" ($4.50)
3. When cashier sells 1 Latte via POS:
   - Customer pays $4.50
   - System auto-deducts: 1 espresso shot, 250ml milk from inventory
   - Revenue and cost of goods sold (COGS) recorded automatically

**Tips:**
- 📝 Create recipes now for documentation
- 📝 Will become functional when inventory level 2 is enabled
- ⚠️ System will warn if you try to set a price on a recipe
- 💡 Great for standardization even before automation

---

## Quick Reference Table

| Type | Use For | Has Price? | Tracked in Stock? | POS Sellable? |
|------|---------|-----------|-------------------|---------------|
| SERVICE | Fees, labor, delivery | ✅ Yes | ❌ Never | ✅ Yes |
| PRODUCT | Menu items, retail goods | ✅ Yes | 🔄 Future | ✅ Yes |
| INGREDIENT | Raw materials, consumables | ⚠️ Usually not | 🔄 Future | ⚠️ Flexible |
| RECIPE | Formulas, BOMs | ❌ No | ❌ Never | ❌ No |

**Legend:**
- ✅ Yes - Recommended or required
- ❌ No - Not recommended or not applicable
- ⚠️ Flexible - Allowed but consider alternatives
- 🔄 Future - When inventory module is enabled

---

## Common Scenarios

### Scenario 1: Coffee Shop Menu Setup

**Goal:** Set up a basic coffee shop menu

**Recommended Structure:**

**PRODUCTS** (menu items):
- Espresso ($2.50)
- Americano ($3.00)
- Latte ($4.50)
- Cappuccino ($4.00)
- Croissant ($3.50)

**SERVICES** (if needed):
- Delivery Fee ($5.00)
- Extra Shot ($0.75)

**INGREDIENTS** (for future inventory):
- Coffee Beans - Espresso Blend
- Milk - Whole
- Sugar
- Cups - Small/Medium/Large

**RECIPES** (for documentation):
- Latte Recipe
- Cappuccino Recipe

---

### Scenario 2: Retail + Cafe

**Goal:** Sell both prepared items and packaged goods

**Recommended Structure:**

**PRODUCTS:**
- Latte ($4.50) - prepared item
- Coffee Beans Retail - 250g Bag ($12.00) - retail item
- Branded Mug ($15.00) - retail merchandise

**INGREDIENTS:**
- Coffee Beans - Bulk ($45.00/kg) - for internal use

**Why separate?**
- Retail item has different packaging and pricing
- Ingredient is for making drinks
- Keeps inventory tracking accurate

---

### Scenario 3: Should I sell this ingredient?

**Question:** "I have 'Milk' as an INGREDIENT. Can I sell milk bottles to customers?"

**Options:**

**Option A: Flexible (Current Recommendation)**
- ✅ Keep "Milk - 1L" as INGREDIENT
- ✅ Set a retail price ($4.50)
- ✅ Sell directly via POS
- ✅ Simple, works fine

**Option B: Strict (Best Practice)**
- Create separate items:
  - INGREDIENT: "Milk - Bulk" (internal use, $3.50/L)
  - PRODUCT: "Milk - Retail 1L Bottle" (customer-facing, $4.50)
- Better for:
  - Accurate inventory tracking
  - Different pricing (wholesale vs retail)
  - Cleaner POS menu

**Choose based on your needs!**

---

## Frequently Asked Questions

### Q: What should I choose for my menu items?
**A:** Use **PRODUCT**. It's the default and right choice for 90% of items.

### Q: Can I change an item's type later?
**A:** Yes, you can edit items in the backoffice and change their type.

### Q: I created a recipe but it doesn't do anything?
**A:** Recipes are for documentation in inventory level 0 (current). They'll become functional when inventory level 2 is enabled.

### Q: Should I set a price on ingredients?
**A:** Usually not needed. But if you sell them retail, you can. Consider creating a separate PRODUCT item for retail sales.

### Q: What's the difference between PRODUCT and INGREDIENT?
**A:** 
- **PRODUCT** = What customers buy (Latte, Cookie)
- **INGREDIENT** = What you use to make products (Coffee beans, Flour)

### Q: Can I have items without prices?
**A:** Yes, but they can't be sold via POS. Useful for:
- INGREDIENT items (for internal use only)
- RECIPE items (templates only)
- PRODUCT items you're setting up (can add price later)

### Q: When should I use RECIPE type?
**A:** 
- **Now:** For documentation (standardize formulas)
- **Future:** When inventory level 2 is enabled (automatic ingredient deduction)

---

## Tips for Getting Started

### 1. Start Simple
- Most items should be PRODUCT
- Use SERVICE for fees only
- Add INGREDIENTS and RECIPES later

### 2. Don't Overthink It
- Types can be changed
- All types work in POS currently
- Special behavior comes later with inventory module

### 3. Plan for Growth
- Document recipes now for future automation
- Set up ingredients even if not tracking stock yet
- Your data will be ready when you enable inventory

### 4. Use the Warnings
- The system shows helpful warnings
- "Unusual patterns" aren't errors, just suggestions
- You can ignore warnings if you have a good reason

---

## Need Help?

- **Documentation:** See `docs/adr/ADR-0002-item-types-taxonomy.md`
- **Technical Details:** See code comments in `packages/shared/src/schemas/master-data.ts`
- **Support:** Contact your system administrator

---

**Last Updated:** 2026-02-23  
**Applies to:** Jurnapod v0.1.0+ (Inventory Level 0)
