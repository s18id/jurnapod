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

  return { childProcess, serverLogs };
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

async function login(baseUrl, companyCode, email, password) {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ companyCode, email, password })
  });

  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  assert.equal(loginBody.success, true);
  assert.ok(loginBody.data.access_token);
  return loginBody.data.access_token;
}

test(
  "outlets integration: scoping and audit logs",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let serverLogs = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const superAdminEmail = readEnv("JP_SUPER_ADMIN_EMAIL").toLowerCase();
    const superAdminPassword = readEnv("JP_SUPER_ADMIN_PASSWORD");

    const runId = Date.now().toString(36);
    const auditIp = "203.0.113.42";

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail]
      );
      const owner = ownerRows[0];
      if (!owner) {
        throw new Error("owner fixture not found; run db seed before integration tests");
      }

      const [superAdminRows] = await db.execute(
        `SELECT u.id, u.company_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, superAdminEmail]
      );
      const superAdmin = superAdminRows[0];
      if (!superAdmin) {
        throw new Error("super admin fixture not found; run db seed before integration tests");
      }

      const ownerUserId = Number(owner.id);
      const ownerCompanyId = Number(owner.company_id);
      const superAdminUserId = Number(superAdmin.id);
      const superAdminCompanyId = Number(superAdmin.company_id);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      ({ childProcess, serverLogs } = startApiServer(port));
      await waitForHealthcheck(baseUrl, childProcess, serverLogs);

      const ownerToken = await login(baseUrl, companyCode, ownerEmail, ownerPassword);
      const superAdminToken = await login(baseUrl, companyCode, superAdminEmail, superAdminPassword);

      const ownerHeader = {
        authorization: `Bearer ${ownerToken}`,
        "content-type": "application/json",
        "x-forwarded-for": auditIp
      };

      const superAdminHeader = {
        authorization: `Bearer ${superAdminToken}`,
        "content-type": "application/json",
        "x-forwarded-for": auditIp
      };

      const otherCompanyCode = `X${runId}`.slice(0, 32).toUpperCase();
      const otherCompanyName = `Other Company ${runId}`;

      const createCompanyRes = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: superAdminHeader,
        body: JSON.stringify({
          code: otherCompanyCode,
          name: otherCompanyName
        })
      });

      assert.equal(createCompanyRes.status, 201);
      const createCompanyBody = await createCompanyRes.json();
      assert.equal(createCompanyBody.success, true);
      const otherCompanyId = Number(createCompanyBody.data.id);
      assert.ok(otherCompanyId > 0);

      const otherOutletCode = `OC${runId}`.slice(0, 32).toUpperCase();
      const otherOutletName = `Other Outlet ${runId}`;

      const otherOutletRes = await fetch(`${baseUrl}/api/outlets`, {
        method: "POST",
        headers: superAdminHeader,
        body: JSON.stringify({
          company_id: otherCompanyId,
          code: otherOutletCode,
          name: otherOutletName
        })
      });

      assert.equal(otherOutletRes.status, 201);
      const otherOutletBody = await otherOutletRes.json();
      assert.equal(otherOutletBody.success, true);
      const otherOutletId = Number(otherOutletBody.data.id);
      assert.ok(otherOutletId > 0);

      const listOtherCompanyRes = await fetch(`${baseUrl}/api/outlets?company_id=${otherCompanyId}`, {
        headers: ownerHeader
      });

      assert.equal(listOtherCompanyRes.status, 400);

      const getOtherOutletRes = await fetch(`${baseUrl}/api/outlets/${otherOutletId}`, {
        headers: ownerHeader
      });

      assert.equal(getOtherOutletRes.status, 404);

      const getOtherOutletMismatchRes = await fetch(
        `${baseUrl}/api/outlets/${otherOutletId}?company_id=${otherCompanyId}`,
        { headers: ownerHeader }
      );

      assert.equal(getOtherOutletMismatchRes.status, 400);

      const patchOtherOutletRes = await fetch(
        `${baseUrl}/api/outlets/${otherOutletId}?company_id=${otherCompanyId}`,
        {
          method: "PATCH",
          headers: ownerHeader,
          body: JSON.stringify({ name: "Forbidden Update" })
        }
      );

      assert.equal(patchOtherOutletRes.status, 400);

      const deleteOtherOutletRes = await fetch(
        `${baseUrl}/api/outlets/${otherOutletId}?company_id=${otherCompanyId}`,
        {
          method: "DELETE",
          headers: ownerHeader
        }
      );

      assert.equal(deleteOtherOutletRes.status, 400);

      const outletCode = `OT${runId}`.slice(0, 32).toUpperCase();
      const outletName = `Outlet ${runId}`;
      const updatedOutletName = `Outlet Updated ${runId}`;

      const createOutletRes = await fetch(`${baseUrl}/api/outlets`, {
        method: "POST",
        headers: ownerHeader,
        body: JSON.stringify({
          code: outletCode,
          name: outletName
        })
      });

      assert.equal(createOutletRes.status, 201);
      const createOutletBody = await createOutletRes.json();
      assert.equal(createOutletBody.success, true);
      const outletId = Number(createOutletBody.data.id);
      assert.ok(outletId > 0);
      const [outletRowsBefore] = await db.execute(
        `SELECT updated_at FROM outlets WHERE id = ?`,
        [outletId]
      );
      assert.ok(outletRowsBefore.length > 0);
      const previousUpdatedAt = new Date(outletRowsBefore[0].updated_at).getTime();

      await delay(1100);

      const updateOutletRes = await fetch(`${baseUrl}/api/outlets/${outletId}`, {
        method: "PATCH",
        headers: ownerHeader,
        body: JSON.stringify({ name: updatedOutletName })
      });

      assert.equal(updateOutletRes.status, 200);
      const updateOutletBody = await updateOutletRes.json();
      assert.equal(updateOutletBody.success, true);
      assert.ok(updateOutletBody.data.created_at);
      assert.ok(updateOutletBody.data.updated_at);
      const updatedAtMs = new Date(updateOutletBody.data.updated_at).getTime();
      assert.ok(updatedAtMs > previousUpdatedAt);

      const [outletRowsAfter] = await db.execute(
        `SELECT updated_at FROM outlets WHERE id = ?`,
        [outletId]
      );
      assert.ok(outletRowsAfter.length > 0);
      const dbUpdatedAt = new Date(outletRowsAfter[0].updated_at).toISOString();
      assert.equal(updateOutletBody.data.updated_at, dbUpdatedAt);

      const deleteOutletRes = await fetch(`${baseUrl}/api/outlets/${outletId}`, {
        method: "DELETE",
        headers: ownerHeader
      });

      assert.equal(deleteOutletRes.status, 200);

      const [outletAuditRows] = await db.execute(
        `SELECT action, company_id, user_id, ip_address
         FROM audit_logs
         WHERE entity_type = 'outlet' AND entity_id = ?
         ORDER BY id ASC`,
        [String(outletId)]
      );
      const outletActions = outletAuditRows.map((row) => row.action);
      assert.ok(outletActions.includes("CREATE"));
      assert.ok(outletActions.includes("UPDATE"));
      assert.ok(outletActions.includes("DELETE"));
      assert.ok(
        outletAuditRows.every(
          (row) =>
            Number(row.company_id) === ownerCompanyId &&
            Number(row.user_id) === ownerUserId &&
            row.ip_address === auditIp
        )
      );

      const roleCode = `ROLE${runId}`.slice(0, 32).toUpperCase();
      const roleName = `Role ${runId}`;
      const roleNameUpdated = `Role Updated ${runId}`;

      const createRoleRes = await fetch(`${baseUrl}/api/roles`, {
        method: "POST",
        headers: superAdminHeader,
        body: JSON.stringify({ code: roleCode, name: roleName })
      });

      assert.equal(createRoleRes.status, 201);
      const createRoleBody = await createRoleRes.json();
      assert.equal(createRoleBody.success, true);
      const roleId = Number(createRoleBody.data.id);
      assert.ok(roleId > 0);

      const updateRoleRes = await fetch(`${baseUrl}/api/roles/${roleId}`, {
        method: "PATCH",
        headers: superAdminHeader,
        body: JSON.stringify({ name: roleNameUpdated })
      });

      assert.equal(updateRoleRes.status, 200);

      const deleteRoleRes = await fetch(`${baseUrl}/api/roles/${roleId}`, {
        method: "DELETE",
        headers: superAdminHeader
      });

      assert.equal(deleteRoleRes.status, 200);

      const [roleAuditRows] = await db.execute(
        `SELECT action, company_id, user_id, ip_address
         FROM audit_logs
         WHERE entity_type = 'setting' AND entity_id = ?
         ORDER BY id ASC`,
        [String(roleId)]
      );
      const roleActions = roleAuditRows.map((row) => row.action);
      assert.ok(roleActions.includes("CREATE"));
      assert.ok(roleActions.includes("UPDATE"));
      assert.ok(roleActions.includes("DELETE"));
      assert.ok(
        roleAuditRows.every(
          (row) =>
            Number(row.company_id) === superAdminCompanyId &&
            Number(row.user_id) === superAdminUserId &&
            row.ip_address === auditIp
        )
      );

      const moduleRoleCode = `MR${runId}`.slice(0, 32).toUpperCase();
      const moduleRoleName = `Module Role ${runId}`;
      const createModuleRoleRes = await fetch(`${baseUrl}/api/roles`, {
        method: "POST",
        headers: superAdminHeader,
        body: JSON.stringify({ code: moduleRoleCode, name: moduleRoleName })
      });

      assert.equal(createModuleRoleRes.status, 201);
      const createModuleRoleBody = await createModuleRoleRes.json();
      assert.equal(createModuleRoleBody.success, true);
      const moduleRoleId = Number(createModuleRoleBody.data.id);
      assert.ok(moduleRoleId > 0);

      const moduleRoleRes = await fetch(
        `${baseUrl}/api/settings/module-roles/${moduleRoleId}/inventory`,
        {
          method: "PUT",
          headers: superAdminHeader,
          body: JSON.stringify({ permission_mask: 15 })
        }
      );

      assert.equal(moduleRoleRes.status, 200);

      const moduleRoleEntityId = `module-role:${moduleRoleId}:inventory`;
      const [moduleRoleAuditRows] = await db.execute(
        `SELECT action, company_id, user_id, ip_address
         FROM audit_logs
         WHERE entity_type = 'setting' AND entity_id = ?
         ORDER BY id ASC`,
        [moduleRoleEntityId]
      );
      const moduleRoleActions = moduleRoleAuditRows.map((row) => row.action);
      assert.ok(moduleRoleActions.length > 0);
      assert.ok(moduleRoleActions.includes("CREATE") || moduleRoleActions.includes("UPDATE"));
      assert.ok(
        moduleRoleAuditRows.every(
          (row) =>
            Number(row.company_id) === superAdminCompanyId &&
            Number(row.user_id) === superAdminUserId &&
            row.ip_address === auditIp
        )
      );
    } finally {
      await stopApiServer(childProcess);
      await db.end();
    }
  }
);
