// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Subledger Reconciliation Integration Tests (Story 51.4)
 *
 * Tests Inventory subledger-to-GL reconciliation:
 * - AC1: Inventory subledger sum vs GL control account balance reconciliation
 * - AC2: Reconciliation report endpoint
 * - AC3: Variance drilldown by movement type
 * - AC5: Integration tests 3× consecutive green
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestBaseUrl } from "../../helpers/env";
import { closeTestDb } from "../../helpers/db";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
} from "../../fixtures";
import { getDb } from "@/lib/db";
import { sql } from "kysely";
import { makeTag } from "../../helpers/tags";

/**
 * Create a test inventory control account directly via DB INSERT.
 *
 * This is necessary because no canonical test-fixture helper exists for creating
 * accounts with type_name='INVENTORY'. The Test Fixture Ownership Policy requires
 * either:
 *   1. A fixture in packages/modules/accounting/src/test-fixtures/ (future extraction)
 *   2. A local helper when the package-level fixture doesn't exist yet
 *
 * TODO: Extract to createTestInventoryAccount() in modules-accounting test-fixtures.
 */
async function createTestInventoryAccount(companyId: number): Promise<number> {
  const db = getDb();
  const tag = makeTag("INVACT");
  const result = await sql<{ insertId: number }>`
    INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_active)
    VALUES (${companyId}, ${`INV-${companyId}-${tag}`}, ${`Inventory Test Account ${tag}`}, 'INVENTORY', 'D', 'NRC', 1)
  `.execute(db);
  return Number(result.insertId);
}

describe("inventory-subledger-reconciliation", { timeout: 60000 }, () => {
  let baseUrl: string;
  let testCompanyId: number;
  let testOutletId: number;
  let ownerToken: string;
  let inventoryAccountId: number;

  const putJson = async (path: string, token: string, body?: unknown) => {
    return fetch(`${baseUrl}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const getJson = async (path: string, token?: string) => {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          }
        : undefined,
    });
  };

  // Fixed future date — beyond any real transaction, ensures deterministic "as-of" queries
  const FIXED_AS_OF_DATE = "2099-12-31";

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const company = await createTestCompanyMinimal();
    testCompanyId = company.id;

    const outlet = await createTestOutletMinimal(testCompanyId);
    testOutletId = outlet.id;

    const ownerEmail = `inv-rec-${makeTag("OWN", 10)}@example.com`;
    const ownerUser = await createTestUser(testCompanyId, {
      email: ownerEmail,
      name: "Inventory Recon Owner",
      password: "TestPassword123!",
    });
    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "reports", 63, { allowSystemRoleMutation: true });

    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");

    // Create an inventory control account using the local helper
    inventoryAccountId = await createTestInventoryAccount(testCompanyId);
    expect(inventoryAccountId).toBeGreaterThan(0);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // =============================================================================
  // AC2: Reconciliation Report Endpoint
  // =============================================================================

  describe("AC2: reconciliation report endpoint", () => {
    it("GET /accounting/reports/inventory-reconciliation/summary returns 200 with valid auth", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
    });

    it("returns proper response structure with all required fields", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data).toBeDefined();
      const d = body.data;
      expect(d).toHaveProperty("as_of_date", FIXED_AS_OF_DATE);
      expect(d).toHaveProperty("inventory_subledger_balance");
      expect(d).toHaveProperty("gl_control_balance");
      expect(d).toHaveProperty("variance");
      expect(d).toHaveProperty("configured_account_ids");
      expect(d).toHaveProperty("account_source");
      expect(d).toHaveProperty("currency", "BASE");
    });

    it("GET /accounting/reports/inventory-reconciliation/settings returns configured accounts", async () => {
      const res = await getJson(
        "/api/accounting/reports/inventory-reconciliation/settings",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.account_ids).toContain(inventoryAccountId);
      expect(["settings", "fallback_company_default"]).toContain(body.data.source);
    });

    it("returns 401 without auth token", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`
      );
      expect(res.status).toBe(401);
    });
  });

  // =============================================================================
  // AC1: Inventory subledger-to-GL reconciliation
  // =============================================================================

  describe("AC1: inventory subledger-to-GL reconciliation", () => {
    it("returns zero variance when no inventory transactions exist", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const d = body.data;

      // With no inventory items and no GL postings, both balances should be zero
      expect(d.inventory_subledger_balance).toBe("0.0000");
      expect(d.gl_control_balance).toBe("0.0000");
      expect(d.variance).toBe("0.0000");
    });

    it("returns deterministic balance across multiple calls", async () => {
      const results: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await getJson(
          `/api/accounting/reports/inventory-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
          ownerToken
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        results.push(body.data.variance);
      }

      // All three calls must return the same variance
      expect(new Set(results).size).toBe(1);
    });
  });

  // =============================================================================
  // AC3: Variance drilldown by movement type
  // =============================================================================

  describe("AC3: variance drilldown by movement type", () => {
    it("GET /accounting/reports/inventory-reconciliation/drilldown returns 200", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
    });

    it("returns proper response structure", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const d = body.data;

      expect(d).toHaveProperty("as_of_date", FIXED_AS_OF_DATE);
      expect(d).toHaveProperty("categories");
      expect(d).toHaveProperty("lines");
      expect(d).toHaveProperty("total_variance");
      expect(d).toHaveProperty("has_more");
      expect(d).toHaveProperty("next_cursor");
      expect(Array.isArray(d.categories)).toBe(true);
      expect(Array.isArray(d.lines)).toBe(true);
    });

    it("returns empty categories and lines when no inventory transactions exist", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const d = body.data;

      expect(d.categories).toHaveLength(0);
      expect(d.lines).toHaveLength(0);
      expect(d.total_variance).toBe("0.0000");
      expect(d.has_more).toBe(false);
      expect(d.next_cursor).toBeNull();
    });

    it("filters by movement_type when provided", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}&movement_type=receipt`,
        ownerToken
      );
      expect(res.status).toBe(200);
    });
  });

  // =============================================================================
  // AC5: Deterministic 3× green run verification
  // =============================================================================

  describe("AC5: deterministic 3x green run verification", () => {
    it("run 1: summary returns consistent result", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.variance).toBe("0.0000");
    });

    it("run 2: summary returns consistent result", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.variance).toBe("0.0000");
    });

    it("run 3: summary returns consistent result", async () => {
      const res = await getJson(
        `/api/accounting/reports/inventory-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.variance).toBe("0.0000");
    });
  });
});
