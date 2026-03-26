// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent } from "../../tests/integration/integration-harness.mjs";
import { createSupply, deleteSupply, findSupplyById, listSupplies, updateSupply } from "./supplies/index.js";
import { DatabaseConflictError } from "./master-data-errors.js";
import { closeDbPool, getDbPool } from "./db";
import type { RowDataPacket } from "mysql2";

loadEnvIfPresent();

test(
  "listSupplies respects company scope and isActive filter",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let otherCompanyId = 0;
    let supplyId1 = 0;
    let supplyId2 = 0;
    let supplyId3 = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

      const [otherCompanyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code != ? AND deleted_at IS NULL LIMIT 1`,
        [companyCode]
      );
      if (otherCompanyRows.length > 0) {
        otherCompanyId = Number(otherCompanyRows[0].id);
      }

      const [supply1Result] = await pool.execute(
        `INSERT INTO supplies (company_id, sku, name, unit, is_active) VALUES (?, ?, ?, ?, 1)`,
        [companyId, `LIST-${runId}-1`, `Active Supply ${runId}`, "box"]
      );
      supplyId1 = Number((supply1Result as { insertId: number }).insertId);

      const [supply2Result] = await pool.execute(
        `INSERT INTO supplies (company_id, sku, name, unit, is_active) VALUES (?, ?, ?, ?, 0)`,
        [companyId, `LIST-${runId}-2`, `Inactive Supply ${runId}`, "pack"]
      );
      supplyId2 = Number((supply2Result as { insertId: number }).insertId);

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
        const [supply3Result] = await pool.execute(
          `INSERT INTO supplies (company_id, sku, name, unit, is_active) VALUES (?, ?, ?, ?, 1)`,
          [otherCompanyId, `LIST-${runId}-3`, `Other Company Supply ${runId}`, "unit"]
        );
        supplyId3 = Number((supply3Result as { insertId: number }).insertId);

        const otherCompanySupplies = await listSupplies(otherCompanyId);
        const belongsToOther = otherCompanySupplies.some((s) => s.id === supplyId3);
        const leakedToMain = otherCompanySupplies.some((s) => s.id === supplyId1);
        assert.equal(belongsToOther, true, "Other company should see their supply");
        assert.equal(leakedToMain, false, "Main company supply should not leak to other company");
      }
    } finally {
      if (supplyId1 > 0) {
        await pool.execute(`DELETE FROM supplies WHERE id = ?`, [supplyId1]);
      }
      if (supplyId2 > 0) {
        await pool.execute(`DELETE FROM supplies WHERE id = ?`, [supplyId2]);
      }
      if (supplyId3 > 0) {
        await pool.execute(`DELETE FROM supplies WHERE id = ?`, [supplyId3]);
      }
    }
  }
);

test(
  "createSupply defaults unit='unit' and is_active=true when omitted",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

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
        await pool.execute(`DELETE FROM supplies WHERE id = ?`, [supplyId]);
      }
    }
  }
);

test(
  "createSupply duplicate sku throws DatabaseConflictError",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

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
        await pool.execute(`DELETE FROM supplies WHERE id = ?`, [supplyId]);
      }
    }
  }
);

test(
  "findSupplyById is tenant-scoped",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let otherCompanyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

      const [otherCompanyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code != ? AND deleted_at IS NULL LIMIT 1`,
        [companyCode]
      );
      if (otherCompanyRows.length > 0) {
        otherCompanyId = Number(otherCompanyRows[0].id);
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
        await pool.execute(`DELETE FROM supplies WHERE id = ?`, [supplyId]);
      }
    }
  }
);

test(
  "updateSupply returns null for missing id",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();

    let companyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

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
    const pool = getDbPool();

    let companyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

      const result = await deleteSupply(companyId, 999999999);
      assert.equal(result, false, "Should return false for non-existent supply");
    } finally {
    }
  }
);

test.after(async () => {
  await closeDbPool();
});
