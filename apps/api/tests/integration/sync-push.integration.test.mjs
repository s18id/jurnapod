import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";

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

function buildSyncTransaction({ clientTxId, companyId, outletId, cashierUserId, trxAt }) {
  return {
    client_tx_id: clientTxId,
    company_id: companyId,
    outlet_id: outletId,
    cashier_user_id: cashierUserId,
    status: "COMPLETED",
    trx_at: trxAt,
    items: [
      {
        item_id: 1,
        qty: 1,
        price_snapshot: 12500,
        name_snapshot: "Test Item"
      }
    ],
    payments: [
      {
        method: "CASH",
        amount: 12500
      }
    ]
  };
}

function assertSyncPushResponseShape(body) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  assert.equal(Array.isArray(body.results), true);

  for (const item of body.results) {
    assert.equal(typeof item.client_tx_id, "string");
    assert.equal(
      item.result === "OK" || item.result === "DUPLICATE" || item.result === "ERROR",
      true
    );

    if ("message" in item && item.message !== undefined) {
      assert.equal(typeof item.message, "string");
    }
  }
}

async function countAcceptedSyncPushEvents(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     WHERE action = ?
       AND result = 'SUCCESS'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
    [SYNC_PUSH_ACCEPTED_AUDIT_ACTION, clientTxId]
  );

  return Number(rows[0].total);
}

test(
  "sync push integration: first insert, replay duplicate, mixed batch statuses",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    const createdClientTxIds = [];
    let deniedOutletId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
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
      const outletId = Number(owner.outlet_id);
      const trxAt = new Date().toISOString();
      const deniedOutletCode = `DENYSP${Date.now().toString(36)}`.slice(0, 16).toUpperCase();

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           id = LAST_INSERT_ID(id),
           updated_at = CURRENT_TIMESTAMP`,
        [companyId, deniedOutletCode, `Denied Sync Push Outlet ${deniedOutletCode}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

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
          email: ownerEmail,
          password: ownerPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.ok, true);
      const accessToken = loginBody.access_token;

      const firstClientTxId = randomUUID();
      const firstPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: firstClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const firstResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(firstPayload)
      });
      assert.equal(firstResponse.status, 200);
      const firstBody = await firstResponse.json();
      assert.equal(firstBody.ok, true);
      assertSyncPushResponseShape(firstBody);
      assert.deepEqual(firstBody.results, [
        {
          client_tx_id: firstClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(firstClientTxId);

      const [firstCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [firstClientTxId]
      );
      assert.equal(Number(firstCountRows[0].total), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, firstClientTxId), 1);

      const replayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(firstPayload)
      });
      assert.equal(replayResponse.status, 200);
      const replayBody = await replayResponse.json();
      assert.equal(replayBody.ok, true);
      assertSyncPushResponseShape(replayBody);
      assert.deepEqual(replayBody.results, [
        {
          client_tx_id: firstClientTxId,
          result: "DUPLICATE"
        }
      ]);

      const [replayCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [firstClientTxId]
      );
      assert.equal(Number(replayCountRows[0].total), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, firstClientTxId), 1);

      const secondClientTxId = randomUUID();
      const mismatchClientTxId = randomUUID();
      const outletMismatchClientTxId = randomUUID();
      const mixedPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: firstClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          }),
          buildSyncTransaction({
            clientTxId: secondClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          }),
          {
            ...buildSyncTransaction({
              clientTxId: mismatchClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt
            }),
            company_id: companyId + 1
          },
          {
            ...buildSyncTransaction({
              clientTxId: outletMismatchClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt
            }),
            outlet_id: outletId + 999
          }
        ]
      };

      const mixedResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(mixedPayload)
      });
      assert.equal(mixedResponse.status, 200);
      const mixedBody = await mixedResponse.json();
      assert.equal(mixedBody.ok, true);
      assertSyncPushResponseShape(mixedBody);
      assert.deepEqual(mixedBody.results, [
        {
          client_tx_id: firstClientTxId,
          result: "DUPLICATE"
        },
        {
          client_tx_id: secondClientTxId,
          result: "OK"
        },
        {
          client_tx_id: mismatchClientTxId,
          result: "ERROR",
          message: "company_id mismatch"
        },
        {
          client_tx_id: outletMismatchClientTxId,
          result: "ERROR",
          message: "outlet_id mismatch"
        }
      ]);
      createdClientTxIds.push(secondClientTxId);

      const [secondCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [secondClientTxId]
      );
      assert.equal(Number(secondCountRows[0].total), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, secondClientTxId), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, firstClientTxId), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, mismatchClientTxId), 0);
      assert.equal(await countAcceptedSyncPushEvents(db, outletMismatchClientTxId), 0);

      const [mismatchCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [mismatchClientTxId]
      );
      assert.equal(Number(mismatchCountRows[0].total), 0);

      const [outletMismatchCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [outletMismatchClientTxId]
      );
      assert.equal(Number(outletMismatchCountRows[0].total), 0);

      const sameRequestDuplicateClientTxId = randomUUID();
      const sameRequestDuplicatePayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: sameRequestDuplicateClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          }),
          buildSyncTransaction({
            clientTxId: sameRequestDuplicateClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const sameRequestDuplicateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(sameRequestDuplicatePayload)
      });
      assert.equal(sameRequestDuplicateResponse.status, 200);
      const sameRequestDuplicateBody = await sameRequestDuplicateResponse.json();
      assert.equal(sameRequestDuplicateBody.ok, true);
      assertSyncPushResponseShape(sameRequestDuplicateBody);
      assert.deepEqual(sameRequestDuplicateBody.results, [
        {
          client_tx_id: sameRequestDuplicateClientTxId,
          result: "OK"
        },
        {
          client_tx_id: sameRequestDuplicateClientTxId,
          result: "DUPLICATE"
        }
      ]);
      createdClientTxIds.push(sameRequestDuplicateClientTxId);

      const [sameRequestDuplicateCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [sameRequestDuplicateClientTxId]
      );
      assert.equal(Number(sameRequestDuplicateCountRows[0].total), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, sameRequestDuplicateClientTxId), 1);

      const deniedOutletTxId = randomUUID();
      const deniedOutletResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: deniedOutletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: deniedOutletTxId,
              companyId,
              outletId: deniedOutletId,
              cashierUserId: ownerUserId,
              trxAt
            })
          ]
        })
      });
      assert.equal(deniedOutletResponse.status, 403);
      const deniedOutletBody = await deniedOutletResponse.json();
      assert.equal(deniedOutletBody.ok, false);
      assert.equal(deniedOutletBody.error.code, "FORBIDDEN");

      const [deniedOutletCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [deniedOutletTxId]
      );
      assert.equal(Number(deniedOutletCountRows[0].total), 0);
      assert.equal(await countAcceptedSyncPushEvents(db, deniedOutletTxId), 0);
    } finally {
      await stopApiServer(childProcess);

      for (const clientTxId of createdClientTxIds) {
        await db.execute(
          `DELETE FROM audit_logs
           WHERE action = ?
             AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
          [SYNC_PUSH_ACCEPTED_AUDIT_ACTION, clientTxId]
        );
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [clientTxId]);
      }

      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      await db.end();
    }
  }
);
