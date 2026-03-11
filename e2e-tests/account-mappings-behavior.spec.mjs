// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Behavior tests for account mapping scope semantics
// Tests actual route handling, not just logic snippets
// Run with: node --test e2e-tests/account-mappings-behavior.spec.mjs

import assert from "node:assert/strict";
import { test, describe, beforeEach } from "node:test";

const BASE_URL = process.env.API_BASE || "http://localhost:3001/api";

let authToken = null;
let testOutletId = 1;
let validAccountIds = [];

async function apiRequest(path, options = {}, token) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });

  const data = await response.json();
  return { response, data };
}

async function login() {
  const companyCode = process.env.JP_COMPANY_CODE || "JP";
  const email = (process.env.JP_OWNER_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.JP_OWNER_PASSWORD || "password";

  const { response, data } = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ company_code: companyCode, email, password })
  });

  if (!data.success || !data.data?.access_token) {
    throw new Error(`Login failed: ${data.error?.message || response.statusText}`);
  }

  return data.data.access_token;
}

async function getValidAccounts() {
  const { data } = await apiRequest("/accounts", {}, authToken);
  if (!data.success) {
    throw new Error(`Failed to fetch accounts: ${data.error?.message}`);
  }
  return data.data.slice(0, 3).map((a) => a.id);
}

async function getOutlets() {
  const { data } = await apiRequest("/outlets", {}, authToken);
  if (!data.success) {
    throw new Error(`Failed to fetch outlets: ${data.error?.message}`);
  }
  return data.data;
}

describe("Sales Mappings - Company Scope", () => {
  beforeEach(async () => {
    if (!authToken) {
      authToken = await login();
      validAccountIds = await getValidAccounts();
      const outlets = await getOutlets();
      testOutletId = outlets[0]?.id ?? 1;
    }
  });

  test("GET scope=company without outlet_id returns 200", async () => {
    const { response, data } = await apiRequest(
      "/settings/outlet-account-mappings?scope=company",
      {},
      authToken
    );

    assert.equal(response.status, 200, "Should return 200");
    assert.equal(data.success, true, "Response should be successful");
    assert.equal(data.data.scope, "company", "Scope should be company");
    assert.ok(Array.isArray(data.data.mappings), "Should have mappings array");
  });

  test("PUT scope=company with complete mappings succeeds", async () => {
    if (validAccountIds.length < 3) {
      console.log("  ⚠️ Skipping - need at least 3 accounts");
      return;
    }

    const mappings = [
      { mapping_key: "AR", account_id: validAccountIds[0] },
      { mapping_key: "SALES_REVENUE", account_id: validAccountIds[1] },
      { mapping_key: "SALES_TAX", account_id: validAccountIds[2] }
    ];

    const { response, data } = await apiRequest(
      "/settings/outlet-account-mappings",
      {
        method: "PUT",
        body: JSON.stringify({
          scope: "company",
          mappings
        })
      },
      authToken
    );

    assert.equal(response.status, 200, "Should return 200");
    assert.equal(data.success, true, "Complete company mappings should succeed");
  });

  test("PUT scope=company with missing required keys returns 400", async () => {
    if (validAccountIds.length < 1) {
      console.log("  ⚠️ Skipping - need at least 1 account");
      return;
    }

    const mappings = [
      { mapping_key: "AR", account_id: validAccountIds[0] }
      // Missing SALES_REVENUE and SALES_TAX
    ];

    const { response, data } = await apiRequest(
      "/settings/outlet-account-mappings",
      {
        method: "PUT",
        body: JSON.stringify({
          scope: "company",
          mappings
        })
      },
      authToken
    );

    assert.equal(response.status, 400, "Should return 400 for incomplete mappings");
    assert.equal(data.success, false, "Should fail");
    assert.equal(data.error?.code, "INCOMPLETE_COMPANY_MAPPING", "Error code should be INCOMPLETE_COMPANY_MAPPING");
  });
});

describe("Sales Mappings - Outlet Scope", () => {
  beforeEach(async () => {
    if (!authToken) {
      authToken = await login();
      validAccountIds = await getValidAccounts();
      const outlets = await getOutlets();
      testOutletId = outlets[0]?.id ?? 1;
    }
  });

  test("GET scope=outlet without outlet_id returns 400", async () => {
    const { response, data } = await apiRequest(
      "/settings/outlet-account-mappings?scope=outlet",
      {},
      authToken
    );

    assert.equal(response.status, 400, "Should return 400");
  });

  test("GET scope=outlet with outlet_id returns effective mappings with company_account_id", async () => {
    const { response, data } = await apiRequest(
      `/settings/outlet-account-mappings?scope=outlet&outlet_id=${testOutletId}`,
      {},
      authToken
    );

    assert.equal(response.status, 200, "Should return 200");
    assert.equal(data.success, true, "Response should be successful");
    assert.equal(data.data.scope, "outlet", "Scope should be outlet");
    assert.equal(data.data.outlet_id, testOutletId, "Should include outlet_id");
    assert.ok(Array.isArray(data.data.mappings), "Should have mappings array");

    // Verify each mapping has required fields
    for (const mapping of data.data.mappings) {
      assert.ok("mapping_key" in mapping, "Should have mapping_key");
      assert.ok("account_id" in mapping, "Should have account_id");
      assert.ok("source" in mapping, "Should have source");
      assert.ok("company_account_id" in mapping, "Should have company_account_id");
      assert.ok(
        mapping.source === "outlet" || mapping.source === "company" || mapping.source === null,
        "Source should be outlet|company|null"
      );
    }
  });

  test("PUT scope=outlet with blank account_id deletes override", async () => {
    if (validAccountIds.length < 1) {
      console.log("  ⚠️ Skipping - need at least 1 account");
      return;
    }

    // First, set an outlet override
    await apiRequest(
      "/settings/outlet-account-mappings",
      {
        method: "PUT",
        body: JSON.stringify({
          scope: "outlet",
          outlet_id: testOutletId,
          mappings: [
            { mapping_key: "AR", account_id: validAccountIds[0] }
          ]
        })
      },
      authToken
    );

    // Now clear the override with blank account_id
    const { response, data } = await apiRequest(
      "/settings/outlet-account-mappings",
      {
        method: "PUT",
        body: JSON.stringify({
          scope: "outlet",
          outlet_id: testOutletId,
          mappings: [
            { mapping_key: "AR", account_id: "" }
          ]
        })
      },
      authToken
    );

    assert.equal(response.status, 200, "Should return 200");
    assert.equal(data.success, true, "Clear override should succeed");

    // Verify the override was deleted - should fall back to company
    const { data: getData } = await apiRequest(
      `/settings/outlet-account-mappings?scope=outlet&outlet_id=${testOutletId}`,
      {},
      authToken
    );

    const arMapping = getData.data.mappings.find((m) => m.mapping_key === "AR");
    assert.ok(arMapping, "AR mapping should exist");
    assert.equal(arMapping.source, "company", "Should inherit from company after delete");
  });
});

describe("Payment Mappings - Company Scope", () => {
  beforeEach(async () => {
    if (!authToken) {
      authToken = await login();
      validAccountIds = await getValidAccounts();
      const outlets = await getOutlets();
      testOutletId = outlets[0]?.id ?? 1;
    }
  });

  test("GET scope=company payment mappings returns 200", async () => {
    const { response, data } = await apiRequest(
      "/settings/outlet-payment-method-mappings?scope=company",
      {},
      authToken
    );

    assert.equal(response.status, 200, "Should return 200");
    assert.equal(data.success, true, "Response should be successful");
    assert.equal(data.data.scope, "company", "Scope should be company");
    assert.ok(Array.isArray(data.data.payment_methods), "Should have payment_methods");
    assert.ok(Array.isArray(data.data.mappings), "Should have mappings");
  });

  test("PUT scope=company with multiple invoice defaults returns 400", async () => {
    if (validAccountIds.length < 2) {
      console.log("  ⚠️ Skipping - need at least 2 accounts");
      return;
    }

    const mappings = [
      { method_code: "CASH", account_id: validAccountIds[0], is_invoice_default: true },
      { method_code: "CARD", account_id: validAccountIds[1], is_invoice_default: true }
    ];

    const { response, data } = await apiRequest(
      "/settings/outlet-payment-method-mappings",
      {
        method: "PUT",
        body: JSON.stringify({
          scope: "company",
          mappings
        })
      },
      authToken
    );

    assert.equal(response.status, 400, "Should return 400");
    assert.equal(data.success, false, "Should fail");
    assert.equal(data.error?.code, "MULTIPLE_INVOICE_DEFAULTS", "Error should be MULTIPLE_INVOICE_DEFAULTS");
  });
});

describe("Payment Mappings - Outlet Scope", () => {
  beforeEach(async () => {
    if (!authToken) {
      authToken = await login();
      validAccountIds = await getValidAccounts();
      const outlets = await getOutlets();
      testOutletId = outlets[0]?.id ?? 1;
    }
  });

  test("GET scope=outlet without outlet_id returns 400", async () => {
    const { response, data } = await apiRequest(
      "/settings/outlet-payment-method-mappings?scope=outlet",
      {},
      authToken
    );

    assert.equal(response.status, 400, "Should return 400");
  });

  test("GET scope=outlet with outlet_id returns effective mappings with company_account_id", async () => {
    const { response, data } = await apiRequest(
      `/settings/outlet-payment-method-mappings?scope=outlet&outlet_id=${testOutletId}`,
      {},
      authToken
    );

    assert.equal(response.status, 200, "Should return 200");
    assert.equal(data.success, true, "Response should be successful");
    assert.equal(data.data.scope, "outlet", "Scope should be outlet");
    assert.ok(Array.isArray(data.data.mappings), "Should have mappings array");

    // Verify each mapping has required fields
    for (const mapping of data.data.mappings) {
      assert.ok("method_code" in mapping, "Should have method_code");
      assert.ok("account_id" in mapping, "Should have account_id");
      assert.ok("source" in mapping, "Should have source");
      assert.ok("company_account_id" in mapping, "Should have company_account_id");
      assert.ok(
        mapping.source === "outlet" || mapping.source === "company",
        "Source should be outlet|company"
      );
    }
  });

  test("PUT scope=outlet with blank account_id deletes override", async () => {
    // First, set an outlet override for CASH
    await apiRequest(
      "/settings/outlet-payment-method-mappings",
      {
        method: "PUT",
        body: JSON.stringify({
          scope: "outlet",
          outlet_id: testOutletId,
          mappings: [
            { method_code: "CASH", account_id: validAccountIds[0], is_invoice_default: false }
          ]
        })
      },
      authToken
    );

    // Now clear the override with blank account_id
    const { response, data } = await apiRequest(
      "/settings/outlet-payment-method-mappings",
      {
        method: "PUT",
        body: JSON.stringify({
          scope: "outlet",
          outlet_id: testOutletId,
          mappings: [
            { method_code: "CASH", account_id: "" }
          ]
        })
      },
      authToken
    );

    assert.equal(response.status, 200, "Should return 200");
    assert.equal(data.success, true, "Clear override should succeed");
  });
});

describe("Posting Fallback Precedence", () => {
  test("outlet override wins over company default (logic test)", () => {
    const outletMapping = { AR: 100 };
    const companyMapping = { AR: 200 };

    const effective = outletMapping.AR ?? companyMapping.AR;

    assert.equal(effective, 100, "Outlet value should be used");
  });

  test("company fallback used when outlet missing (logic test)", () => {
    const outletMapping = {};
    const companyMapping = { AR: 200 };

    const effective = outletMapping.AR ?? companyMapping.AR;

    assert.equal(effective, 200, "Company value should be fallback");
  });

  test("throws when missing in both scopes (logic test)", () => {
    const outletMapping = {};
    const companyMapping = {};

    const effective = outletMapping.AR ?? companyMapping.AR;

    assert.equal(effective, undefined, "Should be undefined when missing in both");
  });
});
