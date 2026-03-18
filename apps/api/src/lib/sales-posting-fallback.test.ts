// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests for posting helper fallback logic using production implementation.
// Run with: node --test --import tsx apps/api/src/lib/sales-posting-fallback.test.ts

import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { FieldPacket, RowDataPacket } from "mysql2";
import {
  __salesPostingTestables,
  OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE
} from "./sales-posting";

const { readOutletAccountMappingByKey, readOutletPaymentMethodMappings } = __salesPostingTestables;

type QueryExecutor = Parameters<typeof readOutletAccountMappingByKey>[0];

function makeExecutor(impl: (sql: string) => [unknown[], unknown[]]) {
  const execute = mock.fn(async (sql: string) => impl(sql) as [RowDataPacket[], FieldPacket[]]);
  return { execute } as unknown as QueryExecutor;
}

describe("readOutletAccountMappingByKey fallback precedence", () => {
  test("supports id-based mappings without mapping_key values", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_account_mappings")) {
        return [[
          { mapping_type_id: 1, mapping_key: null, account_id: 100 },
          { mapping_type_id: 2, mapping_key: null, account_id: 101 }
        ], []];
      }
      if (sql.includes("company_account_mappings")) {
        return [[], []];
      }
      return [[], []];
    });

    const result = await readOutletAccountMappingByKey(db, 1, 1);
    assert.equal(result.AR, 100);
    assert.equal(result.SALES_REVENUE, 101);
  });

  test("outlet override wins over company default", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_account_mappings")) {
        return [[
          { mapping_key: "AR", account_id: 100 },
          { mapping_key: "SALES_REVENUE", account_id: 101 }
        ], []];
      }
      if (sql.includes("company_account_mappings")) {
        return [[
          { mapping_key: "AR", account_id: 200 },
          { mapping_key: "SALES_REVENUE", account_id: 201 }
        ], []];
      }
      return [[], []];
    });

    const result = await readOutletAccountMappingByKey(db, 1, 1);
    assert.equal(result.AR, 100);
    assert.equal(result.SALES_REVENUE, 101);
  });

  test("company fallback used when outlet missing", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_account_mappings")) return [[], []];
      if (sql.includes("company_account_mappings")) {
        return [[
          { mapping_key: "AR", account_id: 200 },
          { mapping_key: "SALES_REVENUE", account_id: 201 }
        ], []];
      }
      return [[], []];
    });

    const result = await readOutletAccountMappingByKey(db, 1, 1);
    assert.equal(result.AR, 200);
    assert.equal(result.SALES_REVENUE, 201);
  });

  test("throws when missing in both scopes", async () => {
    const db = makeExecutor(() => [[], []]);
    await assert.rejects(
      () => readOutletAccountMappingByKey(db, 1, 1),
      { message: OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE }
    );
  });

  test("partial outlet + partial company merges correctly", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_account_mappings")) {
        return [[
          { mapping_key: "AR", account_id: 100 },
          { mapping_key: "SALES_REVENUE", account_id: 101 }
        ], []];
      }
      if (sql.includes("company_account_mappings")) {
        return [[
          { mapping_key: "AR", account_id: 200 }
        ], []];
      }
      return [[], []];
    });

    const result = await readOutletAccountMappingByKey(db, 1, 1);
    assert.equal(result.AR, 100);
    assert.equal(result.SALES_REVENUE, 101);
  });

  test("ignores invalid rows but falls back to company", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_account_mappings")) {
        return [[
          { mapping_key: "AR", account_id: null },
          { mapping_key: null, account_id: 100 },
          { mapping_key: "SALES_REVENUE", account_id: 101 }
        ], []];
      }
      if (sql.includes("company_account_mappings")) {
        return [[
          { mapping_key: "AR", account_id: 200 }
        ], []];
      }
      return [[], []];
    });

    const result = await readOutletAccountMappingByKey(db, 1, 1);
    assert.equal(result.AR, 200);
    assert.equal(result.SALES_REVENUE, 101);
  });
});

describe("readOutletPaymentMethodMappings fallback precedence", () => {
  test("legacy fallback resolves by mapping_type_id", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_payment_method_mappings")) return [[], []];
      if (sql.includes("outlet_account_mappings")) {
        return [[{ mapping_type_id: 10, mapping_key: null, account_id: 901 }], []];
      }
      if (sql.includes("company_payment_method_mappings")) return [[], []];
      return [[], []];
    });

    const result = await readOutletPaymentMethodMappings(db, 1, 1);
    assert.equal(result.get("QRIS"), 901);
  });

  test("outlet_payment_method_mappings has highest precedence", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_payment_method_mappings")) {
        return [[{ method_code: "CASH", account_id: 300 }], []];
      }
      if (sql.includes("outlet_account_mappings")) {
        return [[{ mapping_key: "CASH", account_id: 500 }], []];
      }
      if (sql.includes("company_payment_method_mappings")) {
        return [[{ method_code: "CASH", account_id: 400 }], []];
      }
      return [[], []];
    });

    const result = await readOutletPaymentMethodMappings(db, 1, 1);
    assert.equal(result.get("CASH"), 300);
  });

  test("legacy outlet_account_mappings fallback works", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_payment_method_mappings")) return [[], []];
      if (sql.includes("outlet_account_mappings")) {
        return [[{ mapping_key: "QRIS", account_id: 501 }], []];
      }
      if (sql.includes("company_payment_method_mappings")) return [[], []];
      return [[], []];
    });

    const result = await readOutletPaymentMethodMappings(db, 1, 1);
    assert.equal(result.get("QRIS"), 501);
  });

  test("company payment method mappings used as final fallback", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_payment_method_mappings")) return [[], []];
      if (sql.includes("outlet_account_mappings")) return [[], []];
      if (sql.includes("company_payment_method_mappings")) {
        return [[{ method_code: "CARD", account_id: 402 }], []];
      }
      return [[], []];
    });

    const result = await readOutletPaymentMethodMappings(db, 1, 1);
    assert.equal(result.get("CARD"), 402);
  });

  test("handles lowercase method codes", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("outlet_payment_method_mappings")) {
        return [[{ method_code: "cash", account_id: 300 }], []];
      }
      if (sql.includes("outlet_account_mappings")) return [[], []];
      if (sql.includes("company_payment_method_mappings")) {
        return [[{ method_code: "CASH", account_id: 400 }], []];
      }
      return [[], []];
    });

    const result = await readOutletPaymentMethodMappings(db, 1, 1);
    assert.equal(result.get("CASH"), 300);
  });
});
