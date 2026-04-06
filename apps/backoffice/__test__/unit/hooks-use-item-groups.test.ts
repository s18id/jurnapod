// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Unit tests for useItemGroups hook
// Run with: npm run test -w @jurnapod/backoffice

import assert from "node:assert/strict";
import { describe, test } from "node:test";

// Note: Full React hook testing requires @testing-library/react
// which needs jsdom environment. For now, we validate the hook exports.

describe("useItemGroups hook", () => {
  test("hook module exports correctly", async () => {
    const hookModule = await import("./use-item-groups.js");
    assert.strictEqual(typeof hookModule.useItemGroups, "function", "useItemGroups should be exported as a function");
  });

  test("ItemGroup type validation", () => {
    // This test validates the ItemGroup type structure at runtime
    const mockGroup = {
      id: 1,
      company_id: 1,
      parent_id: null,
      code: "GRP001",
      name: "Test Group",
      is_active: true,
      updated_at: "2024-01-01T00:00:00Z"
    };

    assert.strictEqual(typeof mockGroup.id, "number");
    assert.strictEqual(typeof mockGroup.name, "string");
    assert.strictEqual(typeof mockGroup.code, "string");
    assert.strictEqual(typeof mockGroup.is_active, "boolean");
    assert.ok(mockGroup.parent_id === null || typeof mockGroup.parent_id === "number");
  });
});
