import assert from "node:assert/strict";
import {test, describe, beforeAll, afterAll, afterEach} from 'vitest';
import { closeDbPool, getDb, type KyselySchema } from "../../src/lib/db";
import { createTestCompanyMinimal } from "../../src/lib/test-fixtures";
import { listCompanyDefaultTaxRatesKysely } from "../../src/lib/taxes-kysely";

describe("listCompanyDefaultTaxRatesKysely company_id scoping", () => {
  let db: KyselySchema;
  let companyAId: number;
  let companyBId: number;

  beforeAll(async () => {
    db = getDb();
    const companyA = await createTestCompanyMinimal({
      code: `TAXA-${Date.now().toString(36)}`,
      name: "Tax Company A",
    });
    const companyB = await createTestCompanyMinimal({
      code: `TAXB-${Date.now().toString(36)}`,
      name: "Tax Company B",
    });

    companyAId = companyA.id;
    companyBId = companyB.id;
  });

  afterEach(async () => {
    await db.deleteFrom("company_tax_defaults").where("company_id", "in", [companyAId, companyBId]).execute();
    await db.deleteFrom("tax_rates").where("company_id", "in", [companyAId, companyBId]).execute();
  });

  afterAll(async () => {
    await db.deleteFrom("outlets").where("company_id", "in", [companyAId, companyBId]).execute();
    await db.deleteFrom("companies").where("id", "in", [companyAId, companyBId]).execute();
    await closeDbPool();
  });

  test("enforces company_id on both company_tax_defaults and tax_rates", async () => {
    const firstTax = await db
      .insertInto("tax_rates")
      .values({
        company_id: companyAId,
        code: `A-TAX-${Date.now()}`,
        name: "Company A Tax",
        rate_percent: 10,
        account_id: null,
        is_inclusive: 0,
        is_active: 1,
      })
      .executeTakeFirstOrThrow();

    const secondTax = await db
      .insertInto("tax_rates")
      .values({
        company_id: companyBId,
        code: `B-TAX-${Date.now()}`,
        name: "Company B Tax",
        rate_percent: 12,
        account_id: null,
        is_inclusive: 0,
        is_active: 1,
      })
      .executeTakeFirstOrThrow();

    await db
      .insertInto("company_tax_defaults")
      .values({
        company_id: companyAId,
        tax_rate_id: Number(firstTax.insertId),
        created_by_user_id: null,
        updated_by_user_id: null,
      })
      .execute();

    await db
      .insertInto("company_tax_defaults")
      .values({
        company_id: companyBId,
        tax_rate_id: Number(secondTax.insertId),
        created_by_user_id: null,
        updated_by_user_id: null,
      })
      .execute();

    const result = await listCompanyDefaultTaxRatesKysely(companyAId);

    assert.equal(result.length, 1);
    assert.equal(result[0].company_id, companyAId);
    assert.equal(result[0].name, "Company A Tax");
  });

  test("returns tax rates with correct shape when found", async () => {
    const tax = await db
      .insertInto("tax_rates")
      .values({
        company_id: companyAId,
        code: `TAX01-${Date.now()}`,
        name: "Test Tax",
        rate_percent: 10,
        account_id: null,
        is_inclusive: 0,
        is_active: 1,
      })
      .executeTakeFirstOrThrow();

    await db
      .insertInto("company_tax_defaults")
      .values({
        company_id: companyAId,
        tax_rate_id: Number(tax.insertId),
        created_by_user_id: null,
        updated_by_user_id: null,
      })
      .execute();

    const result = await listCompanyDefaultTaxRatesKysely(companyAId);

    assert.equal(result.length, 1);
    assert.equal(result[0].company_id, companyAId);
    assert.equal(result[0].code.startsWith("TAX01"), true);
    assert.equal(result[0].name, "Test Tax");
    assert.equal(result[0].rate_percent, 10);
    assert.equal(result[0].account_id, null);
    assert.equal(result[0].is_inclusive, false);
    assert.equal(result[0].is_active, true);
  });

  test("returns empty array when no defaults configured", async () => {
    const result = await listCompanyDefaultTaxRatesKysely(companyAId);
    assert.equal(result.length, 0);
  });

  test("filters out inactive tax rates", async () => {
    const tax = await db
      .insertInto("tax_rates")
      .values({
        company_id: companyAId,
        code: `INACTIVE-${Date.now()}`,
        name: "Inactive Tax",
        rate_percent: 5,
        account_id: null,
        is_inclusive: 0,
        is_active: 0,
      })
      .executeTakeFirstOrThrow();

    await db
      .insertInto("company_tax_defaults")
      .values({
        company_id: companyAId,
        tax_rate_id: Number(tax.insertId),
        created_by_user_id: null,
        updated_by_user_id: null,
      })
      .execute();

    const result = await listCompanyDefaultTaxRatesKysely(companyAId);
    assert.equal(result.length, 0);
  });

  test("preserves null account_id as null", async () => {
    const tax = await db
      .insertInto("tax_rates")
      .values({
        company_id: companyAId,
        code: `NULLACC-${Date.now()}`,
        name: "Tax Without Account",
        rate_percent: 15,
        account_id: null,
        is_inclusive: 0,
        is_active: 1,
      })
      .executeTakeFirstOrThrow();

    await db
      .insertInto("company_tax_defaults")
      .values({
        company_id: companyAId,
        tax_rate_id: Number(tax.insertId),
        created_by_user_id: null,
        updated_by_user_id: null,
      })
      .execute();

    const result = await listCompanyDefaultTaxRatesKysely(companyAId);
    assert.equal(result.length, 1);
    assert.equal(result[0].account_id, null);
  });
});
