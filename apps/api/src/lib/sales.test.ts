// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { SalesInvoiceLineInputSchema, SalesOrderLineInputSchema } from "@jurnapod/shared";

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
