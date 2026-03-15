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
import { setupIntegrationTests } from "./integration-harness.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const serverScriptPath = path.resolve(apiRoot, "src/server.ts");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;

const testContext = setupIntegrationTests(test);

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
  const childProcess = spawn(process.execPath, ["--import", "tsx", serverScriptPath], {
    cwd: apiRoot,
    env: { ...childEnv, PORT: String(port) },
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
  "companies integration: bootstrap module roles and modules",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let serverLogs = [];

    const companyCodeForLogin = readEnv("JP_COMPANY_CODE", "JP");
    const superAdminEmail = readEnv("JP_SUPER_ADMIN_EMAIL").toLowerCase();
    const superAdminPassword = readEnv("JP_SUPER_ADMIN_PASSWORD");

    const runId = Date.now().toString(36);
    const companyCode = `T${runId}`.slice(0, 32).toUpperCase();
    const companyName = `Test Company ${runId}`;

    const expectedRoleCodes = ["OWNER", "COMPANY_ADMIN", "ADMIN", "CASHIER", "ACCOUNTANT"];
    const expectedModuleCodes = [
      "accounts",
      "inventory",
      "journals",
      "platform",
      "pos",
      "purchasing",
      "reports",
      "sales",
      "settings"
    ];

    try {
      const [roleRowsBefore] = await db.execute(`SELECT code FROM roles ORDER BY code ASC`);
      const roleCodesBefore = roleRowsBefore.map((row) => row.code);
      const roleCountBefore = roleRowsBefore.length;

      for (const code of expectedRoleCodes) {
        assert.ok(roleCodesBefore.includes(code), `roles seeded: ${code}`);
      }

      const baseUrl = testContext.baseUrl;

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode: companyCodeForLogin,
          email: superAdminEmail,
          password: superAdminPassword
        })
      });

      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      assert.ok(loginBody.data.access_token);

      const authHeader = {
        authorization: `Bearer ${loginBody.data.access_token}`,
        "content-type": "application/json"
      };

      const createResponse = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          code: companyCode,
          name: companyName,
          legal_name: "PT " + companyName,
          tax_id: "01.234.567.8-901.000",
          email: "contact@" + companyCode.toLowerCase() + ".com",
          phone: "+62 21 1234 5678",
          address_line1: "Jl. Sudirman No. 123",
          address_line2: "Tower A, Lt. 10",
          city: "Jakarta",
          postal_code: "10220"
        })
      });

      assert.equal(createResponse.status, 201);
      const createBody = await createResponse.json();
      assert.equal(createBody.success, true);
      const companyId = Number(createBody.data.id);
      assert.ok(companyId > 0);
      assert.equal(createBody.data.legal_name, "PT " + companyName);
      assert.equal(createBody.data.tax_id, "01.234.567.8-901.000");
      assert.equal(createBody.data.email, "contact@" + companyCode.toLowerCase() + ".com");
      assert.equal(createBody.data.phone, "+62 21 1234 5678");
      assert.equal(createBody.data.address_line1, "Jl. Sudirman No. 123");
      assert.equal(createBody.data.address_line2, "Tower A, Lt. 10");
      assert.equal(createBody.data.city, "Jakarta");
      assert.equal(createBody.data.postal_code, "10220");

      const getResponse = await fetch(`${baseUrl}/api/companies/${companyId}`, {
        method: "GET",
        headers: authHeader
      });
      assert.equal(getResponse.status, 200);
      const getBody = await getResponse.json();
      assert.equal(getBody.data.legal_name, "PT " + companyName);
      assert.equal(getBody.data.tax_id, "01.234.567.8-901.000");
      assert.equal(getBody.data.email, "contact@" + companyCode.toLowerCase() + ".com");

      const patchResponse = await fetch(`${baseUrl}/api/companies/${companyId}`, {
        method: "PATCH",
        headers: authHeader,
        body: JSON.stringify({
          legal_name: null,
          tax_id: null,
          city: "Surabaya"
        })
      });
      assert.equal(patchResponse.status, 200);
      const patchBody = await patchResponse.json();
      assert.equal(patchBody.data.legal_name, null);
      assert.equal(patchBody.data.tax_id, null);
      assert.equal(patchBody.data.city, "Surabaya");

      const [roleRowsAfter] = await db.execute(`SELECT code FROM roles ORDER BY code ASC`);
      const roleCountAfter = roleRowsAfter.length;
      assert.equal(roleCountAfter, roleCountBefore);

      const [companyModuleRows] = await db.execute(
        `SELECT m.code
         FROM company_modules cm
         INNER JOIN modules m ON m.id = cm.module_id
         WHERE cm.company_id = ?
         ORDER BY m.code ASC`,
        [companyId]
      );
      const moduleCodes = companyModuleRows.map((row) => row.code);
      assert.deepEqual(moduleCodes, [...expectedModuleCodes].sort());

      const [moduleRolesColumns] = await db.execute(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'module_roles'
           AND COLUMN_NAME = 'company_id'`
      );
      assert.ok(
        moduleRolesColumns.length > 0,
        "module_roles.company_id missing; run db migrations (0040/0041)"
      );

      const [moduleRolesIndexRows] = await db.execute(
        `SELECT INDEX_NAME
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'module_roles'
           AND INDEX_NAME = 'uq_module_roles_company_role_module'`
      );
      assert.ok(
        moduleRolesIndexRows.length > 0,
        "module_roles is not company-scoped; run db migrations (0040/0041)"
      );

      const [moduleRoleRows] = await db.execute(
        `SELECT r.code AS role_code, mr.module, mr.permission_mask
         FROM module_roles mr
         INNER JOIN roles r ON r.id = mr.role_id
         WHERE mr.company_id = ?
           AND r.code IN ("OWNER", "ADMIN", "CASHIER", "ACCOUNTANT")
           AND mr.module IN ("users", "accounts")`,
        [companyId]
      );
      assert.ok(
        moduleRoleRows.length > 0,
        "module_roles rows were not created for the new company"
      );

      const moduleRoleMap = new Map(
        moduleRoleRows.map((row) => [`${row.role_code}:${row.module}`, Number(row.permission_mask)])
      );

      const moduleRoleKeys = [...moduleRoleMap.keys()].sort().join(", ");
      assert.equal(
        moduleRoleMap.get("OWNER:users"),
        15,
        `missing OWNER:users; found ${moduleRoleKeys}`
      );
      assert.equal(
        moduleRoleMap.get("ADMIN:users"),
        15,
        `missing ADMIN:users; found ${moduleRoleKeys}`
      );
      assert.equal(
        moduleRoleMap.get("CASHIER:users"),
        0,
        `missing CASHIER:users; found ${moduleRoleKeys}`
      );
      assert.equal(
        moduleRoleMap.get("ACCOUNTANT:accounts"),
        2,
        `missing ACCOUNTANT:accounts; found ${moduleRoleKeys}`
      );
    } finally {
      
    }
  }
);
