// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test, describe } from 'vitest';
import {
  SalesInvoiceLineInputSchema,
  SalesOrderLineInputSchema,
  SalesPaymentCreateRequestSchema,
  SalesPaymentUpdateRequestSchema
} from "@jurnapod/shared";

describe("Phase 5: Product/Item Linkage", () => {
  describe("Schema Validation", () => {
    describe("SalesInvoiceLineInputSchema", () => {
      test("accepts SERVICE line without item_id", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "SERVICE",
          description: "Consulting fee",
          qty: 1,
          unit_price: 100000
        });
        assert.strictEqual(result.success, true);
      });

      test("accepts PRODUCT line with item_id", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "PRODUCT",
          item_id: 1,
          description: "Coffee beans",
          qty: 2,
          unit_price: 50000
        });
        assert.strictEqual(result.success, true);
      });

      test("rejects PRODUCT line without item_id", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "PRODUCT",
          description: "Coffee beans",
          qty: 2,
          unit_price: 50000
        });
        assert.strictEqual(result.success, false);
        if (!result.success) {
          assert.strictEqual(result.error.issues[0].message, "Product lines require item_id");
        }
      });

      test("rejects PRODUCT line with item_id: 0", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "PRODUCT",
          item_id: 0,
          description: "Coffee beans",
          qty: 2,
          unit_price: 50000
        });
        assert.strictEqual(result.success, false);
      });

      test("rejects PRODUCT line with negative item_id", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "PRODUCT",
          item_id: -1,
          description: "Coffee beans",
          qty: 2,
          unit_price: 50000
        });
        assert.strictEqual(result.success, false);
      });

      test("accepts SERVICE line with optional item_id", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "SERVICE",
          item_id: 123,
          description: "Service with item ref",
          qty: 1,
          unit_price: 100000
        });
        assert.strictEqual(result.success, true);
      });

      test("defaults line_type to SERVICE", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          description: "Service fee",
          qty: 1,
          unit_price: 100000
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
          assert.strictEqual(result.data.line_type, "SERVICE");
        }
      });

      test("rejects invalid line_type", () => {
        const result = SalesInvoiceLineInputSchema.safeParse({
          line_type: "INVALID",
          description: "Test",
          qty: 1,
          unit_price: 100
        });
        assert.strictEqual(result.success, false);
      });
    });

    describe("SalesOrderLineInputSchema", () => {
      test("accepts SERVICE line without item_id", () => {
        const result = SalesOrderLineInputSchema.safeParse({
          line_type: "SERVICE",
          description: "Delivery",
          qty: 1,
          unit_price: 10000
        });
        assert.strictEqual(result.success, true);
      });

      test("accepts PRODUCT line with item_id", () => {
        const result = SalesOrderLineInputSchema.safeParse({
          line_type: "PRODUCT",
          item_id: 5,
          description: "Product A",
          qty: 3,
          unit_price: 25000
        });
        assert.strictEqual(result.success, true);
      });

      test("rejects PRODUCT line without item_id", () => {
        const result = SalesOrderLineInputSchema.safeParse({
          line_type: "PRODUCT",
          description: "Product A",
          qty: 3,
          unit_price: 25000
        });
        assert.strictEqual(result.success, false);
      });

      test("rejects PRODUCT line with item_id: 0", () => {
        const result = SalesOrderLineInputSchema.safeParse({
          line_type: "PRODUCT",
          item_id: 0,
          description: "Product A",
          qty: 3,
          unit_price: 25000
        });
        assert.strictEqual(result.success, false);
      });

      test("accepts SERVICE line with optional item_id", () => {
        const result = SalesOrderLineInputSchema.safeParse({
          line_type: "SERVICE",
          item_id: 456,
          description: "Service with item ref",
          qty: 2,
          unit_price: 15000
        });
        assert.strictEqual(result.success, true);
      });
    });
  });
});

describe("Phase 8: Payment Enhancements", () => {
  describe("SalesPaymentCreateRequestSchema", () => {
    test("accepts payment without splits (backward compatibility)", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        account_id: 1,
        amount: 100000
      });
      assert.strictEqual(result.success, true);
    });

    test("accepts payment with valid splits", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100000,
        splits: [
          { account_id: 1, amount: 60000 },
          { account_id: 2, amount: 40000 }
        ]
      });
      assert.strictEqual(result.success, true);
    });

    test("accepts payment with splits and matching header account_id", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        account_id: 1,
        amount: 100000,
        splits: [
          { account_id: 1, amount: 60000 },
          { account_id: 2, amount: 40000 }
        ]
      });
      assert.strictEqual(result.success, true);
    });

    test("rejects payment without account_id and without splits", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100000
      });
      assert.strictEqual(result.success, false);
    });

    test("rejects payment when split sum does not equal total amount", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100000,
        splits: [
          { account_id: 1, amount: 50000 },
          { account_id: 2, amount: 40000 }
        ]
      });
      assert.strictEqual(result.success, false);
    });

    test("rejects payment with duplicate account_ids in splits", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100000,
        splits: [
          { account_id: 1, amount: 60000 },
          { account_id: 1, amount: 40000 }
        ]
      });
      assert.strictEqual(result.success, false);
    });

    test("rejects payment with more than 10 splits", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100000,
        splits: Array.from({ length: 11 }, (_, i) => ({
          account_id: i + 1,
          amount: 9091
        }))
      });
      assert.strictEqual(result.success, false);
    });

    test("rejects payment with header account_id not matching first split", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        account_id: 99,
        amount: 100000,
        splits: [
          { account_id: 1, amount: 60000 },
          { account_id: 2, amount: 40000 }
        ]
      });
      assert.strictEqual(result.success, false);
    });

    test("accepts payment with exactly 10 splits", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100000,
        splits: Array.from({ length: 10 }, (_, i) => ({
          account_id: i + 1,
          amount: 10000
        }))
      });
      assert.strictEqual(result.success, true);
    });
  });

  describe("SalesPaymentUpdateRequestSchema", () => {
    test("accepts update with valid splits", () => {
      const result = SalesPaymentUpdateRequestSchema.safeParse({
        splits: [
          { account_id: 1, amount: 60000 },
          { account_id: 2, amount: 40000 }
        ],
        amount: 100000
      });
      assert.strictEqual(result.success, true);
    });

    test("rejects update when split sum does not equal amount", () => {
      const result = SalesPaymentUpdateRequestSchema.safeParse({
        splits: [
          { account_id: 1, amount: 50000 },
          { account_id: 2, amount: 40000 }
        ],
        amount: 100000
      });
      assert.strictEqual(result.success, false);
    });

    test("rejects update with duplicate account_ids in splits", () => {
      const result = SalesPaymentUpdateRequestSchema.safeParse({
        splits: [
          { account_id: 1, amount: 60000 },
          { account_id: 1, amount: 40000 }
        ],
        amount: 100000
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("Cent-exact validation", () => {
    test("accepts valid split sum", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100,
        splits: [
          { account_id: 1, amount: 33.34 },
          { account_id: 2, amount: 33.33 },
          { account_id: 3, amount: 33.33 }
        ]
      });
      assert.strictEqual(result.success, true);
    });

    test("rejects split sum mismatch by 0.01", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100,
        splits: [
          { account_id: 1, amount: 33.33 },
          { account_id: 2, amount: 33.33 },
          { account_id: 3, amount: 33.33 }
        ]
      });
      assert.strictEqual(result.success, false);
    });

    test("rejects amount with more than 2 decimals", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100.123,
        splits: [
          { account_id: 1, amount: 50 },
          { account_id: 2, amount: 50.123 }
        ]
      });
      assert.strictEqual(result.success, false);
    });

    test("rejects split with more than 2 decimals", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100,
        splits: [
          { account_id: 1, amount: 33.333 },
          { account_id: 2, amount: 66.667 }
        ]
      });
      assert.strictEqual(result.success, false);
    });

    test("accepts exactly 2 decimals", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100.99,
        splits: [
          { account_id: 1, amount: 50.49 },
          { account_id: 2, amount: 50.50 }
        ]
      });
      assert.strictEqual(result.success, true);
    });
  });

  describe("Payment timestamp schema acceptance", () => {
    test("same payment_at with milliseconds accepted by schema", () => {
      const result1 = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00.123Z",
        amount: 100,
        splits: [
          { account_id: 1, amount: 50 },
          { account_id: 2, amount: 50 }
        ]
      });
      const result2 = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00.000Z",
        amount: 100,
        splits: [
          { account_id: 1, amount: 50 },
          { account_id: 2, amount: 50 }
        ]
      });
      assert.strictEqual(result1.success, true);
      assert.strictEqual(result2.success, true);
      // Note: Full idempotency behavior test requires service layer integration
    });

    test("accepts timezone variants in schema", () => {
      const result1 = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100,
        splits: [{ account_id: 1, amount: 100 }]
      });
      const result2 = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00.000Z",
        amount: 100,
        splits: [{ account_id: 1, amount: 100 }]
      });
      assert.strictEqual(result1.success, true);
      assert.strictEqual(result2.success, true);
    });
  });

  describe("Service precision validation", () => {
    test("schema rejects amount with more than 2 decimals", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100.123,
        splits: [
          { account_id: 1, amount: 50 },
          { account_id: 2, amount: 50.123 }
        ]
      });
      assert.strictEqual(result.success, false);
    });

    test("schema rejects split with more than 2 decimals", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100,
        splits: [
          { account_id: 1, amount: 33.333 },
          { account_id: 2, amount: 66.667 }
        ]
      });
      assert.strictEqual(result.success, false);
    });

    test("schema accepts exactly 2 decimals", () => {
      const result = SalesPaymentCreateRequestSchema.safeParse({
        outlet_id: 1,
        invoice_id: 1,
        payment_at: "2026-03-10T10:00:00Z",
        amount: 100.99,
        splits: [
          { account_id: 1, amount: 50.49 },
          { account_id: 2, amount: 50.50 }
        ]
      });
      assert.strictEqual(result.success, true);
    });
  });

  // Note: Full idempotency behavior tests (same client_ref returns same payment)
  // and non-split payment precision validation require integration test harness
  // with database setup. See auth.test.ts for integration test patterns.
});
