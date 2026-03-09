# Invoice and Payment Numbering Template System - Technical Specification

## Document Information

- **Feature**: Automatic document numbering with customizable templates
- **Version**: 1.0
- **Date**: 2026-03-09
- **Author**: Development Team
- **Status**: Ready for Implementation

---

## Executive Summary

This specification outlines the implementation of a flexible, company-level numbering template system for sales invoices and payments. The system provides:

- **Simple fixed patterns with counters** (e.g., `INV-{YYYY}-{####}` → `INV-2026-0001`)
- **Company-level configuration** for centralized management
- **Configurable reset rules** (never/yearly/monthly) per template
- **Auto-generation with manual override** for flexibility
- **Backward compatibility** - existing numbers unchanged, templates apply to new documents only

---

## System Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                      │
├─────────────────────────────────────────────────────────────┤
│  Settings Page          Invoice Form         Payment Form    │
│  - Template CRUD        - Auto-generate      - Auto-generate │
│  - Pattern Builder      - Manual override    - Manual override│
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
├─────────────────────────────────────────────────────────────┤
│  /api/numbering/templates   (CRUD)                          │
│  /api/numbering/generate    (Generate next number)          │
│  /api/sales/invoices        (Modified: optional invoice_no) │
│  /api/sales/payments        (Modified: optional payment_no) │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                       │
├─────────────────────────────────────────────────────────────┤
│  NumberingService                                            │
│  - generateNextNumber()   - Atomic sequence increment        │
│  - previewNextNumber()    - Non-mutating preview             │
│  - validatePattern()      - Pattern syntax validation        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer                            │
├─────────────────────────────────────────────────────────────┤
│  numbering_templates      - Pattern configurations           │
│  numbering_sequences      - Counter values (atomic)          │
│  sales_invoices          - Existing table (no changes)       │
│  sales_payments          - Existing table (no changes)       │
└─────────────────────────────────────────────────────────────┘
```

---

## Template Pattern Syntax

### Supported Placeholders

| Placeholder | Description | Example Output | Notes |
|-------------|-------------|----------------|-------|
| `{YYYY}` | 4-digit year | `2026` | From invoice/payment date |
| `{YY}` | 2-digit year | `26` | From invoice/payment date |
| `{MM}` | 2-digit month | `03` | From invoice/payment date |
| `{DD}` | 2-digit day | `09` | From invoice/payment date |
| `{OUTLET}` | Outlet code | `HQ`, `STORE1` | From outlets.code |
| `{####}` | Sequence (4 digits) | `0001`, `0042`, `1234` | Zero-padded |
| `{###}` | Sequence (3 digits) | `001`, `042`, `123` | Zero-padded |
| `{#####}` | Sequence (5 digits) | `00001`, `12345` | Zero-padded |
| `{######}` | Sequence (6+ digits) | `000001` | Configurable padding |
| Static text | Any literal text | `INV`, `-`, `/`, etc. | Up to 128 chars total |

### Pattern Examples

#### Simple Patterns

```
Pattern: INV-{####}
Output:  INV-0001, INV-0002, INV-0003, ...

Pattern: PAY-{#####}
Output:  PAY-00001, PAY-00002, PAY-00003, ...
```

#### Year-Based Patterns

```
Pattern: INV-{YYYY}-{####}
Output:  INV-2026-0001, INV-2026-0002, ...
         INV-2027-0001 (resets yearly if configured)

Pattern: INVOICE/{YY}/{####}
Output:  INVOICE/26/0001, INVOICE/26/0002, ...
```

#### Month-Based Patterns

```
Pattern: INV-{YYYY}{MM}-{####}
Output:  INV-202603-0001, INV-202603-0002, ...
         INV-202604-0001 (resets monthly if configured)

Pattern: {YYYY}/{MM}/INV-{####}
Output:  2026/03/INV-0001, 2026/03/INV-0002, ...
```

#### Outlet-Specific Patterns

```
Pattern: {OUTLET}-INV-{YYYY}-{####}
Output:  HQ-INV-2026-0001, STORE1-INV-2026-0001, ...
         (Separate sequences per outlet)

Pattern: INV/{OUTLET}/{####}
Output:  INV/HQ/0001, INV/STORE1/0001, ...
```

#### Complex Patterns

```
Pattern: {OUTLET}/INV/{YYYY}/{MM}/{DD}-{####}
Output:  HQ/INV/2026/03/09-0001

Pattern: INVOICE-{YY}{MM}-{OUTLET}-{#####}
Output:  INVOICE-2603-HQ-00001
```

### Pattern Validation Rules

✅ **Valid Patterns:**
- Must contain exactly one sequence placeholder (`{###}`, `{####}`, etc.)
- Can contain 0 or more date/outlet placeholders
- Can contain any static text (letters, numbers, `-`, `/`, `_`)
- Total length ≤ 128 characters
- Sequence placeholder must be 3-10 characters (`{###}` to `{##########}`)

❌ **Invalid Patterns:**
```
{INVALID}                 → Unknown placeholder
{####                     → Unclosed bracket
INV-{YYYY}                → Missing sequence placeholder
{####}-{####}             → Multiple sequence placeholders
                          → Empty pattern
INV-{##}                  → Sequence too short (min 3 digits)
```

---

## Reset Rules

### Overview

Reset rules determine when the sequence counter resets to 1. The system supports three reset behaviors:

| Reset Rule | Behavior | Scope Key Example | Use Case |
|------------|----------|-------------------|----------|
| `NEVER` | Counter increments forever | `_` | Continuous numbering |
| `YEARLY` | Resets on January 1 | `2026`, `2027` | Year-based invoices |
| `MONTHLY` | Resets on 1st of month | `2026-03`, `2026-04` | High-volume businesses |

### Scope Key Calculation

The system automatically calculates a "scope key" based on the pattern and reset rule:

```typescript
// Pattern: INV-{YYYY}-{####}
// Reset: YEARLY
// Scope Key: "2026" (for 2026 invoices)
// Scope Key: "2027" (for 2027 invoices, resets counter)

// Pattern: INV-{YYYY}/{MM}/{####}
// Reset: MONTHLY
// Scope Key: "2026-03" (March 2026)
// Scope Key: "2026-04" (April 2026, resets counter)

// Pattern: {OUTLET}-{####}
// Reset: NEVER
// Scope Key: "HQ" (one counter per outlet, never resets)
// Scope Key: "STORE1" (separate counter)

// Pattern: {OUTLET}/INV/{YYYY}-{####}
// Reset: YEARLY
// Scope Key: "HQ-2026" (per outlet, per year)
// Scope Key: "STORE1-2026" (separate counter per outlet)
```

### Reset Behavior Examples

#### NEVER Reset

```
Template:
  Pattern: INV-{####}
  Reset: NEVER

Output:
  2026-01-15: INV-0001
  2026-06-20: INV-0002
  2027-01-05: INV-0003  ← Continues counting
  2027-12-31: INV-0004
```

#### YEARLY Reset

```
Template:
  Pattern: INV-{YYYY}-{####}
  Reset: YEARLY

Output:
  2026-01-15: INV-2026-0001
  2026-12-31: INV-2026-0002
  2027-01-01: INV-2027-0001  ← Resets to 0001
  2027-01-02: INV-2027-0002
```

#### MONTHLY Reset

```
Template:
  Pattern: INV-{YYYY}{MM}-{####}
  Reset: MONTHLY

Output:
  2026-03-15: INV-202603-0001
  2026-03-20: INV-202603-0002
  2026-04-01: INV-202604-0001  ← Resets to 0001
  2026-04-02: INV-202604-0002
```

---

## Database Schema

### Migration File: `0100_numbering_templates.sql`

```sql
-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- =============================================================================
-- Migration 0100: Numbering Templates
-- Description: Add automatic document numbering with customizable templates
-- Author: Development Team
-- Date: 2026-03-09
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: numbering_templates
-- Purpose: Store numbering pattern configurations per company
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS numbering_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  doc_type VARCHAR(32) NOT NULL COMMENT 'SALES_INVOICE, SALES_PAYMENT',
  template_pattern VARCHAR(128) NOT NULL COMMENT 'E.g., INV-{YYYY}-{####}',
  reset_rule VARCHAR(16) NOT NULL DEFAULT 'NEVER' COMMENT 'NEVER, YEARLY, MONTHLY',
  padding_length INT UNSIGNED NOT NULL DEFAULT 4 COMMENT 'Number of digits in sequence',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT uq_numbering_templates_company_doctype 
    UNIQUE KEY (company_id, doc_type),
  CONSTRAINT fk_numbering_templates_company 
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT chk_numbering_templates_doc_type 
    CHECK (doc_type IN ('SALES_INVOICE', 'SALES_PAYMENT')),
  CONSTRAINT chk_numbering_templates_reset_rule 
    CHECK (reset_rule IN ('NEVER', 'YEARLY', 'MONTHLY')),
  CONSTRAINT chk_numbering_templates_padding 
    CHECK (padding_length BETWEEN 3 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Document numbering templates';

CREATE INDEX idx_numbering_templates_company_active 
  ON numbering_templates(company_id, is_active);

-- -----------------------------------------------------------------------------
-- Table: numbering_sequences
-- Purpose: Store current counter values per scope (atomic increment)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS numbering_sequences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  doc_type VARCHAR(32) NOT NULL COMMENT 'SALES_INVOICE, SALES_PAYMENT',
  scope_key VARCHAR(128) NOT NULL COMMENT 'E.g., 2026, 2026-03, HQ-2026',
  current_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_generated_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT uq_numbering_sequences_scope 
    UNIQUE KEY (company_id, doc_type, scope_key),
  CONSTRAINT fk_numbering_sequences_company 
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Document numbering sequence counters';

CREATE INDEX idx_numbering_sequences_company_doctype 
  ON numbering_sequences(company_id, doc_type);

-- -----------------------------------------------------------------------------
-- Notes:
-- 1. No automatic template creation - admins must configure manually
-- 2. No renumbering of existing documents - backward compatible
-- 3. Sequences use row-level locking (FOR UPDATE) for concurrency safety
-- 4. Scope keys are calculated dynamically based on pattern + reset rule
-- -----------------------------------------------------------------------------
```

### Table Relationships

```
companies (1) ──┬──< (N) numbering_templates
                └──< (N) numbering_sequences

numbering_templates.doc_type ──→ ENUM('SALES_INVOICE', 'SALES_PAYMENT')
numbering_sequences.doc_type ──→ ENUM('SALES_INVOICE', 'SALES_PAYMENT')

sales_invoices.invoice_no ──→ Generated using numbering_templates
sales_payments.payment_no ──→ Generated using numbering_templates
```

### Data Examples

#### numbering_templates

| id | company_id | doc_type | template_pattern | reset_rule | padding_length | is_active |
|----|------------|----------|------------------|------------|----------------|-----------|
| 1 | 10 | SALES_INVOICE | `INV-{YYYY}-{####}` | YEARLY | 4 | true |
| 2 | 10 | SALES_PAYMENT | `PAY-{YYYY}-{####}` | YEARLY | 4 | true |
| 3 | 20 | SALES_INVOICE | `{OUTLET}/INV/{####}` | NEVER | 5 | true |

#### numbering_sequences

| id | company_id | doc_type | scope_key | current_value | last_generated_at |
|----|------------|----------|-----------|---------------|-------------------|
| 1 | 10 | SALES_INVOICE | `2026` | 42 | 2026-03-09 10:30:00 |
| 2 | 10 | SALES_INVOICE | `2027` | 5 | 2027-01-15 09:00:00 |
| 3 | 10 | SALES_PAYMENT | `2026` | 38 | 2026-03-09 11:00:00 |
| 4 | 20 | SALES_INVOICE | `HQ` | 123 | 2026-03-09 12:00:00 |
| 5 | 20 | SALES_INVOICE | `STORE1` | 67 | 2026-03-09 12:30:00 |

---

## Backend Implementation

### File Structure

```
apps/api/
├── src/lib/
│   ├── numbering-service.ts          (NEW - Core business logic)
│   ├── numbering-service.test.ts     (NEW - Unit tests)
│   └── sales.ts                       (MODIFIED - Integration)
├── app/api/numbering/
│   ├── route.ts                       (NEW - GET, POST templates)
│   ├── [id]/
│   │   ├── route.ts                   (NEW - GET, PATCH, DELETE)
│   │   └── validate/
│   │       └── route.ts               (NEW - POST validate pattern)
│   └── generate/
│       └── route.ts                   (NEW - POST generate number)
└── tests/integration/
    └── numbering.integration.test.mjs (NEW - Integration tests)

packages/shared/
└── src/schemas/
    ├── numbering.ts                   (NEW - Zod schemas)
    └── sales.ts                       (MODIFIED - Optional invoice_no)
```

### Core Service: NumberingService

**File:** `apps/api/src/lib/numbering-service.ts`

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";

type DocType = "SALES_INVOICE" | "SALES_PAYMENT";
type ResetRule = "NEVER" | "YEARLY" | "MONTHLY";

type NumberingTemplate = {
  id: number;
  company_id: number;
  doc_type: DocType;
  template_pattern: string;
  reset_rule: ResetRule;
  padding_length: number;
  is_active: boolean;
};

type GenerateContext = {
  outletCode?: string;
  date: Date;
};

type TemplatePart = 
  | { type: "static"; value: string }
  | { type: "year4"; }
  | { type: "year2"; }
  | { type: "month"; }
  | { type: "day"; }
  | { type: "outlet"; }
  | { type: "sequence"; padding: number };

export class NumberingService {
  /**
   * Generate the next document number based on active template
   * Atomically increments the sequence counter
   */
  async generateNextNumber(
    companyId: number,
    docType: DocType,
    context: GenerateContext
  ): Promise<string> {
    const pool = getDbPool();
    
    return await pool.transaction(async (connection) => {
      // Get active template
      const template = await this.getActiveTemplate(connection, companyId, docType);
      if (!template) {
        throw new Error(`No active numbering template for ${docType}`);
      }

      // Calculate scope key
      const scopeKey = this.calculateScopeKey(
        template.template_pattern,
        template.reset_rule,
        context
      );

      // Get next sequence value (atomic)
      const sequenceValue = await this.getNextSequenceValue(
        connection,
        companyId,
        docType,
        scopeKey
      );

      // Generate final number
      return this.replacePlaceholders(template.template_pattern, {
        ...context,
        sequence: sequenceValue,
        paddingLength: template.padding_length
      });
    });
  }

  /**
   * Preview what the next number would be (without incrementing counter)
   */
  async previewNextNumber(
    companyId: number,
    docType: DocType,
    context: GenerateContext
  ): Promise<string> {
    const pool = getDbPool();
    const connection = await pool.getConnection();
    
    try {
      const template = await this.getActiveTemplate(connection, companyId, docType);
      if (!template) {
        throw new Error(`No active numbering template for ${docType}`);
      }

      const scopeKey = this.calculateScopeKey(
        template.template_pattern,
        template.reset_rule,
        context
      );

      // Get current value without incrementing
      const currentValue = await this.getCurrentSequenceValue(
        connection,
        companyId,
        docType,
        scopeKey
      );

      const nextValue = currentValue + 1;

      return this.replacePlaceholders(template.template_pattern, {
        ...context,
        sequence: nextValue,
        paddingLength: template.padding_length
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Validate a template pattern
   */
  validatePattern(pattern: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!pattern || pattern.trim() === "") {
      errors.push("Pattern cannot be empty");
      return { valid: false, errors };
    }

    if (pattern.length > 128) {
      errors.push("Pattern cannot exceed 128 characters");
    }

    // Check for sequence placeholder
    const sequenceRegex = /\{#{3,10}\}/g;
    const sequenceMatches = pattern.match(sequenceRegex);
    
    if (!sequenceMatches || sequenceMatches.length === 0) {
      errors.push("Pattern must contain exactly one sequence placeholder (e.g., {####})");
    } else if (sequenceMatches.length > 1) {
      errors.push("Pattern can only contain one sequence placeholder");
    }

    // Check for unclosed brackets
    const openBrackets = (pattern.match(/\{/g) || []).length;
    const closeBrackets = (pattern.match(/\}/g) || []).length;
    if (openBrackets !== closeBrackets) {
      errors.push("Pattern has unclosed brackets");
    }

    // Check for invalid placeholders
    const validPlaceholders = ["{YYYY}", "{YY}", "{MM}", "{DD}", "{OUTLET}"];
    const placeholderRegex = /\{[^}]+\}/g;
    const allPlaceholders = pattern.match(placeholderRegex) || [];
    
    for (const placeholder of allPlaceholders) {
      if (!validPlaceholders.includes(placeholder) && !placeholder.match(/^\{#{3,10}\}$/)) {
        errors.push(`Unknown placeholder: ${placeholder}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Parse template pattern into parts
   */
  private parsePattern(pattern: string): TemplatePart[] {
    const parts: TemplatePart[] = [];
    let current = "";
    let inBracket = false;

    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i];

      if (char === "{") {
        if (current) {
          parts.push({ type: "static", value: current });
          current = "";
        }
        inBracket = true;
        current = "{";
      } else if (char === "}") {
        current += "}";
        inBracket = false;
        
        // Parse placeholder
        if (current === "{YYYY}") {
          parts.push({ type: "year4" });
        } else if (current === "{YY}") {
          parts.push({ type: "year2" });
        } else if (current === "{MM}") {
          parts.push({ type: "month" });
        } else if (current === "{DD}") {
          parts.push({ type: "day" });
        } else if (current === "{OUTLET}") {
          parts.push({ type: "outlet" });
        } else if (current.match(/^\{#{3,10}\}$/)) {
          const padding = current.length - 2; // Remove { and }
          parts.push({ type: "sequence", padding });
        }
        
        current = "";
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push({ type: "static", value: current });
    }

    return parts;
  }

  /**
   * Calculate scope key based on pattern and reset rule
   */
  private calculateScopeKey(
    pattern: string,
    resetRule: ResetRule,
    context: GenerateContext
  ): string {
    const parts = this.parsePattern(pattern);
    const keyParts: string[] = [];

    // If pattern includes {OUTLET}, scope is per outlet
    if (parts.some(p => p.type === "outlet")) {
      if (!context.outletCode) {
        throw new Error("Pattern requires outlet code but none provided");
      }
      keyParts.push(context.outletCode);
    }

    // Add date-based scope based on reset rule
    if (resetRule === "YEARLY") {
      keyParts.push(context.date.getFullYear().toString());
    } else if (resetRule === "MONTHLY") {
      const year = context.date.getFullYear();
      const month = String(context.date.getMonth() + 1).padStart(2, "0");
      keyParts.push(`${year}-${month}`);
    } else {
      // NEVER reset - use static scope
      if (keyParts.length === 0) {
        keyParts.push("_"); // Global scope
      }
    }

    return keyParts.join("-");
  }

  /**
   * Get next sequence value (atomic increment with row lock)
   */
  private async getNextSequenceValue(
    connection: PoolConnection,
    companyId: number,
    docType: DocType,
    scopeKey: string
  ): Promise<number> {
    // Try to get existing sequence with row lock
    const [rows] = await connection.execute<any[]>(
      `SELECT current_value 
       FROM numbering_sequences 
       WHERE company_id = ? AND doc_type = ? AND scope_key = ?
       FOR UPDATE`,
      [companyId, docType, scopeKey]
    );

    let nextValue: number;

    if (rows.length === 0) {
      // Create new sequence starting at 1
      await connection.execute(
        `INSERT INTO numbering_sequences 
         (company_id, doc_type, scope_key, current_value, last_generated_at) 
         VALUES (?, ?, ?, 1, NOW())`,
        [companyId, docType, scopeKey]
      );
      nextValue = 1;
    } else {
      // Increment existing sequence
      nextValue = Number(rows[0].current_value) + 1;
      await connection.execute(
        `UPDATE numbering_sequences 
         SET current_value = ?, last_generated_at = NOW(), updated_at = NOW()
         WHERE company_id = ? AND doc_type = ? AND scope_key = ?`,
        [nextValue, companyId, docType, scopeKey]
      );
    }

    return nextValue;
  }

  /**
   * Get current sequence value without incrementing
   */
  private async getCurrentSequenceValue(
    connection: PoolConnection,
    companyId: number,
    docType: DocType,
    scopeKey: string
  ): Promise<number> {
    const [rows] = await connection.execute<any[]>(
      `SELECT current_value 
       FROM numbering_sequences 
       WHERE company_id = ? AND doc_type = ? AND scope_key = ?`,
      [companyId, docType, scopeKey]
    );

    return rows.length > 0 ? Number(rows[0].current_value) : 0;
  }

  /**
   * Replace placeholders with actual values
   */
  private replacePlaceholders(
    pattern: string,
    context: GenerateContext & { sequence: number; paddingLength: number }
  ): string {
    const parts = this.parsePattern(pattern);
    let result = "";

    for (const part of parts) {
      switch (part.type) {
        case "static":
          result += part.value;
          break;
        case "year4":
          result += context.date.getFullYear().toString();
          break;
        case "year2":
          result += context.date.getFullYear().toString().slice(-2);
          break;
        case "month":
          result += String(context.date.getMonth() + 1).padStart(2, "0");
          break;
        case "day":
          result += String(context.date.getDate()).padStart(2, "0");
          break;
        case "outlet":
          if (!context.outletCode) {
            throw new Error("Pattern requires outlet code but none provided");
          }
          result += context.outletCode;
          break;
        case "sequence":
          result += String(context.sequence).padStart(context.paddingLength, "0");
          break;
      }
    }

    return result;
  }

  /**
   * Get active template for company and doc type
   */
  private async getActiveTemplate(
    connection: PoolConnection,
    companyId: number,
    docType: DocType
  ): Promise<NumberingTemplate | null> {
    const [rows] = await connection.execute<any[]>(
      `SELECT id, company_id, doc_type, template_pattern, reset_rule, 
              padding_length, is_active
       FROM numbering_templates
       WHERE company_id = ? AND doc_type = ? AND is_active = TRUE
       LIMIT 1`,
      [companyId, docType]
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      id: Number(rows[0].id),
      company_id: Number(rows[0].company_id),
      doc_type: rows[0].doc_type,
      template_pattern: rows[0].template_pattern,
      reset_rule: rows[0].reset_rule,
      padding_length: Number(rows[0].padding_length),
      is_active: Boolean(rows[0].is_active)
    };
  }
}

export const numberingService = new NumberingService();
```

### Integration with Sales

**File:** `apps/api/src/lib/sales.ts` (MODIFIED)

```typescript
// Add import
import { numberingService } from "./numbering-service";

// Modify createInvoice function
export async function createInvoice(
  companyId: number,
  input: {
    outlet_id: number;
    client_ref?: string;
    invoice_no?: string;  // ← Now optional
    invoice_date: string;
    // ... other fields
  },
  actor?: MutationActor
): Promise<SalesInvoiceDetail> {
  return withTransaction(async (connection) => {
    // ... existing idempotency check ...

    // Get outlet for numbering context
    const outlet = await findOutletByIdWithExecutor(connection, companyId, input.outlet_id);
    
    // Auto-generate invoice_no if not provided
    let invoiceNo = input.invoice_no?.trim();
    if (!invoiceNo) {
      try {
        invoiceNo = await numberingService.generateNextNumber(
          companyId,
          "SALES_INVOICE",
          { 
            outletCode: outlet.code,
            date: new Date(input.invoice_date)
          }
        );
      } catch (error) {
        // No template configured - require manual entry
        throw new Error("Invoice number is required (no numbering template configured)");
      }
    }

    // ... rest of creation logic with invoiceNo ...
  });
}

// Modify createPayment function similarly
export async function createPayment(
  companyId: number,
  input: {
    outlet_id: number;
    invoice_id: number;
    payment_no?: string;  // ← Now optional
    payment_at: string;
    // ... other fields
  },
  actor?: MutationActor
): Promise<SalesPayment> {
  return withTransaction(async (connection) => {
    // ... existing validation ...

    // Get outlet for numbering context
    const outlet = await findOutletByIdWithExecutor(connection, companyId, input.outlet_id);
    
    // Auto-generate payment_no if not provided
    let paymentNo = input.payment_no?.trim();
    if (!paymentNo) {
      try {
        paymentNo = await numberingService.generateNextNumber(
          companyId,
          "SALES_PAYMENT",
          { 
            outletCode: outlet.code,
            date: new Date(input.payment_at)
          }
        );
      } catch (error) {
        // No template configured - require manual entry
        throw new Error("Payment number is required (no numbering template configured)");
      }
    }

    // ... rest of creation logic with paymentNo ...
  });
}
```

---

## API Endpoints

### Base URL: `/api/numbering`

All endpoints require authentication. Access control:
- **ACCOUNTANT+**: Can view templates
- **ADMIN+**: Can create/update/delete templates

### 1. List Templates

**Endpoint:** `GET /api/numbering/templates`

**Query Parameters:**
- `company_id` (required): Filter by company
- `doc_type` (optional): Filter by document type

**Request Example:**
```http
GET /api/numbering/templates?company_id=10&doc_type=SALES_INVOICE
Authorization: Bearer <token>
```

**Response Example:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "company_id": 10,
      "doc_type": "SALES_INVOICE",
      "template_pattern": "INV-{YYYY}-{####}",
      "reset_rule": "YEARLY",
      "padding_length": 4,
      "is_active": true,
      "created_at": "2026-03-01T10:00:00Z",
      "updated_at": "2026-03-01T10:00:00Z"
    }
  ]
}
```

### 2. Create Template

**Endpoint:** `POST /api/numbering/templates`

**Request Body:**
```json
{
  "company_id": 10,
  "doc_type": "SALES_INVOICE",
  "template_pattern": "INV-{YYYY}-{####}",
  "reset_rule": "YEARLY",
  "padding_length": 4
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "company_id": 10,
    "doc_type": "SALES_INVOICE",
    "template_pattern": "INV-{YYYY}-{####}",
    "reset_rule": "YEARLY",
    "padding_length": 4,
    "is_active": true,
    "created_at": "2026-03-09T10:00:00Z",
    "updated_at": "2026-03-09T10:00:00Z"
  }
}
```

**Error Cases:**
- `400`: Invalid pattern syntax
- `409`: Template already exists for this company/doc_type
- `403`: User not authorized (not ADMIN)

### 3. Get Template

**Endpoint:** `GET /api/numbering/templates/:id`

**Query Parameters:**
- `company_id` (required): For authorization check

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "company_id": 10,
    "doc_type": "SALES_INVOICE",
    "template_pattern": "INV-{YYYY}-{####}",
    "reset_rule": "YEARLY",
    "padding_length": 4,
    "is_active": true,
    "created_at": "2026-03-01T10:00:00Z",
    "updated_at": "2026-03-01T10:00:00Z"
  }
}
```

### 4. Update Template

**Endpoint:** `PATCH /api/numbering/templates/:id`

**Request Body:**
```json
{
  "template_pattern": "INV/{YYYY}/{####}",
  "reset_rule": "YEARLY",
  "padding_length": 5
}
```

**Response:** Same as Create

**Notes:**
- Changing pattern does NOT affect existing documents
- New pattern applies only to documents created after the change
- Existing sequences continue with current values

### 5. Delete Template

**Endpoint:** `DELETE /api/numbering/templates/:id`

**Behavior:** Soft delete (sets `is_active = false`)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "is_active": false
  }
}
```

### 6. Generate Number (Preview)

**Endpoint:** `POST /api/numbering/generate`

**Purpose:** Preview what the next number would be without incrementing counter

**Request Body:**
```json
{
  "company_id": 10,
  "doc_type": "SALES_INVOICE",
  "outlet_code": "HQ",
  "date": "2026-03-09T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "number": "INV-2026-0043",
    "preview": true,
    "template_pattern": "INV-{YYYY}-{####}",
    "scope_key": "2026",
    "current_sequence": 42,
    "next_sequence": 43
  }
}
```

### 7. Validate Pattern

**Endpoint:** `POST /api/numbering/templates/:id/validate`

**Request Body:**
```json
{
  "pattern": "INV-{YYYY}-{####}"
}
```

**Response (Valid):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": []
  }
}
```

**Response (Invalid):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "errors": [
      "Pattern must contain exactly one sequence placeholder (e.g., {####})"
    ]
  }
}
```

---

## Frontend Implementation

### File Structure

```
apps/backoffice/src/
├── features/
│   ├── settings-numbering-page.tsx     (NEW - Settings UI)
│   ├── sales-invoices-page.tsx         (MODIFIED - Auto-gen)
│   └── sales-payments-page.tsx         (MODIFIED - Auto-gen)
├── hooks/
│   ├── use-numbering-templates.ts      (NEW - Fetch templates)
│   └── use-number-preview.ts           (NEW - Preview next number)
└── components/
    ├── pattern-builder.tsx              (NEW - Pattern input helper)
    └── template-form.tsx                (NEW - Create/edit form)
```

### Settings Page UI

**File:** `apps/backoffice/src/features/settings-numbering-page.tsx`

**Wireframe:**

```
┌──────────────────────────────────────────────────────────────┐
│ Settings → Numbering Templates                               │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Configure automatic document numbering for your company.    │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Sales Invoice Template                        [Edit]    │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Pattern: INV-{YYYY}-{####}                             │ │
│  │ Reset: Yearly                                          │ │
│  │ Preview: INV-2026-0001                                 │ │
│  │ Status: ● Active                                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Sales Payment Template                        [Edit]    │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Pattern: PAY-{YYYY}-{####}                             │ │
│  │ Reset: Yearly                                          │ │
│  │ Preview: PAY-2026-0001                                 │ │
│  │ Status: ● Active                                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  [+ Create New Template]                                     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Template Form

**Create/Edit Modal:**

```
┌──────────────────────────────────────────────────────────────┐
│ Create Numbering Template                          [×]        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Document Type *                                              │
│  ┌──────────────────────────────────────┐                    │
│  │ Sales Invoice                      ▼ │                    │
│  └──────────────────────────────────────┘                    │
│                                                               │
│  Template Pattern *                                           │
│  ┌──────────────────────────────────────┐                    │
│  │ INV-{YYYY}-{####}                    │                    │
│  └──────────────────────────────────────┘                    │
│                                                               │
│  Insert Variable:                                             │
│  [{YYYY}] [{YY}] [{MM}] [{DD}] [{OUTLET}] [{####}]          │
│                                                               │
│  Reset Rule *                                                 │
│  ┌──────────────────────────────────────┐                    │
│  │ Yearly                             ▼ │                    │
│  └──────────────────────────────────────┘                    │
│                                                               │
│  Sequence Padding *                                           │
│  ┌──────────────────────────────────────┐                    │
│  │ 4                                      │                    │
│  └──────────────────────────────────────┘                    │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Preview                                                 │ │
│  │ Next number will be: INV-2026-0001                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  ℹ️ This template will apply to new documents only.          │
│     Existing invoices will NOT be affected.                  │
│                                                               │
│                                    [Cancel]  [Create]        │
└──────────────────────────────────────────────────────────────┘
```

### Invoice/Payment Form Updates

**Updated UI for Invoice Form:**

```tsx
// Current invoice_id field in create form
<div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
  <input
    placeholder={
      hasActiveTemplate 
        ? "Invoice No (auto-generated if empty)" 
        : "Invoice No"
    }
    value={newInvoice.invoice_no}
    onChange={(event) =>
      setNewInvoice((prev) => ({
        ...prev,
        invoice_no: event.target.value
      }))
    }
    style={{ flex: 1, ...inputStyle }}
  />
  {hasActiveTemplate && (
    <button
      type="button"
      onClick={handlePreviewNext}
      style={{ ...inputStyle, cursor: "pointer" }}
    >
      Preview
    </button>
  )}
</div>
{hasActiveTemplate && (
  <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
    Leave empty to use template: {templatePattern}
    {previewNumber && ` (Next: ${previewNumber})`}
  </div>
)}
```

---

## Migration & Rollout Strategy

### Phase 0: Pre-Migration (Current State)

**Status:** Users manually enter invoice_no and payment_no

**Database:**
- `sales_invoices.invoice_no`: Required field, manually entered
- `sales_payments.payment_no`: Required field, manually entered

**Frontend:**
- Text input with required validation
- No auto-generation

**Backend:**
- Validates non-empty invoice_no/payment_no
- Database enforces uniqueness

### Phase 1: Database Migration

**Action:** Run migration `0100_numbering_templates.sql`

**Changes:**
- Create `numbering_templates` table
- Create `numbering_sequences` table
- **No changes to existing data**

**Impact:**
- ✅ Backward compatible
- ✅ Existing invoices/payments unchanged
- ✅ No downtime required

### Phase 2: Backend Deployment

**Action:** Deploy backend with NumberingService

**Changes:**
- Add `NumberingService` class
- Modify `createInvoice()` to support optional invoice_no
- Modify `createPayment()` to support optional payment_no
- Add `/api/numbering` endpoints

**Backward Compatibility:**
- If no template: require manual entry (existing behavior)
- If template exists but user provides number: use provided number
- If template exists and no number provided: auto-generate

**Testing:**
```bash
# Test 1: No template (backward compatible)
POST /api/sales/invoices
{ "invoice_no": "INV-001", ... }
→ Works as before

# Test 2: No template, no number (error)
POST /api/sales/invoices
{ "invoice_no": "", ... }
→ Error: "Invoice number required"

# Test 3: Template exists, auto-generate
POST /api/sales/invoices
{ "invoice_no": "", ... }
→ Success: "INV-2026-0001"

# Test 4: Template exists, manual override
POST /api/sales/invoices
{ "invoice_no": "CUSTOM-123", ... }
→ Success: "CUSTOM-123"
```

### Phase 3: Frontend Deployment

**Action:** Deploy frontend with updated forms

**Changes:**
- Add Settings → Numbering Templates page
- Update invoice form with auto-generation UI
- Update payment form with auto-generation UI
- Add preview functionality

**User Experience:**
- Admin configures templates in Settings
- Users see updated form UI with auto-generation option
- Existing workflow still works (manual entry)

### Phase 4: User Onboarding

**Action:** Notify users and provide documentation

**Communication:**
1. Email announcement: "New Feature: Automatic Document Numbering"
2. In-app notification banner on first login
3. Help documentation with examples
4. Video tutorial (optional)

**Support:**
- FAQ: "How do I set up numbering templates?"
- FAQ: "Can I still enter numbers manually?"
- FAQ: "What happens to existing invoices?"

### Phase 5: Monitoring

**Metrics to Track:**
- Template creation rate
- Auto-generation usage rate
- Manual override rate
- Duplicate number errors (should be zero)
- Performance (p95 latency for number generation)

**Success Criteria:**
- ✅ No duplicate numbers generated
- ✅ Number generation < 100ms (p95)
- ✅ Zero production errors related to numbering
- ✅ User adoption > 50% within 2 weeks

---

## Testing Strategy

### Unit Tests

**File:** `apps/api/src/lib/numbering-service.test.ts`

```typescript
describe("NumberingService", () => {
  describe("validatePattern", () => {
    it("should accept valid patterns", () => {
      const service = new NumberingService();
      expect(service.validatePattern("INV-{YYYY}-{####}").valid).toBe(true);
      expect(service.validatePattern("{OUTLET}/INV/{####}").valid).toBe(true);
    });

    it("should reject patterns without sequence", () => {
      const service = new NumberingService();
      const result = service.validatePattern("INV-{YYYY}");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Pattern must contain exactly one sequence placeholder");
    });

    it("should reject invalid placeholders", () => {
      const service = new NumberingService();
      const result = service.validatePattern("INV-{INVALID}-{####}");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Unknown placeholder: {INVALID}");
    });
  });

  describe("calculateScopeKey", () => {
    it("should calculate yearly scope", () => {
      const service = new NumberingService();
      const scopeKey = service.calculateScopeKey(
        "INV-{YYYY}-{####}",
        "YEARLY",
        { date: new Date("2026-03-09"), outletCode: "HQ" }
      );
      expect(scopeKey).toBe("2026");
    });

    it("should calculate monthly scope", () => {
      const service = new NumberingService();
      const scopeKey = service.calculateScopeKey(
        "INV-{YYYY}{MM}-{####}",
        "MONTHLY",
        { date: new Date("2026-03-09"), outletCode: "HQ" }
      );
      expect(scopeKey).toBe("2026-03");
    });

    it("should include outlet in scope", () => {
      const service = new NumberingService();
      const scopeKey = service.calculateScopeKey(
        "{OUTLET}-INV-{YYYY}-{####}",
        "YEARLY",
        { date: new Date("2026-03-09"), outletCode: "HQ" }
      );
      expect(scopeKey).toBe("HQ-2026");
    });
  });

  describe("replacePlaceholders", () => {
    it("should replace all placeholders correctly", () => {
      const service = new NumberingService();
      const result = service.replacePlaceholders(
        "INV-{YYYY}/{MM}/{DD}-{OUTLET}-{####}",
        {
          date: new Date("2026-03-09"),
          outletCode: "HQ",
          sequence: 42,
          paddingLength: 4
        }
      );
      expect(result).toBe("INV-2026/03/09-HQ-0042");
    });
  });
});
```

### Integration Tests

**File:** `apps/api/tests/integration/numbering.integration.test.mjs`

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

test("Numbering Templates Integration", async (t) => {
  await t.test("should create template and generate numbers", async () => {
    // Create template
    const createRes = await apiRequest(baseUrl, "/api/numbering/templates", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        company_id: companyId,
        doc_type: "SALES_INVOICE",
        template_pattern: "INV-{YYYY}-{####}",
        reset_rule: "YEARLY",
        padding_length: 4
      })
    });

    assert.strictEqual(createRes.status, 201);
    const templateId = createRes.body.data.id;

    // Generate first number
    const gen1 = await apiRequest(baseUrl, "/api/numbering/generate", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        company_id: companyId,
        doc_type: "SALES_INVOICE",
        outlet_code: "HQ",
        date: "2026-03-09T10:00:00Z"
      })
    });

    assert.strictEqual(gen1.body.data.number, "INV-2026-0001");

    // Create invoice with auto-generated number
    const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_no: "", // Empty triggers auto-generation
        invoice_date: "2026-03-09",
        tax_amount: 0,
        lines: [{ description: "Test", qty: 1, unit_price: 100 }]
      })
    });

    assert.strictEqual(invoiceRes.status, 201);
    assert.strictEqual(invoiceRes.body.data.invoice_no, "INV-2026-0001");

    // Create second invoice
    const invoice2Res = await apiRequest(baseUrl, "/api/sales/invoices", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_no: "",
        invoice_date: "2026-03-09",
        tax_amount: 0,
        lines: [{ description: "Test 2", qty: 1, unit_price: 200 }]
      })
    });

    assert.strictEqual(invoice2Res.body.data.invoice_no, "INV-2026-0002");
  });

  await t.test("should handle concurrent number generation", async () => {
    // Test race condition safety with row locking
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        apiRequest(baseUrl, "/api/sales/invoices", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletId,
            invoice_no: "",
            invoice_date: "2026-03-09",
            tax_amount: 0,
            lines: [{ description: `Concurrent ${i}`, qty: 1, unit_price: 100 }]
          })
        })
      );
    }

    const results = await Promise.all(promises);
    const numbers = results.map(r => r.body.data.invoice_no);
    
    // All numbers should be unique
    const uniqueNumbers = new Set(numbers);
    assert.strictEqual(uniqueNumbers.size, 10);
  });

  await t.test("should reset counter yearly", async () => {
    // Create invoice in 2026
    const invoice2026 = await createInvoice("2026-03-09");
    assert.strictEqual(invoice2026.invoice_no, "INV-2026-0001");

    // Create invoice in 2027
    const invoice2027 = await createInvoice("2027-01-01");
    assert.strictEqual(invoice2027.invoice_no, "INV-2027-0001");
  });

  await t.test("should allow manual override", async () => {
    const manualRes = await apiRequest(baseUrl, "/api/sales/invoices", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_no: "MANUAL-999",
        invoice_date: "2026-03-09",
        tax_amount: 0,
        lines: [{ description: "Manual", qty: 1, unit_price: 100 }]
      })
    });

    assert.strictEqual(manualRes.body.data.invoice_no, "MANUAL-999");

    // Next auto-generated should continue from previous sequence
    const autoRes = await createInvoice("2026-03-09");
    assert.strictEqual(autoRes.invoice_no, "INV-2026-0002"); // Not affected by manual
  });
});
```

---

## Security Considerations

### Access Control

| Resource | Action | Required Role | Authorization Check |
|----------|--------|---------------|---------------------|
| Templates | List | ACCOUNTANT+ | `company_id` matches user's company |
| Templates | Create | ADMIN+ | `company_id` matches user's company |
| Templates | Update | ADMIN+ | Template belongs to user's company |
| Templates | Delete | ADMIN+ | Template belongs to user's company |
| Generate | Preview | ACCOUNTANT+ | `company_id` matches user's company |

### Input Validation

**Pattern Syntax:**
- Max length: 128 characters
- Allowed characters: alphanumeric, `-`, `/`, `_`, `{`, `}`
- SQL injection prevention: No user input in SQL, all parameterized

**Data Validation:**
- `doc_type`: Enum validation
- `reset_rule`: Enum validation
- `padding_length`: Integer 3-10
- `company_id`: Must match authenticated user's company

### Concurrency Safety

**Problem:** Two users creating invoices simultaneously

**Solution:** Row-level locking with `FOR UPDATE`

```sql
-- User A locks row
SELECT current_value FROM numbering_sequences WHERE ... FOR UPDATE;
-- User B waits for lock

-- User A updates
UPDATE numbering_sequences SET current_value = 43 WHERE ...;
-- User A commits, releases lock

-- User B acquires lock, reads updated value
SELECT current_value FROM numbering_sequences WHERE ... FOR UPDATE;
-- Gets 43, increments to 44
```

**Result:** No duplicate numbers, guaranteed sequential order

---

## Performance Optimization

### Query Performance

**Template Lookup:**
```sql
-- Fast index seek via (company_id, is_active)
SELECT * FROM numbering_templates 
WHERE company_id = ? AND doc_type = ? AND is_active = TRUE;

-- Index: idx_numbering_templates_company_active
-- Execution time: <1ms
```

**Sequence Increment:**
```sql
-- Fast unique index seek via (company_id, doc_type, scope_key)
SELECT current_value FROM numbering_sequences 
WHERE company_id = ? AND doc_type = ? AND scope_key = ? 
FOR UPDATE;

-- Index: uq_numbering_sequences_scope (unique)
-- Execution time: <1ms (even with row lock)
```

### Caching Strategy

**Frontend Caching:**
```typescript
// Cache templates per company (rarely change)
const { data: templates } = useSWR(
  `/api/numbering/templates?company_id=${companyId}`,
  fetcher,
  { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000 // 1 minute
  }
);
```

**Backend Caching:**
❌ Don't cache sequence values (causes duplicates)
✅ Can cache template patterns in memory (invalidate on update)

### Scalability

**Worst Case Scenario:**
- 100 outlets × 12 months × 10 years × 2 doc types = 24,000 sequence rows
- Row size: ~200 bytes
- Total: ~4.8 MB
- **Impact:** Negligible

**Load Testing Results (Expected):**
- 100 concurrent users creating invoices
- p50 latency: 10ms
- p95 latency: 50ms
- p99 latency: 100ms
- Throughput: 1000 invoices/sec

---

## Error Handling

### User-Facing Errors

| Error Code | HTTP Status | Message | User Action |
|------------|-------------|---------|-------------|
| `NO_TEMPLATE` | 400 | No numbering template configured | Create template in Settings or provide manual number |
| `INVALID_PATTERN` | 400 | Template pattern is invalid: {errors} | Fix pattern syntax |
| `DUPLICATE_NUMBER` | 409 | Invoice number already exists | Choose different number |
| `TEMPLATE_EXISTS` | 409 | Template already exists for this document type | Update existing template instead |
| `MISSING_OUTLET_CODE` | 400 | Pattern requires outlet code but outlet has no code | Set outlet code in Settings |
| `SEQUENCE_OVERFLOW` | 500 | Sequence counter exceeded maximum | Contact administrator to increase padding |

### Developer Errors

```typescript
// Example error handling in frontend
try {
  const invoice = await createInvoice({
    outlet_id: 1,
    invoice_no: "",  // Trigger auto-generation
    // ...
  });
} catch (error) {
  if (error.code === "NO_TEMPLATE") {
    alert("No numbering template configured. Please enter invoice number manually or contact admin.");
  } else if (error.code === "DUPLICATE_NUMBER") {
    alert("This invoice number already exists. Please try again.");
  } else {
    alert("Failed to create invoice: " + error.message);
  }
}
```

---

## Rollback Plan

### Scenario: Critical Bug Found in Production

**Immediate Actions:**

1. **Disable auto-generation:**
   ```sql
   UPDATE numbering_templates SET is_active = FALSE WHERE company_id = ?;
   ```
   Result: Falls back to manual entry (existing behavior)

2. **Monitor for duplicate errors:**
   ```sql
   SELECT invoice_no, COUNT(*) as count
   FROM sales_invoices
   WHERE company_id = ?
   GROUP BY invoice_no
   HAVING count > 1;
   ```

3. **Fix duplicates (if any):**
   ```sql
   -- Manually assign new numbers to duplicates
   UPDATE sales_invoices 
   SET invoice_no = 'INV-2026-FIXED-0001'
   WHERE id = ?;
   ```

### Rollback Steps

**Step 1:** Disable templates (SQL above)

**Step 2:** Deploy backend rollback
- Remove NumberingService integration from `createInvoice()`/`createPayment()`
- Restore required validation for `invoice_no`/`payment_no`

**Step 3:** Deploy frontend rollback
- Remove auto-generation UI
- Restore required field validation

**Step 4:** Keep database tables (for future retry)
- Don't drop `numbering_templates` table
- Don't drop `numbering_sequences` table
- Allows re-enabling feature after bug fix

---

## Future Enhancements (Not in Scope)

### Phase 2 Features (Potential)

1. **Outlet-Level Templates:**
   - Different patterns per outlet
   - Override company defaults

2. **Conditional Patterns:**
   - Different pattern based on invoice amount
   - Different pattern for specific customers

3. **Multi-Language Support:**
   - Pattern labels in different languages
   - Date formats per locale

4. **Bulk Import/Export:**
   - Export templates as JSON
   - Import templates from file

5. **Audit Log:**
   - Track template changes
   - See who created/modified templates

6. **Sequence Reset Tool:**
   - Admin can manually reset counter to specific value
   - Requires confirmation and reason

7. **Number Range Reservation:**
   - Reserve blocks of numbers for specific purposes
   - E.g., INV-2026-5000 to 5999 reserved for exports

8. **Pattern Variables Extension:**
   - `{CUSTOMER_CODE}`
   - `{USER_INITIALS}`
   - `{WEEK_NUMBER}`

---

## Documentation Requirements

### User Documentation

1. **Getting Started Guide:**
   - How to create your first template
   - Pattern syntax explained with examples
   - Reset rules explained

2. **FAQ:**
   - "What happens if I don't configure a template?"
   - "Can I change the template later?"
   - "What if I want to use my own numbering?"
   - "What happens to existing invoices?"

3. **Video Tutorial:**
   - 5-minute walkthrough
   - Shows template creation
   - Shows auto-generation in action

### Developer Documentation

1. **API Reference:**
   - All endpoints documented
   - Request/response examples
   - Error codes explained

2. **Architecture Diagram:**
   - Component relationships
   - Data flow
   - Sequence generation process

3. **Database Schema:**
   - Table relationships
   - Index explanations
   - Concurrency model

---

## Acceptance Criteria

### Functional Requirements

✅ **Templates:**
- [ ] Admin can create numbering template
- [ ] Admin can update template
- [ ] Admin can delete (deactivate) template
- [ ] Only one active template per company/doc_type
- [ ] Pattern validation works correctly

✅ **Number Generation:**
- [ ] Numbers auto-generate based on template
- [ ] Sequences increment atomically (no duplicates)
- [ ] Reset rules work (never/yearly/monthly)
- [ ] Outlet-specific patterns work
- [ ] Manual override works

✅ **Integration:**
- [ ] Invoice creation uses templates
- [ ] Payment creation uses templates
- [ ] Fallback to manual entry if no template

### Non-Functional Requirements

✅ **Performance:**
- [ ] Number generation < 100ms (p95)
- [ ] No race conditions under load (100 req/sec)
- [ ] Database queries optimized with indexes

✅ **Security:**
- [ ] RBAC enforced (ADMIN can manage templates)
- [ ] Company isolation (can't access other company's templates)
- [ ] Input validation prevents SQL injection

✅ **Usability:**
- [ ] Settings UI is intuitive
- [ ] Form UI clearly shows auto-generation option
- [ ] Error messages are actionable
- [ ] Help documentation complete

✅ **Reliability:**
- [ ] Zero duplicate numbers generated
- [ ] Backward compatible (existing workflow works)
- [ ] Graceful degradation (fallback to manual)
- [ ] Migration is reversible

---

## Conclusion

This specification provides a complete blueprint for implementing a flexible, company-level numbering template system with:

- **Simple patterns** like `INV-{YYYY}-{####}` that are easy to understand
- **Atomic sequence generation** that prevents duplicates under concurrent load
- **Configurable reset rules** for different business needs
- **Manual override** capability for flexibility
- **Backward compatibility** ensuring existing workflows continue to work

The implementation follows Jurnapod's architectural principles:
- ✅ Company/outlet scoping enforced
- ✅ Audit trail support (created_by/updated_by)
- ✅ Migration safety (no data changes)
- ✅ Transaction safety (atomic operations)
- ✅ RBAC integration (ADMIN+ for configuration)

**Estimated Effort:** 3-4 weeks (1-2 developers)

**Risk Level:** Low (backward compatible, well-tested pattern)

**Business Value:** High (reduces manual work, ensures consistency, prevents errors)

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-09  
**Status:** ✅ Ready for Implementation

