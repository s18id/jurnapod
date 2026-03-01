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

function startApiServer(port, options = {}) {
  const envOverrides = options.envOverrides ?? {};
  const envWithoutKeys = options.envWithoutKeys ?? [];
  const childEnv = {
    ...process.env,
    ...envOverrides,
    NODE_ENV: "test"
  };

  for (const key of envWithoutKeys) {
    delete childEnv[key];
  }

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
  "users integration: manage users and audit logs",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let serverLogs = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    const runId = Date.now().toString(36);
    const newUserEmail = `user+${runId}@example.com`;
    const newUserPassword = "UserPass123!";
    const updatedEmail = `user+${runId}-updated@example.com`;
    const auditIp = "203.0.113.99";

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND o.code = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      const owner = ownerRows[0];
      if (!owner) {
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);
      const allowedOutletId = Number(owner.outlet_id);
      const extraOutletCode = `EXTRA${runId}`.slice(0, 32).toUpperCase();
      const extraOutletName = `Extra Outlet ${runId}`;

      const [outletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), id = LAST_INSERT_ID(id), updated_at = CURRENT_TIMESTAMP`,
        [companyId, extraOutletCode, extraOutletName]
      );

      const extraOutletId = Number(outletResult.insertId);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      ({ childProcess, serverLogs } = startApiServer(port));
      await waitForHealthcheck(baseUrl, childProcess, serverLogs);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: ownerEmail,
          password: ownerPassword
        })
      });

      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.ok, true);
      assert.ok(loginBody.access_token);

      const authHeader = {
        authorization: `Bearer ${loginBody.access_token}`,
        "content-type": "application/json",
        "x-forwarded-for": auditIp
      };

      const rolesResponse = await fetch(`${baseUrl}/api/roles`, {
        headers: authHeader
      });
      assert.equal(rolesResponse.status, 200);

      const outletsResponse = await fetch(`${baseUrl}/api/outlets`, {
        headers: authHeader
      });
      assert.equal(outletsResponse.status, 200);

      const createResponse = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          role_codes: ["CASHIER"],
          outlet_ids: [extraOutletId],
          is_active: true
        })
      });

      assert.equal(createResponse.status, 201);
      const createBody = await createResponse.json();
      assert.equal(createBody.ok, true);
      const userId = Number(createBody.user.id);
      assert.ok(userId > 0);

      const getResponse = await fetch(`${baseUrl}/api/users/${userId}`, {
        headers: authHeader
      });
      assert.equal(getResponse.status, 200);

      const patchResponse = await fetch(`${baseUrl}/api/users/${userId}`, {
        method: "PATCH",
        headers: authHeader,
        body: JSON.stringify({
          email: updatedEmail
        })
      });

      assert.equal(patchResponse.status, 200);

      const rolesUpdateResponse = await fetch(`${baseUrl}/api/users/${userId}/roles`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          role_codes: ["ACCOUNTANT"]
        })
      });

      assert.equal(rolesUpdateResponse.status, 200);

      const outletsUpdateResponse = await fetch(`${baseUrl}/api/users/${userId}/outlets`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          outlet_ids: [allowedOutletId, extraOutletId]
        })
      });

      assert.equal(outletsUpdateResponse.status, 200);

      const passwordResponse = await fetch(`${baseUrl}/api/users/${userId}/password`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          password: "NewPass123!"
        })
      });

      assert.equal(passwordResponse.status, 200);

      const deactivateResponse = await fetch(`${baseUrl}/api/users/${userId}/deactivate`, {
        method: "POST",
        headers: authHeader
      });

      assert.equal(deactivateResponse.status, 200);
      const deactivateBody = await deactivateResponse.json();
      assert.equal(deactivateBody.user.is_active, false);

      const reactivateResponse = await fetch(`${baseUrl}/api/users/${userId}/reactivate`, {
        method: "POST",
        headers: authHeader
      });

      assert.equal(reactivateResponse.status, 200);
      const reactivateBody = await reactivateResponse.json();
      assert.equal(reactivateBody.user.is_active, true);

      const [auditRows] = await db.execute(
        `SELECT action, ip_address
         FROM audit_logs
         WHERE entity_type = 'user'
           AND entity_id = ?
         ORDER BY id DESC`,
        [String(userId)]
      );

      assert.ok(auditRows.length >= 4);
      assert.ok(auditRows.some((row) => row.ip_address === auditIp));
    } finally {
      await stopApiServer(childProcess);
      await db.end();
    }
  }
);
