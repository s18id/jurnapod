// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Integration Test Runtime Helpers
 *
 * Server startup, ports, HTTP utilities, and basic assertions.
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../../..");
const serverScriptPath = path.resolve(apiRoot, "src/server.ts");

const SYNC_PUSH_TEST_HOOKS_ENV = "JP_SYNC_PUSH_TEST_HOOKS";
const SYNC_PUSH_CONCURRENCY_ENV = "JP_SYNC_PUSH_CONCURRENCY";

export function readEnv(name, fallback = null) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    if (fallback != null) {
      return fallback;
    }
    throw new Error(`${name} is required for integration test`);
  }
  return value;
}

export function dbConfigFromEnv() {
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

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function parseJsonResponse(response) {
  const body = await response.json();
  if (body && typeof body === "object" && body.data && typeof body.data === "object") {
    const data = body.data;
    if (Array.isArray(data.results)) {
      return { ...body, results: data.results };
    }
  }
  return body;
}

export function toMysqlDateTime(value) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

export function toDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && value.length > 0) {
    return value.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export async function getFreePort() {
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

export function startApiServer(port, options = {}) {
  const enableSyncPushTestHooks = options.enableSyncPushTestHooks === true;
  const envOverrides = {
    ...(options.envOverrides ?? {}),
    [SYNC_PUSH_CONCURRENCY_ENV]: options.envOverrides?.[SYNC_PUSH_CONCURRENCY_ENV] ?? "3"
  };
  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    [SYNC_PUSH_TEST_HOOKS_ENV]: enableSyncPushTestHooks ? "1" : "0",
    ...envOverrides
  };

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

export async function waitForHealthcheck(baseUrl, childProcess, serverLogs, timeoutMs = 180000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
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

export async function stopApiServer(childProcess) {
  if (!childProcess || childProcess.exitCode != null) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try {
        childProcess.kill("SIGKILL");
      } catch {
        // ignore forced kill errors
      }
    }, 8000);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      childProcess.kill("SIGTERM");
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });

  // Ensure stdio streams do not keep event loop alive.
  try {
    childProcess.stdout?.destroy();
  } catch {
    // ignore
  }
  try {
    childProcess.stderr?.destroy();
  } catch {
    // ignore
  }
}

export function buildSyncTransaction({ clientTxId, companyId, outletId, cashierUserId, trxAt }) {
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

export function assertSyncPushResponseShape(body) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  const results = body.data?.results ?? body.results;
  assert.equal(Array.isArray(results), true);

  for (const item of results) {
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

export function computeLegacyPayloadSha256(transaction) {
  const canonical = JSON.stringify({
    client_tx_id: transaction.client_tx_id,
    company_id: transaction.company_id,
    outlet_id: transaction.outlet_id,
    cashier_user_id: transaction.cashier_user_id,
    status: transaction.status,
    trx_at: transaction.trx_at,
    items: transaction.items.map((item) => ({
      item_id: item.item_id,
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot
    })),
    payments: transaction.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount
    }))
  });

  return createHash("sha256").update(canonical).digest("hex");
}
