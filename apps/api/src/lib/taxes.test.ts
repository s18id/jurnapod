// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Unit tests for tax utilities.
// Run with: node --test --import tsx apps/api/src/lib/taxes.test.ts

import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { FieldPacket, RowDataPacket } from "mysql2";
import { listCompanyDefaultTaxRates } from "./taxes";

type QueryExecutor = Parameters<typeof listCompanyDefaultTaxRates>[0];

function makeExecutor(impl: (sql: string, params: unknown[]) => [unknown[], unknown[]]) {
  const execute = mock.fn(async (sql: string, params?: unknown[]) => impl(sql, params ?? []) as [RowDataPacket[], FieldPacket[]]);
  return { execute } as unknown as QueryExecutor;
}

describe("listCompanyDefaultTaxRates company_id scoping", () => {
  test("enforces company_id on both company_tax_defaults and tax_rates", async () => {
    const captured: { sql: string; params: unknown[] }[] = [];

    const db = makeExecutor((sql, params) => {
      captured.push({ sql, params });
      return [[], []];
    });

    await listCompanyDefaultTaxRates(db, 42);

    assert.equal(captured.length, 1, "should execute exactly one query");
    const { sql, params } = captured[0];

    assert.ok(
      sql.includes("ctd.company_id = ?"),
      "query should filter company_tax_defaults by company_id"
    );
    assert.ok(
      sql.includes("tr.company_id = ?"),
      "query should filter tax_rates by company_id"
    );
    assert.ok(
      sql.includes("tr.company_id = ctd.company_id"),
      "query should join on matching company_id"
    );

    assert.equal(params.length, 2, "should pass companyId twice");
    assert.equal(params[0], 42, "first param should be companyId");
    assert.equal(params[1], 42, "second param should be companyId");
  });

  test("returns tax rates with correct shape when found", async () => {
    const db = makeExecutor(() => [[
      {
        id: 1,
        company_id: 5,
        code: "TAX01",
        name: "Test Tax",
        rate_percent: 10,
        account_id: 100,
        is_inclusive: 0,
        is_active: 1
      }
    ], []]);

    const result = await listCompanyDefaultTaxRates(db, 5);

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 1);
    assert.equal(result[0].company_id, 5);
    assert.equal(result[0].code, "TAX01");
    assert.equal(result[0].rate_percent, 10);
    assert.equal(result[0].account_id, 100);
    assert.equal(result[0].is_inclusive, false);
    assert.equal(result[0].is_active, true);
  });

  test("returns empty array when no defaults configured", async () => {
    const db = makeExecutor(() => [[], []]);

    const result = await listCompanyDefaultTaxRates(db, 99);

    assert.equal(result.length, 0);
  });

  test("filters out inactive tax rates", async () => {
    const db = makeExecutor((sql) => {
      if (sql.includes("tr.is_active = 1")) {
        return [[], []];
      }
      return [[
        {
          id: 2,
          company_id: 7,
          code: "INACTIVE",
          name: "Inactive Tax",
          rate_percent: 5,
          account_id: 200,
          is_inclusive: 0,
          is_active: 0
        }
      ], []];
    });

    const result = await listCompanyDefaultTaxRates(db, 7);

    assert.equal(result.length, 0);
  });
});
