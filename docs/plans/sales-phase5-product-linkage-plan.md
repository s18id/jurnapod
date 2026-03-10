# Phase 5: Product/Item Linkage - Implementation Plan

**Target Agent:** kimi-k2.5  
**Status:** Ready for Implementation  
**Priority:** Medium  
**Effort:** Medium  

## Overview

This plan adds optional item linkage to sales invoice and order lines, enabling product-based invoicing as a foundation for future inventory integration.

### Key Objectives

1. Add `line_type` (SERVICE|PRODUCT) and `item_id` columns to sales line tables
2. Validate that PRODUCT lines have a valid `item_id`
3. Auto-populate description and price from item master when not provided
4. Preserve explicit user overrides for description and price
5. Maintain backward compatibility (existing lines default to SERVICE)

### Scope Boundaries

**In Scope:**
- Database schema changes for `sales_invoice_lines` and `sales_order_lines`
- Shared Zod schema updates
- Sales service business logic
- Order → Invoice conversion alignment
- API response updates
- Tests

**Out of Scope:**
- Inventory stock deduction (deferred to later phase)
- Credit note line item linkage (optional, can be added later)
- UI changes

---

## Part 1: Database Migration

### File: `packages/db/migrations/0077_sales_lines_item_linkage.sql`

Create a new migration file following the idempotent pattern used in this codebase.

#### Pattern Reference

Use the `information_schema` check pattern from `0071_sales_orders.sql` (lines 74-90):

```sql
SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'target_table'
    AND COLUMN_NAME = 'target_column'
);

SET @add_column_sql := IF(
  @column_exists = 0,
  'ALTER TABLE target_table ADD COLUMN ...',
  'SELECT 1'
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;
```

#### Migration Content

```sql
-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Phase 5: Product/Item Linkage
-- Adds line_type and item_id to sales_invoice_lines and sales_order_lines

-- ============================================================
-- sales_invoice_lines: Add line_type column
-- ============================================================
SET @invoice_line_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND COLUMN_NAME = 'line_type'
);

SET @add_invoice_line_type_sql := IF(
  @invoice_line_type_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD COLUMN line_type VARCHAR(16) NOT NULL DEFAULT ''SERVICE'' AFTER line_no',
  'SELECT 1'
);

PREPARE add_invoice_line_type_stmt FROM @add_invoice_line_type_sql;
EXECUTE add_invoice_line_type_stmt;
DEALLOCATE PREPARE add_invoice_line_type_stmt;

-- ============================================================
-- sales_invoice_lines: Add item_id column
-- ============================================================
SET @invoice_item_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND COLUMN_NAME = 'item_id'
);

SET @add_invoice_item_id_sql := IF(
  @invoice_item_id_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD COLUMN item_id BIGINT UNSIGNED DEFAULT NULL AFTER line_type',
  'SELECT 1'
);

PREPARE add_invoice_item_id_stmt FROM @add_invoice_item_id_sql;
EXECUTE add_invoice_item_id_stmt;
DEALLOCATE PREPARE add_invoice_item_id_stmt;

-- ============================================================
-- sales_invoice_lines: Add CHECK constraint for line_type
-- ============================================================
SET @invoice_line_type_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND CONSTRAINT_NAME = 'chk_sales_invoice_lines_line_type'
);

SET @add_invoice_line_type_check_sql := IF(
  @invoice_line_type_check_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD CONSTRAINT chk_sales_invoice_lines_line_type CHECK (line_type IN (''SERVICE'', ''PRODUCT''))',
  'SELECT 1'
);

PREPARE add_invoice_line_type_check_stmt FROM @add_invoice_line_type_check_sql;
EXECUTE add_invoice_line_type_check_stmt;
DEALLOCATE PREPARE add_invoice_line_type_check_stmt;

-- ============================================================
-- sales_invoice_lines: Add index on item_id
-- ============================================================
SET @invoice_item_id_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND INDEX_NAME = 'idx_sales_invoice_lines_item_id'
);

SET @add_invoice_item_id_idx_sql := IF(
  @invoice_item_id_idx_exists = 0,
  'CREATE INDEX idx_sales_invoice_lines_item_id ON sales_invoice_lines (item_id)',
  'SELECT 1'
);

PREPARE add_invoice_item_id_idx_stmt FROM @add_invoice_item_id_idx_sql;
EXECUTE add_invoice_item_id_idx_stmt;
DEALLOCATE PREPARE add_invoice_item_id_idx_stmt;

-- ============================================================
-- sales_invoice_lines: Add FK to items
-- ============================================================
SET @invoice_item_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND CONSTRAINT_NAME = 'fk_sales_invoice_lines_item'
);

SET @add_invoice_item_fk_sql := IF(
  @invoice_item_fk_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD CONSTRAINT fk_sales_invoice_lines_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT',
  'SELECT 1'
);

PREPARE add_invoice_item_fk_stmt FROM @add_invoice_item_fk_sql;
EXECUTE add_invoice_item_fk_stmt;
DEALLOCATE PREPARE add_invoice_item_fk_stmt;

-- ============================================================
-- sales_order_lines: Add line_type column
-- ============================================================
SET @order_line_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND COLUMN_NAME = 'line_type'
);

SET @add_order_line_type_sql := IF(
  @order_line_type_exists = 0,
  'ALTER TABLE sales_order_lines ADD COLUMN line_type VARCHAR(16) NOT NULL DEFAULT ''SERVICE'' AFTER line_no',
  'SELECT 1'
);

PREPARE add_order_line_type_stmt FROM @add_order_line_type_sql;
EXECUTE add_order_line_type_stmt;
DEALLOCATE PREPARE add_order_line_type_stmt;

-- ============================================================
-- sales_order_lines: Add item_id column
-- ============================================================
SET @order_item_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND COLUMN_NAME = 'item_id'
);

SET @add_order_item_id_sql := IF(
  @order_item_id_exists = 0,
  'ALTER TABLE sales_order_lines ADD COLUMN item_id BIGINT UNSIGNED DEFAULT NULL AFTER line_type',
  'SELECT 1'
);

PREPARE add_order_item_id_stmt FROM @add_order_item_id_sql;
EXECUTE add_order_item_id_stmt;
DEALLOCATE PREPARE add_order_item_id_stmt;

-- ============================================================
-- sales_order_lines: Add CHECK constraint for line_type
-- ============================================================
SET @order_line_type_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND CONSTRAINT_NAME = 'chk_sales_order_lines_line_type'
);

SET @add_order_line_type_check_sql := IF(
  @order_line_type_check_exists = 0,
  'ALTER TABLE sales_order_lines ADD CONSTRAINT chk_sales_order_lines_line_type CHECK (line_type IN (''SERVICE'', ''PRODUCT''))',
  'SELECT 1'
);

PREPARE add_order_line_type_check_stmt FROM @add_order_line_type_check_sql;
EXECUTE add_order_line_type_check_stmt;
DEALLOCATE PREPARE add_order_line_type_check_stmt;

-- ============================================================
-- sales_order_lines: Add index on item_id
-- ============================================================
SET @order_item_id_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND INDEX_NAME = 'idx_sales_order_lines_item_id'
);

SET @add_order_item_id_idx_sql := IF(
  @order_item_id_idx_exists = 0,
  'CREATE INDEX idx_sales_order_lines_item_id ON sales_order_lines (item_id)',
  'SELECT 1'
);

PREPARE add_order_item_id_idx_stmt FROM @add_order_item_id_idx_sql;
EXECUTE add_order_item_id_idx_stmt;
DEALLOCATE PREPARE add_order_item_id_idx_stmt;

-- ============================================================
-- sales_order_lines: Add FK to items
-- ============================================================
SET @order_item_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND CONSTRAINT_NAME = 'fk_sales_order_lines_item'
);

SET @add_order_item_fk_sql := IF(
  @order_item_fk_exists = 0,
  'ALTER TABLE sales_order_lines ADD CONSTRAINT fk_sales_order_lines_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT',
  'SELECT 1'
);

PREPARE add_order_item_fk_stmt FROM @add_order_item_fk_sql;
EXECUTE add_order_item_fk_stmt;
DEALLOCATE PREPARE add_order_item_fk_stmt;
```

---

## Part 2: Shared Schemas

### File: `packages/shared/src/schemas/sales.ts`

#### 2.1 Add Line Type Schema

Add after line 43 (after `SalesInvoiceDueTermSchema`):

```typescript
export const SalesLineTypeSchema = z.enum(["SERVICE", "PRODUCT"]).default("SERVICE");
```

#### 2.2 Update SalesInvoiceLineInputSchema

Replace lines 47-51 with:

```typescript
export const SalesInvoiceLineInputSchema = z.object({
  line_type: SalesLineTypeSchema,
  item_id: NumericIdSchema.optional(),
  description: z.string().trim().min(1).max(255),
  qty: z.coerce.number().finite().positive(),
  unit_price: MoneyInputNonNegativeSchema
}).refine((data) => {
  if (data.line_type === "PRODUCT") {
    return typeof data.item_id === "number" && data.item_id > 0;
  }
  return true;
}, {
  message: "Product lines require item_id",
  path: ["item_id"]
});
```

#### 2.3 Update SalesInvoiceLineSchema

Replace lines 85-93 with:

```typescript
export const SalesInvoiceLineSchema = z.object({
  id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  line_no: z.coerce.number().int().positive(),
  line_type: z.enum(["SERVICE", "PRODUCT"]),
  item_id: NumericIdSchema.nullable(),
  description: z.string().min(1),
  qty: z.number().finite().positive(),
  unit_price: MoneySchema.nonnegative(),
  line_total: MoneySchema.nonnegative()
});
```

#### 2.4 Update SalesOrderLineInputSchema

Replace lines 199-203 with:

```typescript
export const SalesOrderLineInputSchema = z.object({
  line_type: SalesLineTypeSchema,
  item_id: NumericIdSchema.optional(),
  description: z.string().trim().min(1).max(255),
  qty: z.coerce.number().finite().positive(),
  unit_price: MoneyInputNonNegativeSchema
}).refine((data) => {
  if (data.line_type === "PRODUCT") {
    return typeof data.item_id === "number" && data.item_id > 0;
  }
  return true;
}, {
  message: "Product lines require item_id",
  path: ["item_id"]
});
```

#### 2.5 Update SalesOrderLineSchema

Replace lines 228-236 with:

```typescript
export const SalesOrderLineSchema = z.object({
  id: NumericIdSchema,
  order_id: NumericIdSchema,
  line_no: z.coerce.number().int().positive(),
  line_type: z.enum(["SERVICE", "PRODUCT"]),
  item_id: NumericIdSchema.nullable(),
  description: z.string().min(1),
  qty: z.number().finite().positive(),
  unit_price: MoneySchema.nonnegative(),
  line_total: MoneySchema.nonnegative()
});
```

#### 2.6 Add Type Export

Add after line 387:

```typescript
export type SalesLineType = z.infer<typeof SalesLineTypeSchema>;
```

---

## Part 3: Sales Service

### File: `apps/api/src/lib/sales.ts`

#### 3.1 Update Type Definitions

**Update `SalesInvoiceLineRow` type (around line 39):**

Add after `line_no`:
```typescript
line_type: "SERVICE" | "PRODUCT";
item_id: number | null;
```

**Update `SalesInvoiceLine` type (around line 132):**

Add after `line_no`:
```typescript
line_type: "SERVICE" | "PRODUCT";
item_id: number | null;
```

**Update `InvoiceLineInput` type (around line 72):**

```typescript
type InvoiceLineInput = {
  line_type?: "SERVICE" | "PRODUCT";
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
};
```

**Update `PreparedInvoiceLine` type (around line 83):**

```typescript
type PreparedInvoiceLine = {
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};
```

**Update `SalesOrderLineRow` type (around line 1566):**

Add after `line_no`:
```typescript
line_type: "SERVICE" | "PRODUCT";
item_id: number | null;
```

**Update `SalesOrderLine` type (around line 1599):**

Add after `line_no`:
```typescript
line_type: "SERVICE" | "PRODUCT";
item_id: number | null;
```

**Update `OrderLineInput` type (around line 1613):**

```typescript
type OrderLineInput = {
  line_type?: "SERVICE" | "PRODUCT";
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
};
```

#### 3.2 Add Item Lookup Helper

Add new function after `ensureUserHasOutletAccess` (around line 423):

```typescript
type ItemLookup = {
  id: number;
  name: string;
  sku: string | null;
  type: string;
  default_price: number | null;
};

async function findItemByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  itemId: number
): Promise<ItemLookup | null> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT i.id, i.name, i.sku, i.item_type as type, 
            (SELECT price FROM item_prices 
             WHERE item_id = i.id AND company_id = i.company_id 
             ORDER BY outlet_id IS NULL DESC, is_active DESC, id ASC 
             LIMIT 1) as default_price
     FROM items i
     WHERE i.id = ? AND i.company_id = ? AND i.is_active = 1
     LIMIT 1`,
    [itemId, companyId]
  );
  return rows[0] ? {
    id: Number(rows[0].id),
    name: rows[0].name,
    sku: rows[0].sku,
    type: rows[0].type,
    default_price: rows[0].default_price !== null ? Number(rows[0].default_price) : null
  } : null;
}

async function validateAndGetItemForLine(
  executor: QueryExecutor,
  companyId: number,
  itemId: number | undefined,
  lineType: "SERVICE" | "PRODUCT"
): Promise<ItemLookup | null> {
  if (lineType !== "PRODUCT") {
    return null;
  }
  
  if (typeof itemId !== "number" || itemId <= 0) {
    throw new DatabaseReferenceError("Product lines require a valid item_id");
  }
  
  const item = await findItemByIdWithExecutor(executor, companyId, itemId);
  if (!item) {
    throw new DatabaseReferenceError("Item not found or not active");
  }
  
  return item;
}
```

#### 3.3 Update normalizeInvoiceLine

Update function (around line 296):

```typescript
function normalizeInvoiceLine(row: SalesInvoiceLineRow): SalesInvoiceLine {
  return {
    id: Number(row.id),
    invoice_id: Number(row.invoice_id),
    line_no: Number(row.line_no),
    line_type: row.line_type,
    item_id: row.item_id !== null ? Number(row.item_id) : null,
    description: row.description,
    qty: Number(row.qty),
    unit_price: Number(row.unit_price),
    line_total: Number(row.line_total)
  };
}
```

#### 3.4 Update listInvoiceLinesWithExecutor

Update function (around line 472):

```typescript
async function listInvoiceLinesWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceLine[]> {
  const [rows] = await executor.execute<SalesInvoiceLineRow[]>(
    `SELECT id, invoice_id, line_no, line_type, item_id, description, qty, unit_price, line_total
     FROM sales_invoice_lines
     WHERE company_id = ?
       AND invoice_id = ?
     ORDER BY line_no ASC`,
    [companyId, invoiceId]
  );

  return rows.map(normalizeInvoiceLine);
}
```

#### 3.5 Update buildInvoiceLines

Replace function (around line 308):

```typescript
function buildInvoiceLines(
  lines: readonly InvoiceLineInput[],
  itemLookups: Map<number, ItemLookup>
): {
  lineRows: PreparedInvoiceLine[];
  subtotal: number;
} {
  const lineRows: PreparedInvoiceLine[] = [];

  for (const [index, line] of lines.entries()) {
    const lineType = line.line_type ?? "SERVICE";
    const itemId = line.item_id ?? null;
    
    let description = line.description;
    let unitPrice = line.unit_price;
    
    // Auto-populate from item if PRODUCT and fields are missing/empty
    if (lineType === "PRODUCT" && itemId !== null) {
      const item = itemLookups.get(itemId);
      if (item) {
        // Only auto-fill if description is empty or whitespace
        if (!description || description.trim() === "") {
          description = item.name;
        }
        // Only auto-fill if unit_price is 0 or not provided
        if (unitPrice === 0 && item.default_price !== null) {
          unitPrice = item.default_price;
        }
      }
    }

    const lineTotal = normalizeMoney(line.qty * unitPrice);
    lineRows.push({
      line_no: index + 1,
      line_type: lineType,
      item_id: itemId,
      description: description.trim(),
      qty: line.qty,
      unit_price: unitPrice,
      line_total: lineTotal
    });
  }

  const subtotal = sumMoney(lineRows.map((line) => line.line_total));
  return { lineRows, subtotal };
}
```

#### 3.6 Update createInvoice

Update the function (starting around line 606). Key changes:

1. After line 639 (after outlet access check), add item validation:

```typescript
// Validate and fetch items for PRODUCT lines
const itemLookups = new Map<number, ItemLookup>();
for (const line of input.lines) {
  const lineType = line.line_type ?? "SERVICE";
  if (lineType === "PRODUCT" && line.item_id) {
    const item = await validateAndGetItemForLine(connection, companyId, line.item_id, lineType);
    if (item) {
      itemLookups.set(item.id, item);
    }
  }
}

const { lineRows, subtotal } = buildInvoiceLines(input.lines, itemLookups);
```

2. Update the INSERT statement for invoice lines (around line 726):

```typescript
if (lineRows.length > 0) {
  const placeholders = lineRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values: Array<string | number | null> = [];
  for (const line of lineRows) {
    values.push(
      invoiceId,
      companyId,
      input.outlet_id,
      line.line_no,
      line.line_type,
      line.item_id,
      line.description,
      line.qty,
      line.unit_price,
      line.line_total
    );
  }

  await connection.execute(
    `INSERT INTO sales_invoice_lines (
       invoice_id,
       company_id,
       outlet_id,
       line_no,
       line_type,
       item_id,
       description,
       qty,
       unit_price,
       line_total
     ) VALUES ${placeholders}`,
    values
  );
}
```

#### 3.7 Update updateInvoice

Similar changes to `createInvoice`:

1. Add item validation after line 849
2. Update `buildInvoiceLines` call to pass item lookups
3. Update DELETE/INSERT to include new columns

#### 3.8 Update Order Functions

**Update `normalizeSalesOrderLineRow` (around line 1703):**

```typescript
function normalizeSalesOrderLineRow(row: SalesOrderLineRow): SalesOrderLine {
  return {
    id: row.id,
    order_id: row.order_id,
    line_no: row.line_no,
    line_type: row.line_type,
    item_id: row.item_id !== null ? Number(row.item_id) : null,
    description: row.description,
    qty: Number(row.qty),
    unit_price: Number(row.unit_price),
    line_total: Number(row.line_total)
  };
}
```

**Update `findOrderLinesByOrderId` (around line 1667):**

```typescript
async function findOrderLinesByOrderId(
  executor: QueryExecutor,
  orderId: number
): Promise<SalesOrderLineRow[]> {
  const [rows] = await executor.execute<SalesOrderLineRow[]>(
    `SELECT id, order_id, line_no, line_type, item_id, description, qty, unit_price, line_total
     FROM sales_order_lines 
     WHERE order_id = ? 
     ORDER BY line_no`,
    [orderId]
  );
  return rows;
}
```

**Update `buildOrderLines` (around line 1628):**

```typescript
function buildOrderLines(
  lines: OrderLineInput[],
  itemLookups: Map<number, ItemLookup>
): Array<{ 
  line_no: number; 
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string; 
  qty: number; 
  unit_price: number; 
  line_total: number 
}> {
  return lines.map((line, index) => {
    const lineType = line.line_type ?? "SERVICE";
    const itemId = line.item_id ?? null;
    
    let description = line.description.trim();
    let unitPrice = normalizeMoney(line.unit_price);
    
    if (lineType === "PRODUCT" && itemId !== null) {
      const item = itemLookups.get(itemId);
      if (item) {
        if (!description || description.trim() === "") {
          description = item.name;
        }
        if (unitPrice === 0 && item.default_price !== null) {
          unitPrice = item.default_price;
        }
      }
    }
    
    const lineTotal = normalizeMoney(line.qty * unitPrice);
    return {
      line_no: index + 1,
      line_type: lineType,
      item_id: itemId,
      description,
      qty: line.qty,
      unit_price: unitPrice,
      line_total: lineTotal
    };
  });
}
```

**Update `createOrder` (around line 1732):**

Add item validation and update INSERT:

```typescript
// After outlet access check, add:
const itemLookups = new Map<number, ItemLookup>();
for (const line of input.lines) {
  const lineType = line.line_type ?? "SERVICE";
  if (lineType === "PRODUCT" && line.item_id) {
    const item = await validateAndGetItemForLine(connection, companyId, line.item_id, lineType);
    if (item) {
      itemLookups.set(item.id, item);
    }
  }
}

const lineRows = buildOrderLines(input.lines, itemLookups);

// Update INSERT statement:
for (const line of lineRows) {
  await connection.execute<ResultSetHeader>(
    `INSERT INTO sales_order_lines (
      order_id,
      company_id,
      outlet_id,
      line_no,
      line_type,
      item_id,
      description,
      qty,
      unit_price,
      line_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      companyId,
      input.outlet_id,
      line.line_no,
      line.line_type,
      line.item_id,
      line.description,
      line.qty,
      line.unit_price,
      line.line_total
    ]
  );
}
```

**Update `updateOrder` (around line 1868):**

Similar changes for item validation and INSERT.

#### 3.9 Update convertOrderToInvoice

Update function (around line 2203) to preserve line_type and item_id:

```typescript
const orderLines = await findOrderLinesByOrderId(connection, orderId);
const invoiceLines = orderLines.map((line, index) => ({
  line_no: index + 1,
  line_type: line.line_type,
  item_id: line.item_id !== null ? Number(line.item_id) : null,
  description: line.description,
  qty: Number(line.qty),
  unit_price: normalizeMoney(Number(line.unit_price)),
  line_total: normalizeMoney(Number(line.line_total))
}));

// Update INSERT:
for (const line of invoiceLines) {
  await connection.execute<ResultSetHeader>(
    `INSERT INTO sales_invoice_lines (
      invoice_id,
      company_id,
      outlet_id,
      line_no,
      line_type,
      item_id,
      description,
      qty,
      unit_price,
      line_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoiceId,
      companyId,
      input.outlet_id,
      line.line_no,
      line.line_type,
      line.item_id,
      line.description,
      line.qty,
      line.unit_price,
      line.line_total
    ]
  );
}
```

---

## Part 4: Tests

### File: `apps/api/src/lib/sales.test.ts` (NEW)

Create comprehensive tests:

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SalesInvoiceLineInputSchema, SalesOrderLineInputSchema } from "@jurnapod/shared";

describe("Phase 5: Product/Item Linkage", () => {
  describe("Schema Validation", () => {
    describe("SalesInvoiceLineInputSchema", () => {
      it("accepts SERVICE line without item_id", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "SERVICE",
          description: "Consulting fee",
          qty: 1,
          unit_price: 100000
        });
        expect(result.success).toBe(true);
      });

      it("accepts PRODUCT line with item_id", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "PRODUCT",
          item_id: 1,
          description: "Coffee beans",
          qty: 2,
          unit_price: 50000
        });
        expect(result.success).toBe(true);
      });

      it("rejects PRODUCT line without item_id", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "PRODUCT",
          description: "Coffee beans",
          qty: 2,
          unit_price: 50000
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe("Product lines require item_id");
        }
      });

      it("defaults line_type to SERVICE", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          description: "Service fee",
          qty: 1,
          unit_price: 100000
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.line_type).toBe("SERVICE");
        }
      });

      it("rejects invalid line_type", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "INVALID",
          description: "Test",
          qty: 1,
          unit_price: 100
        });
        expect(result.success).toBe(false);
      });
    });

    describe("SalesOrderLineInputSchema", () => {
      it("accepts SERVICE line without item_id", () => {
        const result = SalesOrderLineInputSchema.safeParse({
          line_type: "SERVICE",
          description: "Delivery",
          qty: 1,
          unit_price: 10000
        });
        expect(result.success).toBe(true);
      });

      it("accepts PRODUCT line with item_id", () => {
        const result = SalesOrderLineInputSchema.safeParse({
          line_type: "PRODUCT",
          item_id: 5,
          description: "Product A",
          qty: 3,
          unit_price: 25000
        });
        expect(result.success).toBe(true);
      });

      it("rejects PRODUCT line without item_id", () => {
        const result = SalesOrderLineInputSchema.safeParse({
          line_type: "PRODUCT",
          description: "Product A",
          qty: 3,
          unit_price: 25000
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("Database Migration", () => {
    it("should have line_type column on sales_invoice_lines", async () => {
      // Run query to check column exists
      // This would be an integration test
    });

    it("should have item_id column on sales_invoice_lines", async () => {
      // Integration test
    });

    it("should have line_type column on sales_order_lines", async () => {
      // Integration test
    });

    it("should have item_id column on sales_order_lines", async () => {
      // Integration test
    });

    it("existing lines should default to SERVICE type", async () => {
      // Integration test: verify legacy data
    });

    it("migration should be rerunnable without error", async () => {
      // Run migration twice, should not fail
    });
  });

  describe("Invoice Creation with Items", () => {
    it("creates invoice with PRODUCT line linked to item", async () => {
      // Integration test with real DB
    });

    it("auto-fills description from item when empty", async () => {
      // Test that empty description gets populated from item name
    });

    it("preserves explicit description override", async () => {
      // Test that provided description is kept
    });

    it("auto-fills unit_price from item when zero", async () => {
      // Test that 0 unit_price gets populated from item price
    });

    it("preserves explicit unit_price override", async () => {
      // Test that provided unit_price is kept
    });

    it("rejects invalid item_id", async () => {
      // Test that non-existent item_id throws error
    });

    it("rejects item_id from different company", async () => {
      // Test cross-tenant isolation
    });

    it("rejects inactive item_id", async () => {
      // Test that inactive items are rejected
    });
  });

  describe("Invoice Update with Items", () => {
    it("updates line_type and item_id", async () => {
      // Test updating existing line
    });

    it("validates item_id on update", async () => {
      // Test validation during update
    });
  });

  describe("Order Creation with Items", () => {
    it("creates order with PRODUCT line", async () => {
      // Integration test
    });

    it("validates PRODUCT requires item_id", async () => {
      // Test validation
    });
  });

  describe("Order to Invoice Conversion", () => {
    it("preserves line_type during conversion", async () => {
      // Test that line_type is copied
    });

    it("preserves item_id during conversion", async () => {
      // Test that item_id is copied
    });
  });

  describe("API Response Format", () => {
    it("includes line_type in invoice line response", async () => {
      // Test API response shape
    });

    it("includes item_id in invoice line response", async () => {
      // Test API response shape
    });

    it("includes line_type in order line response", async () => {
      // Test API response shape
    });

    it("includes item_id in order line response", async () => {
      // Test API response shape
    });
  });
});
```

---

## Part 5: Documentation Update

### File: `docs/plans/sales-enhancement-roadmap.md`

Update Phase 5 section (lines 155-196):

```markdown
### Phase 5: Product/Item Linkage ✅
**Priority:** Medium  
**Effort:** Medium  
**Status:** Complete

**Implementation:**
- `packages/db/migrations/0077_sales_lines_item_linkage.sql` - Added line_type and item_id columns
- `packages/shared/src/schemas/sales.ts` - Updated line input/output schemas
- `apps/api/src/lib/sales.ts` - Added item validation and auto-population logic

**Database Changes:**
- Added `line_type VARCHAR(16) NOT NULL DEFAULT 'SERVICE'` to `sales_invoice_lines` and `sales_order_lines`
- Added `item_id BIGINT UNSIGNED DEFAULT NULL` to both line tables
- Added CHECK constraints for valid line_type values
- Added FK constraints to `items(id)` with RESTRICT
- Added indexes on `item_id` for query performance

**Schema Updates:**
- `SalesInvoiceLineInputSchema` now includes `line_type` and `item_id`
- `SalesOrderLineInputSchema` now includes `line_type` and `item_id`
- Refinement: PRODUCT lines require valid `item_id`
- Output schemas include new fields

**Features:**
- Optional item selection for invoice/order lines
- When `line_type = PRODUCT`, `item_id` is required
- Auto-populate `description` from item name when empty
- Auto-populate `unit_price` from item price when zero
- Explicit user overrides are preserved
- Cross-tenant item validation enforced
- Inactive items rejected

**Inventory Integration Hooks:**
- `line_type` and `item_id` fields are now available for future inventory deduction
- Stock movement logic should be added in a future phase
- Consider adding `inventory_deducted_at` timestamp in future migration

**Backward Compatibility:**
- Existing lines default to `line_type = 'SERVICE'`
- Existing lines default to `item_id = NULL`
- No breaking changes to API contracts
```

---

## Part 6: Validation Checklist

Before marking complete, verify:

### Database
- [ ] Migration runs successfully on MySQL 8.0+
- [ ] Migration runs successfully on MariaDB
- [ ] Migration is rerunnable (idempotent)
- [ ] Existing lines have `line_type = 'SERVICE'`
- [ ] Existing lines have `item_id = NULL`
- [ ] FK constraints prevent invalid item references
- [ ] CHECK constraints prevent invalid line_type values

### Schemas
- [ ] `SalesInvoiceLineInputSchema` validates correctly
- [ ] `SalesOrderLineInputSchema` validates correctly
- [ ] PRODUCT without item_id is rejected
- [ ] SERVICE without item_id is accepted
- [ ] Default line_type is SERVICE

### Service Layer
- [ ] Item validation works for PRODUCT lines
- [ ] Cross-tenant item access is blocked
- [ ] Inactive items are rejected
- [ ] Description auto-fill works when empty
- [ ] Unit price auto-fill works when zero
- [ ] Explicit overrides are preserved
- [ ] Order → Invoice conversion preserves fields

### API
- [ ] POST /api/sales/invoices accepts new fields
- [ ] PATCH /api/sales/invoices/:id accepts new fields
- [ ] GET /api/sales/invoices returns new fields
- [ ] POST /api/sales/orders accepts new fields
- [ ] PATCH /api/sales/orders/:id accepts new fields
- [ ] GET /api/sales/orders returns new fields
- [ ] POST /api/sales/orders/:id/convert-to-invoice preserves fields

### Tests
- [ ] All schema validation tests pass
- [ ] All service layer tests pass
- [ ] All integration tests pass
- [ ] No regression in existing tests

### Documentation
- [ ] Roadmap updated with completion status
- [ ] Inventory hooks documented for future phase

---

## Execution Order

1. Create migration file → Test on dev DB
2. Update shared schemas → Run typecheck
3. Update sales service types → Run typecheck
4. Update sales service functions → Run typecheck
5. Create test file → Run tests
6. Manual API testing
7. Update documentation
8. Final validation checklist

---

## Notes for Implementer

- Follow existing code patterns exactly (see referenced line numbers)
- Use `normalizeMoney` for all monetary calculations
- Use `withTransaction` for all mutations
- Throw `DatabaseReferenceError` for invalid item references
- Maintain backward compatibility at all times
- Do NOT add inventory stock deduction logic (deferred)
- Test on both MySQL and MariaDB if possible
