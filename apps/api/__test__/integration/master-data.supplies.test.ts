// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import {test, afterAll} from 'vitest';
import { loadEnvIfPresent } from "../../tests/integration/integration-harness.js";
import { closeDbPool, getDb } from "../../src/lib/db";

loadEnvIfPresent();

const {
  createSupply,
  deleteSupply,
  findSupplyById,
  listSupplies,
  updateSupply,
  DatabaseConflictError,
} = await import("../../src/lib/supplies/index.js");

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getCompanyIdByCode(companyCode: string): Promise<number> {
  const db = getDb();
  const row = await db
    .selectFrom("companies")
    .where("code", "=", companyCode)
    .select(["id"])
    .limit(1)
    .executeTakeFirst();

  assert.ok(row, "Company fixture not found");
  return Number(row.id);
}

async function getOtherCompanyId(companyCode: string): Promise<number> {
  const db = getDb();
  const row = await db
    .selectFrom("companies")
    .where("code", "!=", companyCode)
    .where("deleted_at", "is", null)
    .select(["id"])
    .limit(1)
    .executeTakeFirst();

  return row ? Number(row.id) : 0;
}

test(
  "@slow listSupplies respects company scope and isActive filter",
  { concurrent: false, timeout: 60000 },
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
      companyId = await getCompanyIdByCode(companyCode);
      otherCompanyId = await getOtherCompanyId(companyCode);

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
        await db.deleteFrom("supplies").where("id", "=", supplyId1).execute();
      }
      if (supplyId2 > 0) {
        await db.deleteFrom("supplies").where("id", "=", supplyId2).execute();
      }
      if (supplyId3 > 0) {
        await db.deleteFrom("supplies").where("id", "=", supplyId3).execute();
      }
    }
  }
);

test(
  "createSupply defaults unit='unit' and is_active=true when omitted",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      companyId = await getCompanyIdByCode(companyCode);

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
        await db.deleteFrom("supplies").where("id", "=", supplyId).execute();
      }
    }
  }
);

test(
  "@slow createSupply duplicate sku throws DatabaseConflictError",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      companyId = await getCompanyIdByCode(companyCode);

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
        await db.deleteFrom("supplies").where("id", "=", supplyId).execute();
      }
    }
  }
);

test(
  "@slow findSupplyById is tenant-scoped",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let otherCompanyId = 0;
    let supplyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    try {
      companyId = await getCompanyIdByCode(companyCode);
      otherCompanyId = await getOtherCompanyId(companyCode);

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
        await db.deleteFrom("supplies").where("id", "=", supplyId).execute();
      }
    }
  }
);

test(
  "@slow updateSupply returns null for missing id",
  { concurrent: false, timeout: 60000 },
  async () => {
    let companyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    companyId = await getCompanyIdByCode(companyCode);

    const result = await updateSupply(companyId, 999999999, {
      name: "Non-existent Supply"
    });
    assert.equal(result, null, "Should return null for non-existent supply");
  }
);

test(
  "@slow deleteSupply returns false for missing id",
  { concurrent: false, timeout: 60000 },
  async () => {
    let companyId = 0;

    const companyCode = process.env.JP_COMPANY_CODE ?? "JP";

    companyId = await getCompanyIdByCode(companyCode);

    const result = await deleteSupply(companyId, 999999999);
    assert.equal(result, false, "Should return false for non-existent supply");
  }
);

afterAll(async () => {
  await withTimeout(closeDbPool(), 10000, "closeDbPool");

  // Final safety net: release lingering active handles that can keep node:test alive.
  // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
  const activeHandles: unknown[] = typeof process._getActiveHandles === "function"
    // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
    ? process._getActiveHandles()
    : [];

  for (const handle of activeHandles) {
    if (handle === process.stdin || handle === process.stdout || handle === process.stderr) {
      continue;
    }

    const maybeHandle = handle as {
      destroy?: () => void;
      close?: () => void;
      unref?: () => void;
      end?: () => void;
    };

    try {
      maybeHandle.unref?.();
      maybeHandle.end?.();
      maybeHandle.destroy?.();
      maybeHandle.close?.();
    } catch {
      // ignore cleanup best-effort errors
    }
  }
});
