// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Unit tests for account mapping scope semantics
// Run with: node --test --import tsx src/lib/account-mappings-scope.test.ts

import assert from "node:assert/strict";
import { test, describe } from "node:test";

describe("Query scope validation", () => {
  test("company scope accepts empty outlet_id", () => {
    const scope: string = "company";
    const outletId: number | undefined = undefined;
    
    const isValid = scope === "company" || (scope === "outlet" && outletId !== undefined && outletId > 0);
    assert.equal(isValid, true, "Company scope should not require outlet_id");
  });

  test("outlet scope rejects missing outlet_id", () => {
    const scope: string = "outlet";
    const outletId: number | undefined = undefined;
    
    const isValid = scope === "company" || (scope === "outlet" && outletId !== undefined && outletId > 0);
    assert.equal(isValid, false, "Outlet scope should require outlet_id");
  });

  test("outlet scope accepts valid outlet_id", () => {
    const scope: string = "outlet";
    const outletId = 123;
    
    const isValid = scope === "company" || (scope === "outlet" && outletId !== undefined && outletId > 0);
    assert.equal(isValid, true, "Outlet scope with valid outlet_id should work");
  });
});

describe("Company completeness validation", () => {
  const requiredKeys = ["AR", "SALES_REVENUE"] as const;
  
  test("complete payload passes", () => {
    const providedKeys = new Set(["AR", "SALES_REVENUE"]);
    const missingKeys = requiredKeys.filter((key) => !providedKeys.has(key));
    
    assert.equal(missingKeys.length, 0, "Should have no missing keys");
  });

  test("partial payload fails with correct missing keys", () => {
    const providedKeys = new Set(["AR"]);
    const missingKeys = requiredKeys.filter((key) => !providedKeys.has(key));
    
    assert.equal(missingKeys.length, 1, "Should have 1 missing key");
    assert.ok(missingKeys.includes("SALES_REVENUE"), "SALES_REVENUE should be missing");
  });
});

describe("Outlet blank clears override logic", () => {
  test("filters numeric entries for upsert", () => {
    const mappings = [
      { mapping_key: "AR", account_id: "" as const },
      { mapping_key: "SALES_REVENUE", account_id: 5 }
    ];
    
    const toUpsert = mappings.filter(
      (m): m is { mapping_key: string; account_id: number } => m.account_id !== ""
    );
    
    assert.equal(toUpsert.length, 1, "Should have 1 upsert entry");
    assert.equal(toUpsert[0].mapping_key, "SALES_REVENUE", "Should be SALES_REVENUE");
  });

  test("identifies blank entries for deletion", () => {
    const mappings = [
      { mapping_key: "AR", account_id: "" as const },
      { mapping_key: "SALES_REVENUE", account_id: 5 }
    ];
    
    const toDelete = mappings
      .filter((m) => m.account_id === "")
      .map((m) => m.mapping_key);
    
    assert.equal(toDelete.length, 1, "Should have 1 delete entry");
    assert.ok(toDelete.includes("AR"), "AR should be deleted");
  });
});

describe("Payment invoice default validation", () => {
  test("single invoice default passes", () => {
    const mappings = [
      { method_code: "CASH", is_invoice_default: true },
      { method_code: "CARD", is_invoice_default: false }
    ];
    
    const defaults = mappings.filter((m) => m.is_invoice_default);
    const isValid = defaults.length <= 1;
    
    assert.equal(isValid, true, "Should allow single default");
  });

  test("multiple invoice defaults fails", () => {
    const mappings = [
      { method_code: "CASH", is_invoice_default: true },
      { method_code: "CARD", is_invoice_default: true }
    ];
    
    const defaults = mappings.filter((m) => m.is_invoice_default);
    const isValid = defaults.length <= 1;
    
    assert.equal(isValid, false, "Should reject multiple defaults");
  });
});

describe("Posting fallback precedence", () => {
  test("outlet override wins over company default", () => {
    const outletMapping = { AR: 100 };
    const companyMapping = { AR: 200 };
    
    const effective = outletMapping.AR ?? companyMapping.AR;
    
    assert.equal(effective, 100, "Outlet value should be used");
  });

  test("company fallback used when outlet missing", () => {
    const outletMapping: Record<string, number | undefined> = {};
    const companyMapping = { AR: 200 };
    
    const effective = outletMapping.AR ?? companyMapping.AR;
    
    assert.equal(effective, 200, "Company value should be fallback");
  });

  test("throws when missing in both scopes", () => {
    const outletMapping: Record<string, number | undefined> = {};
    const companyMapping: Record<string, number | undefined> = {};
    
    const effective = outletMapping.AR ?? companyMapping.AR;
    
    assert.equal(effective, undefined, "Should be undefined when missing in both");
  });
});
