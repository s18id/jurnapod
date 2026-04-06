// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from "node:url";
import {
  setupIntegrationTests,
  readEnv,
  dbConfigFromEnv,
  delay,
  getFreePort,
  startApiServer,
  waitForHealthcheck,
  stopApiServer,
} from "../../tests/integration/integration-harness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const serverScriptPath = path.resolve(apiRoot, "src/server.ts");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;

const testContext = setupIntegrationTests();

test(
  "@slow static pages integration: admin CRUD, publish, public read",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;
    let createdPageId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const superAdminEmail = readEnv("JP_SUPER_ADMIN_EMAIL").toLowerCase();
    const superAdminPassword = readEnv("JP_SUPER_ADMIN_PASSWORD");
    const runId = Date.now().toString(36);

    try {
      const baseUrl = testContext.baseUrl;

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: superAdminEmail,
          password: superAdminPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const invalidSlugResponse = await fetch(`${baseUrl}/api/settings/pages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          slug: "Privacy!",
          title: "Invalid Slug",
          content_md: "Hello"
        })
      });
      assert.equal(invalidSlugResponse.status, 400);
      const invalidSlugBody = await invalidSlugResponse.json();
      assert.equal(invalidSlugBody.success, false);
      assert.equal(invalidSlugBody.error.code, "INVALID_SLUG");

      const slug = `privacy-test-${runId}`;
      const createResponse = await fetch(`${baseUrl}/api/settings/pages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          slug,
          title: `Privacy Test ${runId}`,
          content_md: `# Policy ${runId}\n\nHello <script>alert("x")</script>`
        })
      });
      assert.equal(createResponse.status, 201);
      const createBody = await createResponse.json();
      assert.equal(createBody.success, true);
      createdPageId = Number(createBody.data.id);
      assert.ok(createdPageId > 0);

      const listResponse = await fetch(`${baseUrl}/api/settings/pages?q=${encodeURIComponent(runId)}`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listResponse.status, 200);
      const listBody = await listResponse.json();
      assert.equal(listBody.success, true);
      const listed = listBody.data.find((page) => Number(page.id) === createdPageId);
      assert.equal(Boolean(listed), true);

      const duplicateResponse = await fetch(`${baseUrl}/api/settings/pages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          slug,
          title: "Duplicate",
          content_md: "Hello"
        })
      });
      assert.equal(duplicateResponse.status, 409);
      const duplicateBody = await duplicateResponse.json();
      assert.equal(duplicateBody.success, false);
      assert.equal(duplicateBody.error.code, "DUPLICATE_SLUG");

      const publicBeforePublish = await fetch(`${baseUrl}/api/pages/${slug}`);
      assert.equal(publicBeforePublish.status, 404);
      const publicBeforeBody = await publicBeforePublish.json();
      assert.equal(publicBeforeBody.success, false);
      assert.equal(publicBeforeBody.error.code, "NOT_FOUND");

      const newSlug = `${slug}-v2`;
      const patchResponse = await fetch(`${baseUrl}/api/settings/pages/${createdPageId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          slug: newSlug,
          title: `Privacy Test Updated ${runId}`,
          content_md: `# Policy ${runId}\n\nHello <script>alert("x")</script>`
        })
      });
      assert.equal(patchResponse.status, 200);
      const patchBody = await patchResponse.json();
      assert.equal(patchBody.success, true);
      assert.equal(patchBody.data.slug, newSlug);

      const publishResponse = await fetch(`${baseUrl}/api/settings/pages/${createdPageId}/publish`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(publishResponse.status, 200);
      const publishBody = await publishResponse.json();
      assert.equal(publishBody.success, true);
      assert.equal(publishBody.data.status, "PUBLISHED");

      const publicAfterPublish = await fetch(`${baseUrl}/api/pages/${newSlug}`);
      assert.equal(publicAfterPublish.status, 200);
      const publicBody = await publicAfterPublish.json();
      assert.equal(publicBody.success, true);
      assert.equal(publicBody.data.slug, newSlug);
      assert.equal(publicBody.data.content_html.includes("<script"), false);
      assert.equal(publicBody.data.content_html.includes("Policy"), true);

      const unpublishResponse = await fetch(`${baseUrl}/api/settings/pages/${createdPageId}/unpublish`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(unpublishResponse.status, 200);
      const unpublishBody = await unpublishResponse.json();
      assert.equal(unpublishBody.success, true);
      assert.equal(unpublishBody.data.status, "DRAFT");

      const publicAfterUnpublish = await fetch(`${baseUrl}/api/pages/${newSlug}`);
      assert.equal(publicAfterUnpublish.status, 404);
      const publicAfterBody = await publicAfterUnpublish.json();
      assert.equal(publicAfterBody.success, false);
      assert.equal(publicAfterBody.error.code, "NOT_FOUND");
    } finally {
    }
  }
);
