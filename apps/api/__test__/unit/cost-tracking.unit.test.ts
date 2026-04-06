// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Story: 4.6 Cost Tracking Methods
// Description: Unit tests for pure cost tracking functions (no DB required)

import assert from "node:assert/strict";
import { describe, test } from 'vitest';
import {
  getCostingStrategy,
  InsufficientInventoryError,
  InvalidCostingMethodError,
  CostTrackingError,
  toMinorUnits,
  fromMinorUnits,
} from "@jurnapod/modules-inventory-costing";

// ============================================================================
// Money Helper Tests - Pure Functions
// ============================================================================

describe("Money Helpers", () => {
  test("should convert to minor units correctly", () => {
    assert.strictEqual(toMinorUnits(10.5), 105000); // 10.5 * 10000
    assert.strictEqual(toMinorUnits(0.1234), 1234);
    assert.strictEqual(toMinorUnits(0.12345), 1235); // Rounds up
    assert.strictEqual(toMinorUnits(0), 0);
    assert.strictEqual(toMinorUnits(1), 10000);
    assert.strictEqual(toMinorUnits(0.0001), 1);
  });

  test("should convert from minor units correctly", () => {
    assert.strictEqual(fromMinorUnits(105000), 10.5);
    assert.strictEqual(fromMinorUnits(1234), 0.1234);
    assert.strictEqual(fromMinorUnits(0), 0);
    assert.strictEqual(fromMinorUnits(10000), 1);
    assert.strictEqual(fromMinorUnits(1), 0.0001);
  });

  test("should maintain precision round-trip", () => {
    const testValues = [0.01, 0.99, 10.5, 99.99, 1000.0001, 0.0001];
    for (const original of testValues) {
      const minor = toMinorUnits(original);
      const back = fromMinorUnits(minor);
      assert.strictEqual(back, original, `Round-trip failed for ${original}`);
    }
  });

  test("should handle edge cases", () => {
    // Very small numbers
    assert.strictEqual(toMinorUnits(0.00001), 0); // Below precision
    assert.strictEqual(toMinorUnits(0.00009), 1); // Rounds up

    // Large numbers
    assert.strictEqual(toMinorUnits(999999.9999), 9999999999);
    assert.strictEqual(fromMinorUnits(9999999999), 999999.9999);
  });
});

// ============================================================================
// Strategy Factory Tests - Pure Functions
// ============================================================================

describe("Costing Strategy Factory", () => {
  test("should return AVG strategy", () => {
    const strategy = getCostingStrategy("AVG");
    assert.ok(strategy, "Strategy should exist");
    assert.strictEqual(typeof strategy.calculateCost, "function", "Should have calculateCost method");
  });

  test("should return FIFO strategy", () => {
    const strategy = getCostingStrategy("FIFO");
    assert.ok(strategy, "Strategy should exist");
    assert.strictEqual(typeof strategy.calculateCost, "function", "Should have calculateCost method");
  });

  test("should return LIFO strategy", () => {
    const strategy = getCostingStrategy("LIFO");
    assert.ok(strategy, "Strategy should exist");
    assert.strictEqual(typeof strategy.calculateCost, "function", "Should have calculateCost method");
  });

  test("should throw InvalidCostingMethodError for invalid method", () => {
    assert.throws(
      () => getCostingStrategy("INVALID" as any),
      InvalidCostingMethodError,
      "Should throw InvalidCostingMethodError"
    );
    assert.throws(
      () => getCostingStrategy("" as any),
      InvalidCostingMethodError,
      "Should throw for empty string"
    );
    assert.throws(
      () => getCostingStrategy(null as any),
      InvalidCostingMethodError,
      "Should throw for null"
    );
  });

  test("should return different strategy instances", () => {
    const avg1 = getCostingStrategy("AVG");
    const avg2 = getCostingStrategy("AVG");
    // Each call returns new instance
    assert.notStrictEqual(avg1, avg2, "Should return new instances");
    // But they should have same methods
    assert.strictEqual(typeof avg1.calculateCost, typeof avg2.calculateCost);
  });
});

// ============================================================================
// Error Class Tests - Pure Classes
// ============================================================================

describe("Error Classes", () => {
  test("CostTrackingError should have correct name and message", () => {
    const error = new CostTrackingError("Test error");
    assert.strictEqual(error.name, "CostTrackingError");
    assert.strictEqual(error.message, "Test error");
    assert.ok(error instanceof Error);
  });

  test("InsufficientInventoryError should format message correctly", () => {
    const error = new InsufficientInventoryError(100, 50);
    assert.strictEqual(error.name, "InsufficientInventoryError");
    assert.ok(error.message.includes("100"), "Should include needed quantity");
    assert.ok(error.message.includes("50"), "Should include available quantity");
    assert.ok(error instanceof CostTrackingError);
    assert.ok(error instanceof Error);
  });

  test("InvalidCostingMethodError should include method name", () => {
    const error = new InvalidCostingMethodError("XYZ");
    assert.strictEqual(error.name, "InvalidCostingMethodError");
    assert.ok(error.message.includes("XYZ"), "Should include invalid method");
    assert.ok(error instanceof CostTrackingError);
    assert.ok(error instanceof Error);
  });
});

// ============================================================================
// Money Math Consistency Tests
// ============================================================================

describe("Money Math Consistency", () => {
  test("should handle typical accounting values", () => {
    // Common price points
    const prices = [9.99, 19.99, 29.99, 49.99, 99.99];
    for (const price of prices) {
      const minor = toMinorUnits(price);
      const restored = fromMinorUnits(minor);
      assert.strictEqual(restored, price, `Price ${price} should round-trip correctly`);
    }
  });

  test("should handle fractional quantities", () => {
    // Weight-based pricing
    const weights = [0.5, 1.5, 2.25, 3.75];
    const unitCost = 10.5;

    for (const weight of weights) {
      const totalCost = weight * unitCost;
      const minor = toMinorUnits(totalCost);
      const restored = fromMinorUnits(minor);
      // Allow tiny rounding differences due to floating point
      const diff = Math.abs(restored - totalCost);
      assert.ok(diff < 0.0001, `Weight ${weight} cost should be precise`);
    }
  });
});
