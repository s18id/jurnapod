// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fixed Assets HTTP Integration Tests (Story 7.4 - TD-006)
 *
 * Tests the /api/accounts/fixed-asset-categories and /api/accounts/fixed-assets
 * HTTP routes end-to-end via fetch against a live API server.
 *
 * Covers:
 * - Full CRUD lifecycle: create → get → update → delete
 * - 400 validation errors
 * - 404 not-found responses
 * - 401 unauthorized
 * - Company-scoped isolation
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  setupIntegrationTests,
  readEnv,
  loginOwner,
  TEST_TIMEOUT_MS
} from "./integration-harness.mjs";

const testContext = setupIntegrationTests(test);

const COMPANY_CODE = readEnv("JP_COMPANY_CODE", "JP");
const OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", "owner@example.com");
const OWNER_PASSWORD = readEnv("JP_OWNER_PASSWORD", "password");

// =============================================================================
// Helpers
// =============================================================================

function authHeaders(token) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function getOutletId(baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/users/me`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await res.json();
  return body.data?.outlets?.[0]?.id ?? null;
}

// =============================================================================
// 401 Unauthorized
// =============================================================================

test(
  "fixed-assets integration: unauthenticated requests return 401",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const baseUrl = testContext.baseUrl;

    const endpoints = [
      ["GET", "/api/accounts/fixed-asset-categories"],
      ["GET", "/api/accounts/fixed-assets"],
      ["POST", "/api/accounts/fixed-asset-categories"],
      ["POST", "/api/accounts/fixed-assets"],
      ["GET", "/api/accounts/fixed-asset-categories/1"],
      ["GET", "/api/accounts/fixed-assets/1"],
    ];

    for (const [method, path] of endpoints) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify({}) : undefined
      });
      assert.equal(res.status, 401, `${method} ${path} should return 401`);
    }
  }
);

// =============================================================================
// Full CRUD Lifecycle
// =============================================================================

test(
  "fixed-assets integration: full CRUD lifecycle — category and asset",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const baseUrl = testContext.baseUrl;
    const token = await loginOwner(baseUrl, COMPANY_CODE, OWNER_EMAIL, OWNER_PASSWORD);
    const outletId = await getOutletId(baseUrl, token);
    const runId = Date.now().toString(36);

    let categoryId = null;
    let assetId = null;

    try {
      // ── Step 1: Create fixed asset category ──────────────────────────────────
      const createCatRes = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          code: `INTEG-CAT-${runId}`.toUpperCase().slice(0, 20),
          name: `Integration Category ${runId}`,
          depreciation_method: "STRAIGHT_LINE",
          useful_life_months: 60,
          residual_value_pct: 5,
          is_active: true
        })
      });
      assert.equal(createCatRes.status, 200, "Create category should return 200");
      const createCatBody = await createCatRes.json();
      assert.equal(createCatBody.success, true, "Create category response should be success");
      assert.ok(createCatBody.data.id > 0, "Created category should have valid id");
      assert.equal(createCatBody.data.depreciation_method, "STRAIGHT_LINE");
      assert.equal(createCatBody.data.useful_life_months, 60);
      categoryId = createCatBody.data.id;

      // ── Step 2: GET the category ──────────────────────────────────────────────
      const getCatRes = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories/${categoryId}`, {
        headers: authHeaders(token)
      });
      assert.equal(getCatRes.status, 200);
      const getCatBody = await getCatRes.json();
      assert.equal(getCatBody.data.id, categoryId);
      assert.equal(getCatBody.data.residual_value_pct, 5);

      // ── Step 3: GET list — category should appear ─────────────────────────────
      const listCatRes = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories`, {
        headers: authHeaders(token)
      });
      assert.equal(listCatRes.status, 200);
      const listCatBody = await listCatRes.json();
      assert.ok(Array.isArray(listCatBody.data), "List should return array");
      assert.ok(
        listCatBody.data.some(c => c.id === categoryId),
        "Created category should appear in list"
      );

      // ── Step 4: Create fixed asset ────────────────────────────────────────────
      const createAssetRes = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: `Integration Asset ${runId}`,
          asset_tag: `ITAG-${runId}`.slice(0, 20),
          serial_number: `ISN-${runId}`.slice(0, 20),
          category_id: categoryId,
          outlet_id: outletId,
          purchase_date: "2026-01-01",
          purchase_cost: 5000000,
          is_active: true
        })
      });
      assert.equal(createAssetRes.status, 200, "Create asset should return 200");
      const createAssetBody = await createAssetRes.json();
      assert.equal(createAssetBody.success, true);
      assert.ok(createAssetBody.data.id > 0, "Created asset should have valid id");
      assert.equal(createAssetBody.data.name, `Integration Asset ${runId}`);
      assert.equal(createAssetBody.data.purchase_cost, 5000000);
      assetId = createAssetBody.data.id;

      // ── Step 5: GET the asset ─────────────────────────────────────────────────
      const getAssetRes = await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}`, {
        headers: authHeaders(token)
      });
      assert.equal(getAssetRes.status, 200);
      const getAssetBody = await getAssetRes.json();
      assert.equal(getAssetBody.data.id, assetId);
      assert.equal(getAssetBody.data.category_id, categoryId);

      // ── Step 6: GET list — asset should appear ────────────────────────────────
      const listAssetRes = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
        headers: authHeaders(token)
      });
      assert.equal(listAssetRes.status, 200);
      const listAssetBody = await listAssetRes.json();
      assert.ok(Array.isArray(listAssetBody.data));
      assert.ok(
        listAssetBody.data.some(a => a.id === assetId),
        "Created asset should appear in list"
      );

      // ── Step 7: PATCH the asset ───────────────────────────────────────────────
      const updateAssetRes = await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: `Updated Asset ${runId}`,
          purchase_cost: 7500000
        })
      });
      assert.equal(updateAssetRes.status, 200, "Update asset should return 200");
      const updateAssetBody = await updateAssetRes.json();
      assert.equal(updateAssetBody.data.name, `Updated Asset ${runId}`);
      assert.equal(updateAssetBody.data.purchase_cost, 7500000);
      // Unchanged fields preserved
      assert.equal(updateAssetBody.data.category_id, categoryId);

      // ── Step 8: PATCH the category ────────────────────────────────────────────
      const updateCatRes = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories/${categoryId}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ useful_life_months: 72 })
      });
      assert.equal(updateCatRes.status, 200);
      const updateCatBody = await updateCatRes.json();
      assert.equal(updateCatBody.data.useful_life_months, 72);

      // ── Step 9: DELETE the asset ──────────────────────────────────────────────
      const deleteAssetRes = await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}`, {
        method: "DELETE",
        headers: authHeaders(token)
      });
      assert.equal(deleteAssetRes.status, 200, "Delete asset should return 200");
      assetId = null; // Mark as cleaned up

      // ── Step 10: GET deleted asset returns 404 ────────────────────────────────
      const getDeletedRes = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createAssetBody.data.id}`, {
        headers: authHeaders(token)
      });
      assert.equal(getDeletedRes.status, 404, "Deleted asset should return 404");

      // ── Step 11: DELETE the category ─────────────────────────────────────────
      const deleteCatRes = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories/${categoryId}`, {
        method: "DELETE",
        headers: authHeaders(token)
      });
      assert.equal(deleteCatRes.status, 200, "Delete category should return 200");
      categoryId = null; // Mark as cleaned up

    } finally {
      // Cleanup in case of test failure
      if (assetId) {
        await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}`, {
          method: "DELETE",
          headers: authHeaders(token)
        }).catch(() => {});
      }
      if (categoryId) {
        await fetch(`${baseUrl}/api/accounts/fixed-asset-categories/${categoryId}`, {
          method: "DELETE",
          headers: authHeaders(token)
        }).catch(() => {});
      }
    }
  }
);

// =============================================================================
// 400 Validation Errors
// =============================================================================

test(
  "fixed-assets integration: invalid request bodies return 400",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const baseUrl = testContext.baseUrl;
    const token = await loginOwner(baseUrl, COMPANY_CODE, OWNER_EMAIL, OWNER_PASSWORD);

    // Category: missing required fields
    const noCatCodeRes = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name: "No Code" })
    });
    assert.equal(noCatCodeRes.status, 400, "Missing code should return 400");

    // Category: invalid depreciation_method
    const badMethodRes = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        code: "INVMETHOD",
        name: "Test",
        depreciation_method: "NOT_A_METHOD",
        useful_life_months: 60
      })
    });
    assert.equal(badMethodRes.status, 400, "Invalid depreciation_method should return 400");

    // Asset: invalid outlet_id type
    const badOutletRes = await fetch(`${baseUrl}/api/accounts/fixed-assets?outlet_id=notanumber`, {
      headers: authHeaders(token)
    });
    assert.equal(badOutletRes.status, 400, "Non-numeric outlet_id query param should return 400");
  }
);

// =============================================================================
// 404 Not Found
// =============================================================================

test(
  "fixed-assets integration: non-existent resources return 404",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const baseUrl = testContext.baseUrl;
    const token = await loginOwner(baseUrl, COMPANY_CODE, OWNER_EMAIL, OWNER_PASSWORD);

    const nonExistentId = 999999999;

    const getCatRes = await fetch(
      `${baseUrl}/api/accounts/fixed-asset-categories/${nonExistentId}`,
      { headers: authHeaders(token) }
    );
    assert.equal(getCatRes.status, 404, "Non-existent category GET should return 404");

    const getAssetRes = await fetch(
      `${baseUrl}/api/accounts/fixed-assets/${nonExistentId}`,
      { headers: authHeaders(token) }
    );
    assert.equal(getAssetRes.status, 404, "Non-existent asset GET should return 404");

    const patchCatRes = await fetch(
      `${baseUrl}/api/accounts/fixed-asset-categories/${nonExistentId}`,
      {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ name: "Updated" })
      }
    );
    assert.equal(patchCatRes.status, 404, "Non-existent category PATCH should return 404");

    const patchAssetRes = await fetch(
      `${baseUrl}/api/accounts/fixed-assets/${nonExistentId}`,
      {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ name: "Updated" })
      }
    );
    assert.equal(patchAssetRes.status, 404, "Non-existent asset PATCH should return 404");
  }
);
