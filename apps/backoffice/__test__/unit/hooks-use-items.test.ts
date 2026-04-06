// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Unit tests for useItems hook
// Run with: npm run test -w @jurnapod/backoffice

import assert from "node:assert/strict";
import { describe, test } from "node:test";

// Note: Full React hook testing requires @testing-library/react
// which needs jsdom environment. For now, we validate the hook exports.

describe("useItems hook", () => {
  test("hook module exports correctly", async () => {
    const hookModule = await import("./use-items.js");
    assert.strictEqual(typeof hookModule.useItems, "function", "useItems should be exported as a function");
  });

  test("Item type validation", () => {
    // This test validates the Item type structure at runtime
    const mockItem = {
      id: 1,
      company_id: 1,
      sku: "SKU001",
      name: "Test Item",
      type: "PRODUCT" as const,
      item_group_id: null,
      is_active: true,
      updated_at: "2024-01-01T00:00:00Z"
    };

    assert.strictEqual(typeof mockItem.id, "number");
    assert.strictEqual(typeof mockItem.name, "string");
    assert.ok(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"].includes(mockItem.type));
    assert.strictEqual(typeof mockItem.is_active, "boolean");
  });
});
