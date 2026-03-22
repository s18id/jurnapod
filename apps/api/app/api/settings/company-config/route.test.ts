// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createIntegrationTestContext,
  loginOwner,
  readEnv,
  TEST_TIMEOUT_MS
} from "../../../../tests/integration/integration-harness.mjs";

const testContext = createIntegrationTestContext();
let baseUrl = "";

test.before(async () => {
  await testContext.start();
  baseUrl = testContext.baseUrl;
});

test.after(async () => {
  await testContext.stop();
});

test(
  "GET/PUT /api/settings/company-config supports reservation default duration",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";
    const key = "feature.reservation.default_duration_minutes";

    const token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    };

    let originalValue = 120;

    const readCurrent = async (): Promise<number> => {
      const getResponse = await fetch(`${baseUrl}/api/settings/company-config?keys=${encodeURIComponent(key)}`, {
        method: "GET",
        headers
      });
      const getPayload = await getResponse.json();
      assert.strictEqual(getResponse.status, 200, JSON.stringify(getPayload));
      assert.ok(Array.isArray(getPayload.data?.settings));
      const row = getPayload.data.settings.find((setting: { key: string }) => setting.key === key);
      assert.ok(row, "Expected setting row in response");
      const value = Number(row.value);
      assert.ok(Number.isFinite(value), "Setting value should be numeric");
      return value;
    };

    originalValue = await readCurrent();

    try {
      const updatedValue = originalValue === 150 ? 180 : 150;
      const putResponse = await fetch(`${baseUrl}/api/settings/company-config`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          settings: [{ key, value: updatedValue }]
        })
      });
      const putPayload = await putResponse.json();
      assert.strictEqual(putResponse.status, 200, JSON.stringify(putPayload));
      assert.strictEqual(putPayload.success, true);

      const nextValue = await readCurrent();
      assert.strictEqual(nextValue, updatedValue);

      const invalidResponse = await fetch(`${baseUrl}/api/settings/company-config`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          settings: [{ key, value: 10 }]
        })
      });
      const invalidPayload = await invalidResponse.json();
      assert.strictEqual(invalidResponse.status, 400, JSON.stringify(invalidPayload));
      assert.strictEqual(invalidPayload.error?.code, "INVALID_REQUEST");
    } finally {
      await fetch(`${baseUrl}/api/settings/company-config`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          settings: [{ key, value: originalValue }]
        })
      });
    }
  }
);

test(
  "GET /api/settings/company-config requires authentication",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const response = await fetch(
      `${baseUrl}/api/settings/company-config?keys=${encodeURIComponent("feature.reservation.default_duration_minutes")}`,
      { method: "GET" }
    );
    const payload = await response.json();
    assert.strictEqual(response.status, 401, JSON.stringify(payload));
  }
);
