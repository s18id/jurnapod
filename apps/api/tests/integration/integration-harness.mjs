// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const serverScriptPath = path.resolve(apiRoot, "src/server.ts");
const ENV_PATH = path.resolve(repoRoot, ".env");

export const TEST_TIMEOUT_MS = 180000;
const DAILY_SALES_VIEW_SQL = `CREATE OR REPLACE VIEW v_pos_daily_totals AS
SELECT pt.company_id,
       pt.outlet_id,
       DATE(pt.trx_at) AS trx_date,
       pt.status,
       COUNT(*) AS tx_count,
       COALESCE(SUM(i.gross_total), 0) AS gross_total,
       COALESCE(SUM(p.paid_total), 0) AS paid_total
FROM pos_transactions pt
LEFT JOIN (
  SELECT pos_transaction_id,
         SUM(qty * price_snapshot) AS gross_total
  FROM pos_transaction_items
  GROUP BY pos_transaction_id
) i ON i.pos_transaction_id = pt.id
LEFT JOIN (
  SELECT pos_transaction_id,
         SUM(amount) AS paid_total
  FROM pos_transaction_payments
  GROUP BY pos_transaction_id
) p ON p.pos_transaction_id = pt.id
GROUP BY pt.company_id, pt.outlet_id, DATE(pt.trx_at), pt.status`;

const SYNC_PUSH_TEST_HOOKS_ENV = "JP_SYNC_PUSH_TEST_HOOKS";
const HTTP_LOG_ENV = "JP_HTTP_LOG";
const INTEGRATION_VERBOSE_ENV = "JP_INTEGRATION_VERBOSE";
const DEFAULT_API_PORT = 3001;

async function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

export function loadEnvIfPresent() {
  const loadEnvFile = process.loadEnvFile;
  if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
    loadEnvFile(ENV_PATH);
  }
}

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

export function createDbPool(options = {}) {
  const config = dbConfigFromEnv();
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: options.connectionLimit ?? 10,
    queueLimit: 0,
    dateStrings: true
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const envOverrides = options.envOverrides ?? {};
  const envWithoutKeys = options.envWithoutKeys ?? [];
  const verbose = options.verbose ?? process.env[INTEGRATION_VERBOSE_ENV] === "1";

  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    [SYNC_PUSH_TEST_HOOKS_ENV]: enableSyncPushTestHooks ? "1" : "0",
    [HTTP_LOG_ENV]: verbose ? "1" : process.env[HTTP_LOG_ENV],
    ...envOverrides
  };

  for (const key of envWithoutKeys) {
    delete childEnv[key];
  }

  // In verbose mode, stream output directly to parent process
  const stdioMode = verbose ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"];

  const serverLogs = [];
  const childProcess = spawn(process.execPath, ["--import", "tsx", serverScriptPath], {
    cwd: apiRoot,
    env: { ...childEnv, PORT: String(port) },
    stdio: stdioMode
  });

  if (!verbose) {
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
  }

  return {
    childProcess,
    serverLogs
  };
}

export async function waitForHealthcheck(baseUrl, childProcess, serverLogs) {
  const startedAt = Date.now();

  // Wait for server to initialize (TypeScript compilation, module loading)
  await delay(2000);

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

export async function stopApiServer(childProcess) {
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

export async function ensureDailySalesView(db) {
  await db.execute(DAILY_SALES_VIEW_SQL);
}

export async function loginUser(baseUrl, companyCode, email, password, serverLogs = null) {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      companyCode,
      email,
      password
    })
  });
  if (loginResponse.status !== 200) {
    let responseBody = "";
    try {
      responseBody = await loginResponse.text();
    } catch {
      responseBody = "";
    }

    const logDetail = serverLogs ? `\n${serverLogs.join("")}` : "";
    throw new Error(
      `Login failed. status=${loginResponse.status} body=${responseBody}${logDetail}`
    );
  }

  const body = await loginResponse.json();
  if (!body?.data?.access_token) {
    throw new Error("Login response missing access_token");
  }

  return body.data.access_token;
}

export async function loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword, serverLogs = null) {
  return loginUser(baseUrl, companyCode, ownerEmail, ownerPassword, serverLogs);
}

export function createIntegrationTestContext(options = {}) {
  const serverOptions = options.serverOptions ?? {};
  const hasServerOptions = Object.keys(serverOptions).length > 0;
  const useDb = options.useDb !== false;
  const forceLocal = options.forceLocalServer === true;

  let db = options.dbPool ?? null;
  let manageDb = useDb && !options.dbPool;
  let baseUrl = null;
  let server = null;
  let isExternal = false;

  return {
    async start() {
      loadEnvIfPresent();

      const externalBaseUrl = process.env.JP_TEST_BASE_URL;
      const allowExternal = Boolean(externalBaseUrl) && !hasServerOptions && !forceLocal;

      // Auto-detect if API is already running on default port
      const autoDetectRunning = !forceLocal && !hasServerOptions && !externalBaseUrl;
      let useExistingServer = false;

      if (autoDetectRunning) {
        const running = await isPortListening(DEFAULT_API_PORT);
        if (running) {
          console.log(`[integration] Using existing dev server at http://127.0.0.1:${DEFAULT_API_PORT}`);
          baseUrl = `http://127.0.0.1:${DEFAULT_API_PORT}`;
          useExistingServer = true;
          isExternal = true;
        }
      }

      if (useDb && !db) {
        db = createDbPool(options.dbPoolOptions ?? {});
        manageDb = true;
      }

      if (useExistingServer) {
        return;
      }

      if (allowExternal) {
        baseUrl = externalBaseUrl;
        isExternal = true;
        return;
      }

      const port = await getFreePort();
      baseUrl = `http://127.0.0.1:${port}`;
      server = startApiServer(port, serverOptions);
      await waitForHealthcheck(baseUrl, server.childProcess, server.serverLogs);
    },
    async stop() {
      if (server) {
        await stopApiServer(server.childProcess);
      }
      if (manageDb && db) {
        await db.end();
      }
    },
    get baseUrl() {
      return baseUrl;
    },
    get db() {
      return db;
    },
    get isExternal() {
      return isExternal;
    }
  };
}

export function setupIntegrationTests(testInstance, options = {}) {
  const context = createIntegrationTestContext(options);
  testInstance.before(async () => {
    await context.start();
  });
  testInstance.after(async () => {
    await context.stop();
  });
  return context;
}

/**
 * Comprehensive cleanup helper for integration tests.
 * Handles proper deletion order and ignores errors from:
 * 1. Immutability triggers (journal_lines, journal_batches)
 * 2. FK constraint violations (accounts referenced by journals)
 * 
 * Usage:
 *   const cleanup = createCleanupHelper(db);
 *   cleanup.addCompany(companyId);
 *   cleanup.addUser(userId);
 *   cleanup.addOutlet(outletId);
 *   cleanup.addAccount(accountId);
 *   cleanup.addTaxRate(taxRateId);
 *   cleanup.addCashBankTx(txId);
 *   // In test finally block:
 *   await cleanup.execute();
 */
export function createCleanupHelper(db) {
  const companyIds = [];
  const userIds = [];
  const outletIds = [];
  const accountIds = [];
  const taxRateIds = [];
  const cashBankTxIds = [];
  
  return {
    addCompany: (id) => companyIds.push(id),
    addUser: (id) => userIds.push(id),
    addOutlet: (id) => outletIds.push(id),
    addAccount: (id) => accountIds.push(id),
    addTaxRate: (id) => taxRateIds.push(id),
    addCashBankTx: (id) => cashBankTxIds.push(id),
    
    async execute() {
      // Delete in correct order to handle FK constraints
      // Note: journal_lines and journal_batches cannot be deleted due to immutability triggers
      
      // 1. Tax rates (may reference accounts)
      if (taxRateIds.length > 0) {
        const placeholders = taxRateIds.map(() => "?").join(", ");
        try {
          await db.execute(`DELETE FROM tax_rates WHERE id IN (${placeholders})`, taxRateIds);
        } catch (e) {
          // Ignore - may be referenced or already deleted
        }
      }
      
      // 2. Cash bank transactions (may reference accounts)
      if (cashBankTxIds.length > 0) {
        const placeholders = cashBankTxIds.map(() => "?").join(", ");
        try {
          await db.execute(`DELETE FROM cash_bank_transactions WHERE id IN (${placeholders})`, cashBankTxIds);
        } catch (e) {
          // Ignore - may be referenced or already deleted
        }
      }
      
      // 3. User role assignments ( FK to users, outlets)
      for (const userId of userIds) {
        try {
          await db.execute(`DELETE FROM user_role_assignments WHERE user_id = ?`, [userId]);
        } catch (e) {
          // Ignore
        }
        try {
          await db.execute(`DELETE FROM user_outlets WHERE user_id = ?`, [userId]);
        } catch (e) {
          // Ignore
        }
      }
      
      // 4. Users
      for (const userId of userIds) {
        try {
          await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);
        } catch (e) {
          // Ignore
        }
      }
      
      // 5. Outlets
      if (outletIds.length > 0) {
        const placeholders = outletIds.map(() => "?").join(", ");
        try {
          await db.execute(`DELETE FROM outlets WHERE id IN (${placeholders})`, outletIds);
        } catch (e) {
          // Ignore - may be referenced
        }
      }
      
      // 6. Accounts (will fail if referenced by journal_lines due to immutability)
      for (const accountId of accountIds) {
        try {
          await db.execute(`DELETE FROM accounts WHERE id = ?`, [accountId]);
        } catch (e) {
          // Ignore - likely referenced by immutable journal_lines
        }
      }
      
      // 7. Companies (will fail if referenced by outlets, users, etc.)
      for (const companyId of companyIds) {
        try {
          await db.execute(`DELETE FROM companies WHERE id = ?`, [companyId]);
        } catch (e) {
          // Ignore - likely has related data
        }
      }
    }
  };
}

/**
 * Helper to cleanup journal entries that are protected by immutability triggers.
 * @deprecated Use createCleanupHelper() instead for comprehensive cleanup.
 */
export async function cleanupJournalEntriesSafe(
  db,
  companyId,
  docTypePattern,
  docIds
) {
  if (!docIds.length) return;
  
  const placeholders = docIds.map(() => "?").join(", ");
  
  try {
    await db.execute(
      `DELETE FROM cash_bank_transactions WHERE company_id = ? AND id IN (${placeholders})`,
      [companyId, ...docIds]
    );
  } catch (e) {
    if (!e?.message?.includes("immutable")) {
      throw e;
    }
  }
}
