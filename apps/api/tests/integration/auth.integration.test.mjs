import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
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
  "auth integration: login, guards, outlet access, audit logging",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let viewerUserId = 0;
    let deniedOutletId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    const runId = Date.now().toString(36);
    const viewerEmail = `viewer+m2-${runId}@example.com`;
    const viewerPassword = "ViewerPass123!";
    const auditIp = "203.0.113.77";
    const auditUserAgent = `m2-auth-it-${runId}`;
    const deniedOutletCode = `DENY${runId}`.slice(0, 32).toUpperCase();

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

      const ownerUserId = Number(owner.id);
      const companyId = Number(owner.company_id);
      const allowedOutletId = Number(owner.outlet_id);

      const [ownerRoleRows] = await db.execute(
        `SELECT DISTINCT r.code
         FROM roles r
         INNER JOIN user_roles ur ON ur.role_id = r.id
         INNER JOIN users u ON u.id = ur.user_id
         WHERE u.id = ?
           AND u.company_id = ?
           AND u.is_active = 1
           AND r.code IN ('OWNER', 'ADMIN', 'CASHIER', 'ACCOUNTANT')
         ORDER BY r.code ASC`,
        [ownerUserId, companyId]
      );
      const expectedOwnerRoles = ownerRoleRows.map((row) => row.code);

      const [ownerOutletRows] = await db.execute(
        `SELECT o.id, o.code, o.name
         FROM outlets o
         INNER JOIN user_outlets uo ON uo.outlet_id = o.id
         INNER JOIN users u ON u.id = uo.user_id
         WHERE u.id = ?
           AND u.company_id = ?
           AND u.is_active = 1
           AND o.company_id = ?
         ORDER BY o.id ASC`,
        [ownerUserId, companyId, companyId]
      );
      const expectedOwnerOutlets = ownerOutletRows.map((row) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name
      }));

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           id = LAST_INSERT_ID(id),
           updated_at = CURRENT_TIMESTAMP`,
        [companyId, deniedOutletCode, `Denied Outlet ${runId}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

      const [viewerRoleResult] = await db.execute(
        `INSERT INTO roles (code, name)
         VALUES ('VIEWER', 'Viewer')
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           id = LAST_INSERT_ID(id),
           updated_at = CURRENT_TIMESTAMP`
      );
      const viewerRoleId = Number(viewerRoleResult.insertId);

      const viewerPasswordHash = await bcrypt.hash(viewerPassword, 12);
      const [viewerUserResult] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           password_hash = VALUES(password_hash),
           is_active = 1,
           id = LAST_INSERT_ID(id),
           updated_at = CURRENT_TIMESTAMP`,
        [companyId, viewerEmail, viewerPasswordHash]
      );
      viewerUserId = Number(viewerUserResult.insertId);

      await db.execute(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [viewerUserId, viewerRoleId]
      );

      await db.execute(
        `INSERT INTO user_outlets (user_id, outlet_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [viewerUserId, allowedOutletId]
      );

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const loginSuccessResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": auditIp,
          "user-agent": auditUserAgent
        },
        body: JSON.stringify({
          companyCode,
          email: ownerEmail,
          password: ownerPassword
        })
      });
      assert.equal(loginSuccessResponse.status, 200);
      const loginSuccessBody = await loginSuccessResponse.json();
      assert.equal(loginSuccessBody.ok, true);
      assert.equal(loginSuccessBody.token_type, "Bearer");
      assert.equal(typeof loginSuccessBody.access_token, "string");
      assert.equal(typeof loginSuccessBody.expires_in, "number");

      const ownerAccessToken = loginSuccessBody.access_token;

      const loginFailResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": auditIp,
          "user-agent": auditUserAgent
        },
        body: JSON.stringify({
          companyCode,
          email: ownerEmail,
          password: "wrong-password"
        })
      });
      assert.equal(loginFailResponse.status, 401);
      const loginFailBody = await loginFailResponse.json();
      assert.equal(loginFailBody.ok, false);
      assert.equal(loginFailBody.error.code, "INVALID_CREDENTIALS");

      const meWithoutTokenResponse = await fetch(`${baseUrl}/api/me`);
      assert.equal(meWithoutTokenResponse.status, 401);
      const meWithoutTokenBody = await meWithoutTokenResponse.json();
      assert.equal(meWithoutTokenBody.ok, false);
      assert.equal(meWithoutTokenBody.error.code, "UNAUTHORIZED");

      const meWithTokenResponse = await fetch(`${baseUrl}/api/me`, {
        headers: {
          authorization: `Bearer ${ownerAccessToken}`
        }
      });
      assert.equal(meWithTokenResponse.status, 200);
      const meWithTokenBody = await meWithTokenResponse.json();
      assert.equal(meWithTokenBody.ok, true);
      assert.equal(meWithTokenBody.user.id, ownerUserId);
      assert.equal(meWithTokenBody.user.company_id, companyId);
      assert.equal(meWithTokenBody.user.email, ownerEmail);
      assert.deepEqual(meWithTokenBody.user.roles, expectedOwnerRoles);
      assert.deepEqual(meWithTokenBody.user.outlets, expectedOwnerOutlets);

      const ownerAllowedOutletResponse = await fetch(
        `${baseUrl}/api/outlet-access?outlet_id=${allowedOutletId}`,
        {
          headers: {
            authorization: `Bearer ${ownerAccessToken}`
          }
        }
      );
      assert.equal(ownerAllowedOutletResponse.status, 200);

      const ownerDeniedOutletResponse = await fetch(
        `${baseUrl}/api/outlet-access?outlet_id=${deniedOutletId}`,
        {
          headers: {
            authorization: `Bearer ${ownerAccessToken}`
          }
        }
      );
      assert.equal(ownerDeniedOutletResponse.status, 403);
      const ownerDeniedOutletBody = await ownerDeniedOutletResponse.json();
      assert.equal(ownerDeniedOutletBody.ok, false);
      assert.equal(ownerDeniedOutletBody.error.code, "FORBIDDEN");

      const viewerLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: viewerEmail,
          password: viewerPassword
        })
      });
      assert.equal(viewerLoginResponse.status, 200);
      const viewerLoginBody = await viewerLoginResponse.json();
      assert.equal(viewerLoginBody.ok, true);
      const viewerAccessToken = viewerLoginBody.access_token;

      const viewerOutletResponse = await fetch(
        `${baseUrl}/api/outlet-access?outlet_id=${allowedOutletId}`,
        {
          headers: {
            authorization: `Bearer ${viewerAccessToken}`
          }
        }
      );
      assert.equal(viewerOutletResponse.status, 403);
      const viewerOutletBody = await viewerOutletResponse.json();
      assert.equal(viewerOutletBody.ok, false);
      assert.equal(viewerOutletBody.error.code, "FORBIDDEN");

      const [auditRows] = await db.execute(
        `SELECT result,
                JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.reason')) AS reason
         FROM audit_logs
         WHERE action = 'AUTH_LOGIN'
           AND ip_address = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.user_agent')) = ?
         ORDER BY id ASC`,
        [auditIp, auditUserAgent]
      );

      const hasSuccessAudit = auditRows.some(
        (row) => row.result === "SUCCESS" && row.reason === "success"
      );
      const hasFailAudit = auditRows.some(
        (row) => row.result === "FAIL" && row.reason === "invalid_credentials"
      );

      assert.equal(hasSuccessAudit, true);
      assert.equal(hasFailAudit, true);
    } finally {
      await stopApiServer(childProcess);

      await db.execute(
        `DELETE FROM audit_logs
         WHERE action = 'AUTH_LOGIN'
           AND ip_address = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.user_agent')) = ?`,
        [auditIp, auditUserAgent]
      );

      if (viewerUserId > 0) {
        await db.execute("DELETE FROM user_outlets WHERE user_id = ?", [viewerUserId]);
        await db.execute("DELETE FROM user_roles WHERE user_id = ?", [viewerUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [viewerUserId]);
      }

      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      await db.end();
    }
  }
);

test(
  "auth integration: startup fails fast when AUTH_JWT_ACCESS_SECRET is blank",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = startApiServer(port, {
      envOverrides: {
        AUTH_JWT_ACCESS_SECRET: "   "
      }
    });
    const { childProcess, serverLogs } = server;

    try {
      let becameHealthy = false;
      const startedAt = Date.now();

      while (Date.now() - startedAt < 15000) {
        if (childProcess.exitCode != null) {
          break;
        }

        try {
          const response = await fetch(`${baseUrl}/api/health`);
          if (response.status === 200) {
            becameHealthy = true;
            break;
          }
        } catch {
          // Ignore transient startup errors while booting.
        }

        await delay(250);
      }

      assert.equal(becameHealthy, false);

      const logs = serverLogs.join("");
      assert.match(logs, /Invalid API environment configuration:/);
      assert.match(logs, /AUTH_JWT_ACCESS_SECRET is required/);
    } finally {
      await stopApiServer(childProcess);
    }
  }
);

test(
  "auth integration: startup fails fast when AUTH_JWT_ACCESS_SECRET is unset",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = startApiServer(port, {
      envWithoutKeys: ["AUTH_JWT_ACCESS_SECRET"]
    });
    const { childProcess, serverLogs } = server;

    try {
      let becameHealthy = false;
      const startedAt = Date.now();

      while (Date.now() - startedAt < 15000) {
        if (childProcess.exitCode != null) {
          break;
        }

        try {
          const response = await fetch(`${baseUrl}/api/health`);
          if (response.status === 200) {
            becameHealthy = true;
            break;
          }
        } catch {
          // Ignore transient startup errors while booting.
        }

        await delay(250);
      }

      assert.equal(becameHealthy, false);

      const logs = serverLogs.join("");
      assert.match(logs, /Invalid API environment configuration:/);
      assert.match(logs, /AUTH_JWT_ACCESS_SECRET is required/);
    } finally {
      await stopApiServer(childProcess);
    }
  }
);

test(
  "auth integration: login fails closed when audit write fails",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let triggerCreated = false;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const auditFailureUserAgent = `m2auditfail${runId}`;
    const triggerName = `m2_audit_fail_${runId}`;

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail]
      );

      if (!ownerRows[0]) {
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      await db.execute(`DROP TRIGGER IF EXISTS \`${triggerName}\``);
      await db.execute(
        `CREATE TRIGGER \`${triggerName}\`
         BEFORE INSERT ON audit_logs
         FOR EACH ROW
         SET NEW.result = IF(
           JSON_UNQUOTE(JSON_EXTRACT(NEW.payload_json, '$.user_agent')) = '${auditFailureUserAgent}',
           'BROKEN',
           NEW.result
         )`
      );
      triggerCreated = true;

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.78",
          "user-agent": auditFailureUserAgent
        },
        body: JSON.stringify({
          companyCode,
          email: ownerEmail,
          password: ownerPassword
        })
      });

      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.error.code, "INTERNAL_SERVER_ERROR");
      assert.equal(Object.hasOwn(body, "access_token"), false);

      const [auditRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM audit_logs
         WHERE action = 'AUTH_LOGIN'
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.user_agent')) = ?`,
        [auditFailureUserAgent]
      );

      assert.equal(Number(auditRows[0].total), 0);
    } finally {
      await stopApiServer(childProcess);

      if (triggerCreated) {
        await db.execute(`DROP TRIGGER IF EXISTS \`${triggerName}\``);
      }

      await db.end();
    }
  }
);
