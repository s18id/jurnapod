// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const nextCliPath = path.resolve(repoRoot, "node_modules/next/dist/bin/next");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;

function readEnv(name, fallback = null) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    if (fallback != null) {
      return fallback;
    }

    throw new Error(`${name} is required for integration test`);
  }

  return value;
}

function dbConfigFromEnv() {
  const port = Number(process.env.DB_PORT ?? "3306");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("DB_PORT must be a positive integer for integration test");
  }

  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port,
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jurnapod"
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate free port"));
        return;
      }

      const port = address.port;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(port);
      });
    });
  });
}

function startApiServer(port) {
  const childEnv = {
    ...process.env,
    NODE_ENV: "test"
  };

  const serverLogs = [];
  const childProcess = spawn(process.execPath, [nextCliPath, "dev", "-p", String(port)], {
    cwd: apiRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  childProcess.stdout.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
    if (serverLogs.length > 200) {
      serverLogs.shift();
    }
  });

  childProcess.stderr.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
    if (serverLogs.length > 200) {
      serverLogs.shift();
    }
  });

  return {
    childProcess,
    serverLogs
  };
}

async function waitForHealthcheck(baseUrl, childProcess, serverLogs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TEST_TIMEOUT_MS) {
    if (childProcess.exitCode != null) {
      throw new Error(
        `API server exited before healthcheck. exitCode=${childProcess.exitCode}\n${serverLogs.join("")}`
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // Ignore transient startup errors while booting.
    }

    await delay(500);
  }

  throw new Error(`API server did not become healthy in time\n${serverLogs.join("")}`);
}

async function stopApiServer(childProcess) {
  if (!childProcess || childProcess.exitCode != null) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      childProcess.kill("SIGKILL");
    }, 5000);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    childProcess.kill("SIGTERM");
  });
}

test(
  "static pages integration: admin CRUD, publish, public read",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let createdPageId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const superAdminEmail = readEnv("JP_SUPER_ADMIN_EMAIL").toLowerCase();
    const superAdminPassword = readEnv("JP_SUPER_ADMIN_PASSWORD");
    const runId = Date.now().toString(36);

    try {
      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

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
          content_md: `# Policy ${runId}\n\nHello <script>alert(\"x\")</script>`
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
          content_md: `# Policy ${runId}\n\nHello <script>alert(\"x\")</script>`
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
      await stopApiServer(childProcess);
      await db.end();
    }
  }
);
