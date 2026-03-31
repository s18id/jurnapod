// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent } from "../../tests/integration/integration-harness.mjs";
import { createSupply, deleteSupply, findSupplyById, listSupplies, updateSupply } from "./supplies/index.js";
import { DatabaseConflictError } from "./master-data-errors.js";
import { closeDbPool, getDb } from "./db";
import { sql } from "kysely";

loadEnvIfPresent();

test(
  "listSupplies respects company scope and isActive filter",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let otherCompanyId = 0;
    let supplyId1 = 0;
    let supplyId2 = 0;
    let supplyId3 = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const otherCompanyRows = await sql`
        SELECT id FROM companies WHERE code != ${companyCode} AND deleted_at IS NULL LIMIT 1
      `.execute(db);
      if (otherCompanyRows.rows.length > 0) {
        otherCompanyId = Number((otherCompanyRows.rows[0] as { id: number }).id);
      }

      const supply1 = await createSupply(companyId, {
        sku: `LIST-${runId}-1`,
        name: `Active Supply ${runId}`,
        unit: "box",
        is_active: true
      });
      supplyId1 = supply1.id;

      const supply2 = await createSupply(companyId, {
        sku: `LIST-${runId}-2`,
        name: `Inactive Supply ${runId}`,
        unit: "pack",
        is_active: false
      });
      supplyId2 = supply2.id;

      const allSupplies = await listSupplies(companyId);
      const found1 = allSupplies.some((s) => s.id === supplyId1);
      const found2 = allSupplies.some((s) => s.id === supplyId2);
      assert.equal(found1, true, "Active supply should be in unfiltered list");
      assert.equal(found2, true, "Inactive supply should be in unfiltered list");

      const activeSupplies = await listSupplies(companyId, { isActive: true });
      const active1 = activeSupplies.some((s) => s.id === supplyId1);
      const active2 = activeSupplies.some((s) => s.id === supplyId2);
      assert.equal(active1, true, "Active filter should include active supply");
      assert.equal(active2, false, "Active filter should exclude inactive supply");

      const inactiveSupplies = await listSupplies(companyId, { isActive: false });
      const inactive1 = inactiveSupplies.some((s) => s.id === supplyId1);
      const inactive2 = inactiveSupplies.some((s) => s.id === supplyId2);
      assert.equal(inactive1, false, "Inactive filter should exclude active supply");
      assert.equal(inactive2, true, "Inactive filter should include inactive supply");

      if (otherCompanyId > 0) {
        const supply3 = await createSupply(otherCompanyId, {
          sku: `LIST-${runId}-3`,
          name: `Other Company Supply ${runId}`,
          unit: "unit",
          is_active: true
        });
        supplyId3 = supply3.id;

        const otherCompanySupplies = await listSupplies(otherCompanyId);
        const belongsToOther = otherCompanySupplies.some((s) => s.id === supplyId3);
        const leakedToMain = otherCompanySupplies.some((s) => s.id === supplyId1);
        assert.equal(belongsToOther, true, "Other company should see their supply");
        assert.equal(leakedToMain, false, "Main company supply should not leak to other company");
      }
    } finally {
      if (supplyId1 > 0) {
        await sql`DELETE FROM supplies WHERE id = ${supplyId1}`.execute(db);
      }
      if (supplyId2 > 0) {
        await sql`DELETE FROM supplies WHERE id = ${supplyId2}`.execute(db);
      }
      if (supplyId3 > 0) {
        await sql`DELETE FROM supplies WHERE id = ${supplyId3}`.execute(db);
      }
    }
  }
);

test(
  "createSupply defaults unit='unit' and is_active=true when omitted",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const supply = await createSupply(companyId, {
        name: `Default Test Supply ${runId}`
      });
      supplyId = supply.id;

      assert.equal(supply.unit, "unit", "Default unit should be 'unit'");
      assert.equal(supply.is_active, true, "Default is_active should be true");

      const fromDb = await findSupplyById(companyId, supplyId);
      assert.ok(fromDb, "Supply should be retrievable");
      assert.equal(fromDb!.unit, "unit");
      assert.equal(fromDb!.is_active, true);
    } finally {
      if (supplyId > 0) {
        await sql`DELETE FROM supplies WHERE id = ${supplyId}`.execute(db);
      }
    }
  }
);

test(
  "createSupply duplicate sku throws DatabaseConflictError",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const supply = await createSupply(companyId, {
        sku: `DUP-${runId}`,
        name: `First Supply ${runId}`
      });
      supplyId = supply.id;

      let conflictThrown = false;
      try {
        await createSupply(companyId, {
          sku: `DUP-${runId}`,
          name: `Duplicate Supply ${runId}`
        });
      } catch (err) {
        if (err instanceof DatabaseConflictError) {
          conflictThrown = true;
        } else {
          throw err;
        }
      }
      assert.equal(conflictThrown, true, "Should throw DatabaseConflictError for duplicate SKU");
    } finally {
      if (supplyId > 0) {
        await sql`DELETE FROM supplies WHERE id = ${supplyId}`.execute(db);
      }
    }
  }
);

test(
  "findSupplyById is tenant-scoped",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let otherCompanyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const otherCompanyRows = await sql`
        SELECT id FROM companies WHERE code != ${companyCode} AND deleted_at IS NULL LIMIT 1
      `.execute(db);
      if (otherCompanyRows.rows.length > 0) {
        otherCompanyId = Number((otherCompanyRows.rows[0] as { id: number }).id);
      }

      if (otherCompanyId === 0) {
        return;
      }

      const supply = await createSupply(companyId, {
        name: `Scoped Supply ${runId}`
      });
      supplyId = supply.id;

      const foundInOwnCompany = await findSupplyById(companyId, supplyId);
      assert.ok(foundInOwnCompany, "Should find supply in own company");

      const foundInOtherCompany = await findSupplyById(otherCompanyId, supplyId);
      assert.equal(foundInOtherCompany, null, "Should NOT find supply in other company");
    } finally {
      if (supplyId > 0) {
        await sql`DELETE FROM supplies WHERE id = ${supplyId}`.execute(db);
      }
    }
  }
);

test(
  "updateSupply returns null for missing id",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();

    let companyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const result = await updateSupply(companyId, 999999999, {
        name: "Non-existent Supply"
      });
      assert.equal(result, null, "Should return null for non-existent supply");
    } finally {
    }
  }
);

test(
  "deleteSupply returns false for missing id",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();

    let companyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const result = await deleteSupply(companyId, 999999999);
      assert.equal(result, false, "Should return false for non-existent supply");
    } finally {
    }
  }
);

test.after(async () => {
  await closeDbPool();
});
