// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupIntegrationTests } from "./integration-harness.mjs";

// Import helpers
import {
  readEnv,
  delay,
  parseJsonResponse,
  toMysqlDateTime,
  getFreePort,
  startApiServer,
  waitForHealthcheck,
  stopApiServer,
  buildSyncTransaction,
  assertSyncPushResponseShape,
  computeLegacyPayloadSha256
} from "./helpers/sync-push-runtime.mjs";

import {
  ensureOpenFiscalDate,
  countAcceptedSyncPushEvents,
  countDuplicateSyncPushEvents,
  readAcceptedSyncPushAuditPayload,
  readPostingHookFailureAuditPayload,
  readDuplicateSyncPushAuditPayload,
  countSyncPushPersistedRows,
  countSyncPushJournalRows,
  readSyncPushJournalSummary,
  setCompanyDefaultTaxRate,
  restoreCompanyDefaultTaxRate,
  ensureOutletAccountMappings,
  cleanupCreatedOutletAccountMappings,
  cleanupSyncPushPersistedArtifacts,
  cleanupOrderSyncArtifacts,
  hasTable,
  POS_SALE_DOC_TYPE,
  OUTLET_ACCOUNT_MAPPING_KEYS
} from "./helpers/sync-push-db.mjs";

import {
  cleanupInventoryAndCostArtifacts,
  setupTrackedItemWithCost,
  setupCogsAccounts,
  enableCogsFeature,
  disableCogsFeature,
  cleanupCogsAccounts,
  cleanupTrackedItems,
  countCogsJournalRows,
  getProductStockQuantity,
  getInventoryTransactions,
  getCostLayerConsumption,
  verifyCogsJournalBalance,
  buildSyncTransactionWithItems
} from "./helpers/sync-push-costing.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;
const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";
const SYNC_PUSH_DUPLICATE_AUDIT_ACTION = "SYNC_PUSH_DUPLICATE";
const SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION = "SYNC_PUSH_POSTING_HOOK_FAIL";
const IDEMPOTENCY_CONFLICT_MESSAGE = "IDEMPOTENCY_CONFLICT";
const RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE = "RETRYABLE_DB_LOCK_TIMEOUT";
const RETRYABLE_DB_DEADLOCK_MESSAGE = "RETRYABLE_DB_DEADLOCK";
const TEST_FORCE_DB_ERRNO_HEADER = "x-jp-sync-push-force-db-errno";
const TEST_FAIL_AFTER_HEADER_INSERT_HEADER = "x-jp-sync-push-fail-after-header";
const SYNC_PUSH_TEST_HOOKS_ENV = "JP_SYNC_PUSH_TEST_HOOKS";
const SYNC_PUSH_CONCURRENCY_ENV = "JP_SYNC_PUSH_CONCURRENCY";
const SYNC_PUSH_POSTING_MODE_ENV = "SYNC_PUSH_POSTING_MODE";
const SYNC_PUSH_POSTING_FORCE_UNBALANCED_ENV = "JP_SYNC_PUSH_POSTING_FORCE_UNBALANCED";

const testContext = setupIntegrationTests(test);
const localServerTest =
  process.env.JP_TEST_BASE_URL && process.env.JP_TEST_ALLOW_LOCAL_SERVER !== "1"
    ? test.skip
    : test;

test(
  "sync push integration: test headers are ignored without explicit test-hook mode",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    const createdClientTxIds = [];

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

      const baseUrl = testContext.baseUrl;

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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const forcedErrnoIgnoredClientTxId = randomUUID();
      const forcedErrnoIgnoredResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          [TEST_FORCE_DB_ERRNO_HEADER]: "1205"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: forcedErrnoIgnoredClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: new Date().toISOString()
            })
          ]
        })
      });
      assert.equal(forcedErrnoIgnoredResponse.status, 200);
      const forcedErrnoIgnoredBody = await parseJsonResponse(forcedErrnoIgnoredResponse);
      assert.equal(forcedErrnoIgnoredBody.success, true);
      assert.deepEqual(forcedErrnoIgnoredBody.results, [
        {
          client_tx_id: forcedErrnoIgnoredClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(forcedErrnoIgnoredClientTxId);

      const rollbackHeaderIgnoredClientTxId = randomUUID();
      const rollbackHeaderIgnoredResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          [TEST_FAIL_AFTER_HEADER_INSERT_HEADER]: "1"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: rollbackHeaderIgnoredClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: new Date().toISOString()
            })
          ]
        })
      });
      assert.equal(rollbackHeaderIgnoredResponse.status, 200);
      const rollbackHeaderIgnoredBody = await parseJsonResponse(rollbackHeaderIgnoredResponse);
      assert.equal(rollbackHeaderIgnoredBody.success, true);
      assert.deepEqual(rollbackHeaderIgnoredBody.results, [
        {
          client_tx_id: rollbackHeaderIgnoredClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(rollbackHeaderIgnoredClientTxId);
    } finally {
      for (const clientTxId of createdClientTxIds) {
        await db.execute(
          `DELETE FROM audit_logs
           WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
          [clientTxId]
        );
        await db.execute(
          `DELETE pti
           FROM pos_transaction_items pti
           INNER JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id
           WHERE pt.client_tx_id = ?`,
          [clientTxId]
        );
        await db.execute(
          `DELETE ptp
           FROM pos_transaction_payments ptp
           INNER JOIN pos_transactions pt ON pt.id = ptp.pos_transaction_id
           WHERE pt.client_tx_id = ?`,
          [clientTxId]
        );
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [clientTxId]);
      }

      
    }
  }
);

localServerTest(
  "sync push integration: order updates return item_cancellation_results and persist cancellation rows",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_item_cancellations"))) {
      t.skip("pos_item_cancellations migration not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const updateId = randomUUID();
      const cancellationId = randomUUID();
      const now = new Date().toISOString();

      const payload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "DINE_IN",
            source_flow: "WALK_IN",
            settlement_flow: "DEFERRED",
            table_id: null,
            reservation_id: null,
            guest_count: 2,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: now,
            closed_at: null,
            notes: "integration-order",
            updated_at: now,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 12500,
                qty: 1,
                discount_amount: 0,
                updated_at: now
              }
            ]
          }
        ],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_CANCELLED",
            delta_json: JSON.stringify({ reason: "integration", cancelled_qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: now,
            created_at: now
          }
        ],
        item_cancellations: [
          {
            cancellation_id: cancellationId,
            update_id: updateId,
            order_id: orderId,
            item_id: 1,
            company_id: companyId,
            outlet_id: outletId,
            cancelled_quantity: 1,
            reason: "integration cancellation",
            cancelled_by_user_id: ownerUserId,
            cancelled_at: now
          }
        ]
      };

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);
      assert.deepEqual(body.results, []);
      assert.deepEqual(body.data.order_update_results, [
        {
          update_id: updateId,
          result: "OK"
        }
      ]);
      assert.deepEqual(body.data.item_cancellation_results, [
        {
          cancellation_id: cancellationId,
          result: "OK"
        }
      ]);

      const [snapshotRows] = await db.execute(
        `SELECT source_flow, settlement_flow
         FROM pos_order_snapshots
         WHERE order_id = ?
         LIMIT 1`,
        [orderId]
      );
      assert.equal(snapshotRows.length, 1);
      assert.equal(String(snapshotRows[0].source_flow), "WALK_IN");
      assert.equal(String(snapshotRows[0].settlement_flow), "DEFERRED");

      const [cancellationRows] = await db.execute(
        `SELECT cancellation_id, update_id, reason, cancelled_quantity
         FROM pos_item_cancellations
         WHERE cancellation_id = ?
         LIMIT 1`,
        [cancellationId]
      );
      assert.equal(cancellationRows.length, 1);
      assert.equal(String(cancellationRows[0].cancellation_id), cancellationId);
      assert.equal(String(cancellationRows[0].update_id), updateId);
      assert.equal(String(cancellationRows[0].reason), "integration cancellation");
      assert.equal(Number(cancellationRows[0].cancelled_quantity), 1);
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

localServerTest(
  "sync push integration: first insert, replay duplicate, mixed batch statuses",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    const createdClientTxIds = [];
    let deniedOutletId = 0;
    let adminUserId = 0;
    let foreignCompanyId = 0;
    let foreignOutletId = 0;
    let foreignUserId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const adminEmail = `sync-admin-${runId}@example.com`;

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

      const [adminRoleRows] = await db.execute(
        `SELECT id
         FROM roles
         WHERE code = 'ADMIN'
         LIMIT 1`
      );
      const adminRoleId = adminRoleRows[0]?.id;
      if (!adminRoleId) {
        throw new Error("ADMIN role fixture not found; run `npm run db:migrate && npm run db:seed`");
      }

      const [adminInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, (SELECT password_hash FROM users WHERE email = ? LIMIT 1), 1)`,
        [Number(owner.company_id), adminEmail, ownerEmail]
      );
      adminUserId = Number(adminInsert.insertId);

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, role_id, outlet_id)
         VALUES (?, ?, NULL)`,
        [adminUserId, Number(adminRoleId)]
      );

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [adminUserId, Number(owner.outlet_id), Number(adminRoleId)]
      );

      // Ensure ADMIN role has pos module with create permission (permission_mask = 1)
      // Sync push requires: roles: ["OWNER", "ADMIN", "CASHIER"], module: "pos", permission: "create"
      // Use bitwise OR to ensure create bit is set regardless of existing permissions
      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, 'pos', 1)
         ON DUPLICATE KEY UPDATE permission_mask = permission_mask | 1`,
        [Number(owner.company_id), Number(adminRoleId)]
      );


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
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: adminEmail,
          password: ownerPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

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
      const firstBody = await parseJsonResponse(firstResponse);
      assert.equal(firstBody.success, true);
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
      assert.deepEqual(await countSyncPushPersistedRows(db, firstClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const replayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(firstPayload)
      });
      assert.equal(replayResponse.status, 200);
      const replayBody = await parseJsonResponse(replayResponse);
      assert.equal(replayBody.success, true);
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
      assert.deepEqual(await countSyncPushPersistedRows(db, firstClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const timestampFormattingClientTxId = randomUUID();
      const timestampBaselineMs = Math.floor(Date.now() / 1_000) * 1_000;
      const timestampWithMillis = new Date(timestampBaselineMs).toISOString();
      const timestampWithoutMillis = timestampWithMillis.replace(".000Z", "Z");
      const timestampFormattingFirstPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: timestampFormattingClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt: timestampWithMillis
          })
        ]
      };

      const timestampFormattingFirstResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(timestampFormattingFirstPayload)
      });
      assert.equal(timestampFormattingFirstResponse.status, 200);
      const timestampFormattingFirstBody = await parseJsonResponse(timestampFormattingFirstResponse);
      assert.equal(timestampFormattingFirstBody.success, true);
      assert.deepEqual(timestampFormattingFirstBody.results, [
        {
          client_tx_id: timestampFormattingClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(timestampFormattingClientTxId);

      const timestampFormattingReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: timestampFormattingClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: timestampWithoutMillis
            })
          ]
        })
      });
      assert.equal(timestampFormattingReplayResponse.status, 200);
      const timestampFormattingReplayBody = await parseJsonResponse(timestampFormattingReplayResponse);
      assert.equal(timestampFormattingReplayBody.success, true);
      assert.deepEqual(timestampFormattingReplayBody.results, [
        {
          client_tx_id: timestampFormattingClientTxId,
          result: "DUPLICATE"
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, timestampFormattingClientTxId), 1);
      assert.deepEqual(await countSyncPushPersistedRows(db, timestampFormattingClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyClientTxId = randomUUID();
      const legacyTransaction = buildSyncTransaction({
        clientTxId: legacyClientTxId,
        companyId,
        outletId,
        cashierUserId: ownerUserId,
        trxAt
      });
      const [legacyInsertResult] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          outletId,
          legacyClientTxId,
          legacyTransaction.status,
          toMysqlDateTime(legacyTransaction.trx_at),
          "",
          1
        ]
      );
      const legacyPosTransactionId = Number(legacyInsertResult.insertId);
      await db.execute(
        `INSERT INTO pos_transaction_items (
           pos_transaction_id,
           company_id,
           outlet_id,
           line_no,
           item_id,
           qty,
           price_snapshot,
           name_snapshot
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legacyPosTransactionId,
          companyId,
          outletId,
          1,
          legacyTransaction.items[0].item_id,
          legacyTransaction.items[0].qty,
          legacyTransaction.items[0].price_snapshot,
          legacyTransaction.items[0].name_snapshot
        ]
      );
      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          legacyPosTransactionId,
          companyId,
          outletId,
          1,
          legacyTransaction.payments[0].method,
          legacyTransaction.payments[0].amount
        ]
      );
      createdClientTxIds.push(legacyClientTxId);

      const legacyReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [legacyTransaction]
        })
      });
      assert.equal(legacyReplayResponse.status, 200);
      const legacyReplayBody = await parseJsonResponse(legacyReplayResponse);
      assert.equal(legacyReplayBody.success, true);
      assertSyncPushResponseShape(legacyReplayBody);
      assert.deepEqual(legacyReplayBody.results, [
        {
          client_tx_id: legacyClientTxId,
          result: "DUPLICATE"
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1HashClientTxId = randomUUID();
      const legacyV1HashTrxAtWithMillis = new Date(Math.floor(Date.now() / 1_000) * 1_000).toISOString();
      const legacyV1HashTransaction = buildSyncTransaction({
        clientTxId: legacyV1HashClientTxId,
        companyId,
        outletId,
        cashierUserId: ownerUserId,
        trxAt: legacyV1HashTrxAtWithMillis
      });
      const legacyV1PayloadHash = computeLegacyPayloadSha256(legacyV1HashTransaction);

      const [legacyV1InsertResult] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          outletId,
          legacyV1HashClientTxId,
          legacyV1HashTransaction.status,
          toMysqlDateTime(legacyV1HashTransaction.trx_at),
          legacyV1PayloadHash,
          1
        ]
      );
      const legacyV1PosTransactionId = Number(legacyV1InsertResult.insertId);
      await db.execute(
        `INSERT INTO pos_transaction_items (
           pos_transaction_id,
           company_id,
           outlet_id,
           line_no,
           item_id,
           qty,
           price_snapshot,
           name_snapshot
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legacyV1PosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1HashTransaction.items[0].item_id,
          legacyV1HashTransaction.items[0].qty,
          legacyV1HashTransaction.items[0].price_snapshot,
          legacyV1HashTransaction.items[0].name_snapshot
        ]
      );
      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          legacyV1PosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1HashTransaction.payments[0].method,
          legacyV1HashTransaction.payments[0].amount
        ]
      );
      createdClientTxIds.push(legacyV1HashClientTxId);

      const legacyV1ReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...legacyV1HashTransaction,
              trx_at: legacyV1HashTransaction.trx_at.replace(".000Z", "Z")
            }
          ]
        })
      });
      assert.equal(legacyV1ReplayResponse.status, 200);
      const legacyV1ReplayBody = await parseJsonResponse(legacyV1ReplayResponse);
      assert.equal(legacyV1ReplayBody.success, true);
      assertSyncPushResponseShape(legacyV1ReplayBody);
      assert.deepEqual(legacyV1ReplayBody.results, [
        {
          client_tx_id: legacyV1HashClientTxId,
          result: "DUPLICATE"
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1HashClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1HashClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1ExactReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [legacyV1HashTransaction]
        })
      });
      assert.equal(legacyV1ExactReplayResponse.status, 200);
      const legacyV1ExactReplayBody = await parseJsonResponse(legacyV1ExactReplayResponse);
      assert.equal(legacyV1ExactReplayBody.success, true);
      assertSyncPushResponseShape(legacyV1ExactReplayBody);
      assert.deepEqual(legacyV1ExactReplayBody.results, [
        {
          client_tx_id: legacyV1HashClientTxId,
          result: "DUPLICATE"
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1HashClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1HashClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1CashierMismatchResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...legacyV1HashTransaction,
              cashier_user_id: ownerUserId + 999
            }
          ]
        })
      });
      assert.equal(legacyV1CashierMismatchResponse.status, 200);
      const legacyV1CashierMismatchBody = await parseJsonResponse(legacyV1CashierMismatchResponse);
      assert.equal(legacyV1CashierMismatchBody.success, true);
      assertSyncPushResponseShape(legacyV1CashierMismatchBody);
      assert.deepEqual(legacyV1CashierMismatchBody.results, [
        {
          client_tx_id: legacyV1HashClientTxId,
          result: "ERROR",
          message: IDEMPOTENCY_CONFLICT_MESSAGE
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1HashClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1HashClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1OffsetClientTxId = randomUUID();
      const legacyV1OffsetTrxAt = "2026-02-22T15:30:00+07:00";
      const legacyV1OffsetReplayTrxAt = "2026-02-22T08:30:00Z";
      const legacyV1OffsetTransaction = buildSyncTransaction({
        clientTxId: legacyV1OffsetClientTxId,
        companyId,
        outletId,
        cashierUserId: ownerUserId,
        trxAt: legacyV1OffsetTrxAt
      });
      const legacyV1OffsetPayloadHash = computeLegacyPayloadSha256(legacyV1OffsetTransaction);

      const [legacyV1OffsetInsertResult] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          outletId,
          legacyV1OffsetClientTxId,
          legacyV1OffsetTransaction.status,
          toMysqlDateTime(legacyV1OffsetTransaction.trx_at),
          legacyV1OffsetPayloadHash,
          1
        ]
      );
      const legacyV1OffsetPosTransactionId = Number(legacyV1OffsetInsertResult.insertId);
      await db.execute(
        `INSERT INTO pos_transaction_items (
           pos_transaction_id,
           company_id,
           outlet_id,
           line_no,
           item_id,
           qty,
           price_snapshot,
           name_snapshot
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legacyV1OffsetPosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1OffsetTransaction.items[0].item_id,
          legacyV1OffsetTransaction.items[0].qty,
          legacyV1OffsetTransaction.items[0].price_snapshot,
          legacyV1OffsetTransaction.items[0].name_snapshot
        ]
      );
      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          legacyV1OffsetPosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1OffsetTransaction.payments[0].method,
          legacyV1OffsetTransaction.payments[0].amount
        ]
      );
      createdClientTxIds.push(legacyV1OffsetClientTxId);

      const legacyV1OffsetReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...legacyV1OffsetTransaction,
              trx_at: legacyV1OffsetReplayTrxAt
            }
          ]
        })
      });
      assert.equal(legacyV1OffsetReplayResponse.status, 200);
      const legacyV1OffsetReplayBody = await parseJsonResponse(legacyV1OffsetReplayResponse);
      assert.equal(legacyV1OffsetReplayBody.success, true);
      assertSyncPushResponseShape(legacyV1OffsetReplayBody);
      assert.deepEqual(legacyV1OffsetReplayBody.results, [
        {
          client_tx_id: legacyV1OffsetClientTxId,
          result: "ERROR",
          message: IDEMPOTENCY_CONFLICT_MESSAGE
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1OffsetClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1OffsetClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1OffsetMirrorClientTxId = randomUUID();
      const legacyV1OffsetMirrorTrxAt = "2026-02-22T08:30:00Z";
      const legacyV1OffsetMirrorReplayTrxAt = "2026-02-22T15:30:00+07:00";
      const legacyV1OffsetMirrorTransaction = buildSyncTransaction({
        clientTxId: legacyV1OffsetMirrorClientTxId,
        companyId,
        outletId,
        cashierUserId: ownerUserId,
        trxAt: legacyV1OffsetMirrorTrxAt
      });
      const legacyV1OffsetMirrorPayloadHash = computeLegacyPayloadSha256(legacyV1OffsetMirrorTransaction);

      const [legacyV1OffsetMirrorInsertResult] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          outletId,
          legacyV1OffsetMirrorClientTxId,
          legacyV1OffsetMirrorTransaction.status,
          toMysqlDateTime(legacyV1OffsetMirrorTransaction.trx_at),
          legacyV1OffsetMirrorPayloadHash,
          1
        ]
      );
      const legacyV1OffsetMirrorPosTransactionId = Number(legacyV1OffsetMirrorInsertResult.insertId);
      await db.execute(
        `INSERT INTO pos_transaction_items (
           pos_transaction_id,
           company_id,
           outlet_id,
           line_no,
           item_id,
           qty,
           price_snapshot,
           name_snapshot
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legacyV1OffsetMirrorPosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1OffsetMirrorTransaction.items[0].item_id,
          legacyV1OffsetMirrorTransaction.items[0].qty,
          legacyV1OffsetMirrorTransaction.items[0].price_snapshot,
          legacyV1OffsetMirrorTransaction.items[0].name_snapshot
        ]
      );
      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          legacyV1OffsetMirrorPosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1OffsetMirrorTransaction.payments[0].method,
          legacyV1OffsetMirrorTransaction.payments[0].amount
        ]
      );
      createdClientTxIds.push(legacyV1OffsetMirrorClientTxId);

      const legacyV1OffsetMirrorReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...legacyV1OffsetMirrorTransaction,
              trx_at: legacyV1OffsetMirrorReplayTrxAt
            }
          ]
        })
      });
      assert.equal(legacyV1OffsetMirrorReplayResponse.status, 200);
      const legacyV1OffsetMirrorReplayBody = await parseJsonResponse(legacyV1OffsetMirrorReplayResponse);
      assert.equal(legacyV1OffsetMirrorReplayBody.success, true);
      assertSyncPushResponseShape(legacyV1OffsetMirrorReplayBody);
      assert.deepEqual(legacyV1OffsetMirrorReplayBody.results, [
        {
          client_tx_id: legacyV1OffsetMirrorClientTxId,
          result: "ERROR",
          message: IDEMPOTENCY_CONFLICT_MESSAGE
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1OffsetMirrorClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1OffsetMirrorClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      for (const retryableCase of [
        { errno: 1205, message: RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE },
        { errno: 1213, message: RETRYABLE_DB_DEADLOCK_MESSAGE }
      ]) {
        const forcedErrnoClientTxId = randomUUID();
        const forcedErrnoPayload = {
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: forcedErrnoClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt
            })
          ]
        };

        const forcedErrnoResponse = await fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
            [TEST_FORCE_DB_ERRNO_HEADER]: String(retryableCase.errno)
          },
          body: JSON.stringify(forcedErrnoPayload)
        });
        assert.equal(forcedErrnoResponse.status, 200);
        const forcedErrnoBody = await parseJsonResponse(forcedErrnoResponse);
        assert.equal(forcedErrnoBody.success, true);
        assertSyncPushResponseShape(forcedErrnoBody);
        assert.deepEqual(forcedErrnoBody.results, [
          {
            client_tx_id: forcedErrnoClientTxId,
            result: "ERROR",
            message: retryableCase.message
          }
        ]);
        assert.equal(await countAcceptedSyncPushEvents(db, forcedErrnoClientTxId), 0);
        assert.deepEqual(await countSyncPushPersistedRows(db, forcedErrnoClientTxId), {
          tx_total: 0,
          item_total: 0,
          payment_total: 0
        });
      }

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
      const mixedBody = await parseJsonResponse(mixedResponse);
      assert.equal(mixedBody.success, true);
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
      assert.deepEqual(await countSyncPushPersistedRows(db, secondClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

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
      const sameRequestDuplicateBody = await parseJsonResponse(sameRequestDuplicateResponse);
      assert.equal(sameRequestDuplicateBody.success, true);
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
      assert.deepEqual(await countSyncPushPersistedRows(db, sameRequestDuplicateClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const concurrentDuplicateClientTxId = randomUUID();
      const concurrentDuplicatePayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: concurrentDuplicateClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const [concurrentFirstResponse, concurrentSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentDuplicatePayload)
        }),
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentDuplicatePayload)
        })
      ]);
      assert.equal(concurrentFirstResponse.status, 200);
      assert.equal(concurrentSecondResponse.status, 200);

      const [concurrentFirstBody, concurrentSecondBody] = await Promise.all([
        parseJsonResponse(concurrentFirstResponse),
        parseJsonResponse(concurrentSecondResponse)
      ]);

      assertSyncPushResponseShape(concurrentFirstBody);
      assertSyncPushResponseShape(concurrentSecondBody);
      const concurrentResults = [
        concurrentFirstBody.results?.[0]?.result,
        concurrentSecondBody.results?.[0]?.result
      ].sort((left, right) => String(left).localeCompare(String(right)));
      assert.deepEqual(concurrentResults, ["DUPLICATE", "OK"]);
      createdClientTxIds.push(concurrentDuplicateClientTxId);

      assert.deepEqual(await countSyncPushPersistedRows(db, concurrentDuplicateClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });
      assert.equal(await countAcceptedSyncPushEvents(db, concurrentDuplicateClientTxId), 1);

      const conflictClientTxId = randomUUID();
      const conflictPayloadA = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: conflictClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };
      const conflictPayloadB = {
        outlet_id: outletId,
        transactions: [
          {
            ...buildSyncTransaction({
              clientTxId: conflictClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt
            }),
            items: [
              {
                item_id: 1,
                qty: 2,
                price_snapshot: 13000,
                name_snapshot: "Test Item Conflict"
              }
            ]
          }
        ]
      };

      const [conflictFirstResponse, conflictSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(conflictPayloadA)
        }),
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(conflictPayloadB)
        })
      ]);
      assert.equal(conflictFirstResponse.status, 200);
      assert.equal(conflictSecondResponse.status, 200);

      const [conflictFirstBody, conflictSecondBody] = await Promise.all([
        parseJsonResponse(conflictFirstResponse),
        parseJsonResponse(conflictSecondResponse)
      ]);
      assertSyncPushResponseShape(conflictFirstBody);
      assertSyncPushResponseShape(conflictSecondBody);

      const conflictItems = [
        conflictFirstBody.results?.[0],
        conflictSecondBody.results?.[0]
      ];
      const okItem = conflictItems.find((item) => item?.result === "OK");
      const errorItem = conflictItems.find((item) => item?.result === "ERROR");
      assert.ok(okItem);
      assert.ok(errorItem);
      assert.equal(errorItem.message, IDEMPOTENCY_CONFLICT_MESSAGE);
      createdClientTxIds.push(conflictClientTxId);

      assert.deepEqual(await countSyncPushPersistedRows(db, conflictClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });
      assert.equal(await countAcceptedSyncPushEvents(db, conflictClientTxId), 1);

      const rollbackClientTxId = randomUUID();
      const rollbackPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: rollbackClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const rollbackResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-jp-sync-push-fail-after-header": "1"
        },
        body: JSON.stringify(rollbackPayload)
      });
      assert.equal(rollbackResponse.status, 200);
      const rollbackBody = await parseJsonResponse(rollbackResponse);
      assert.equal(rollbackBody.success, true);
      assert.deepEqual(rollbackBody.results, [
        {
          client_tx_id: rollbackClientTxId,
          result: "ERROR",
          message: "insert failed"
        }
      ]);

      assert.deepEqual(await countSyncPushPersistedRows(db, rollbackClientTxId), {
        tx_total: 0,
        item_total: 0,
        payment_total: 0
      });
      assert.equal(await countAcceptedSyncPushEvents(db, rollbackClientTxId), 0);

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
              cashierUserId: adminUserId,
              trxAt
            })
          ]
        })
      });
      assert.equal(deniedOutletResponse.status, 403);
      const deniedOutletBody = await parseJsonResponse(deniedOutletResponse);
      assert.equal(deniedOutletBody.success, false);
      assert.equal(deniedOutletBody.error.code, "FORBIDDEN");

      const [deniedOutletCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [deniedOutletTxId]
      );
      assert.equal(Number(deniedOutletCountRows[0].total), 0);
      assert.equal(await countAcceptedSyncPushEvents(db, deniedOutletTxId), 0);

      const foreignCompanyCode = `FRGN${Date.now().toString(36)}`.slice(0, 12).toUpperCase();
      const foreignOutletCode = "MAIN";
      const [foreignCompanyResult] = await db.execute(
        `INSERT INTO companies (code, name) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), id = LAST_INSERT_ID(id)`,
        [foreignCompanyCode, `Foreign Company ${foreignCompanyCode}`]
      );
      foreignCompanyId = Number(foreignCompanyResult.insertId);

      const [foreignOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), id = LAST_INSERT_ID(id)`,
        [foreignCompanyId, foreignOutletCode, "Foreign Main Outlet"]
      );
      foreignOutletId = Number(foreignOutletResult.insertId);

      const foreignUserEmail = `foreigncashier${Date.now().toString(36)}@example.com`;
      const [foreignUserResult] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, (SELECT password_hash FROM users WHERE email = ? LIMIT 1), 1)`,
        [foreignCompanyId, foreignUserEmail, ownerEmail]
      );
      foreignUserId = Number(foreignUserResult.insertId);

      await db.execute(
        `INSERT INTO user_outlets (user_id, outlet_id) VALUES (?, ?)`,
        [foreignUserId, foreignOutletId]
      );

      const [cashierMismatchRoleRows] = await db.execute(
        `SELECT id FROM roles WHERE code = 'CASHIER' LIMIT 1`
      );
      const cashierRoleId = cashierMismatchRoleRows[0]?.id;
      if (cashierRoleId) {
        await db.execute(
          `INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES (?, ?, ?)`,
          [foreignUserId, cashierRoleId, foreignOutletId]
        );
      }

      const cashierMismatchTxId = randomUUID();
      const cashierMismatchResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: cashierMismatchTxId,
              companyId,
              outletId,
              cashierUserId: foreignUserId,
              trxAt
            })
          ]
        })
      });
      assert.equal(cashierMismatchResponse.status, 200);
      const cashierMismatchBody = await parseJsonResponse(cashierMismatchResponse);
      assert.equal(cashierMismatchBody.success, true);
      assert.deepEqual(cashierMismatchBody.results, [
        {
          client_tx_id: cashierMismatchTxId,
          result: "ERROR",
          message: "cashier_user_id mismatch"
        }
      ]);

      const [cashierMismatchCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE company_id = ? AND client_tx_id = ?`,
        [companyId, cashierMismatchTxId]
      );
      assert.equal(Number(cashierMismatchCountRows[0].total), 0);

      const replayStabilityTxId = randomUUID();
      const replayStabilityPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: replayStabilityTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const firstStabilityResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(replayStabilityPayload)
      });
      assert.equal(firstStabilityResponse.status, 200);
      const firstStabilityBody = await parseJsonResponse(firstStabilityResponse);
      assert.equal(firstStabilityBody.success, true);
      assert.deepEqual(firstStabilityBody.results, [
        {
          client_tx_id: replayStabilityTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(replayStabilityTxId);

      await db.execute("UPDATE users SET is_active = 0 WHERE id = ?", [ownerUserId]);

      try {
        const replayStabilityResponse = await fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(replayStabilityPayload)
        });
        assert.equal(replayStabilityResponse.status, 200);
        const replayStabilityBody = await parseJsonResponse(replayStabilityResponse);
        assert.equal(replayStabilityBody.success, true);
        assert.deepEqual(replayStabilityBody.results, [
          {
            client_tx_id: replayStabilityTxId,
            result: "DUPLICATE"
          }
        ]);
      }
      finally {
        await db.execute("UPDATE users SET is_active = 1 WHERE id = ?", [ownerUserId]);
      }

      const inactiveCashierFirstWriteTxId = randomUUID();
      await db.execute("UPDATE users SET is_active = 0 WHERE id = ?", [ownerUserId]);

      try {
        const inactiveFirstWriteResponse = await fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            outlet_id: outletId,
            transactions: [
              buildSyncTransaction({
                clientTxId: inactiveCashierFirstWriteTxId,
                companyId,
                outletId,
                cashierUserId: ownerUserId,
                trxAt
              })
            ]
          })
        });
        assert.equal(inactiveFirstWriteResponse.status, 200);
        const inactiveFirstWriteBody = await parseJsonResponse(inactiveFirstWriteResponse);
        assert.equal(inactiveFirstWriteBody.success, true);
        assert.deepEqual(inactiveFirstWriteBody.results, [
          {
            client_tx_id: inactiveCashierFirstWriteTxId,
            result: "OK"
          }
        ]);
        createdClientTxIds.push(inactiveCashierFirstWriteTxId);

        const [inactiveFirstWriteCountRows] = await db.execute(
          `SELECT COUNT(*) AS total
           FROM pos_transactions
           WHERE company_id = ? AND client_tx_id = ?`,
          [companyId, inactiveCashierFirstWriteTxId]
        );
        assert.equal(Number(inactiveFirstWriteCountRows[0].total), 1);
      } finally {
        await db.execute("UPDATE users SET is_active = 1 WHERE id = ?", [ownerUserId]);
      }

      const crossTenantClientTxId = randomUUID();
      const crossTenantPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: crossTenantClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      await db.execute(
        `INSERT INTO pos_transactions (company_id, outlet_id, client_tx_id, status, trx_at, payload_sha256, payload_hash_version)
         VALUES (?, ?, ?, 'COMPLETED', ?, '', 1)`,
        [foreignCompanyId, foreignOutletId, crossTenantClientTxId, toMysqlDateTime(trxAt)]
      );
      createdClientTxIds.push(crossTenantClientTxId);

      const crossTenantResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(crossTenantPayload)
      });
      assert.equal(crossTenantResponse.status, 200);
      const crossTenantBody = await parseJsonResponse(crossTenantResponse);
      assert.equal(crossTenantBody.success, true);
      assert.deepEqual(crossTenantBody.results, [
        {
          client_tx_id: crossTenantClientTxId,
          result: "OK"
        }
      ]);

      const [crossTenantCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE company_id = ? AND client_tx_id = ?`,
        [companyId, crossTenantClientTxId]
      );
      assert.equal(Number(crossTenantCountRows[0].total), 1);

      const [foreignTenantCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE company_id = ? AND client_tx_id = ?`,
        [foreignCompanyId, crossTenantClientTxId]
      );
      assert.equal(Number(foreignTenantCountRows[0].total), 1);
    } finally {
      await stopApiServer(childProcess);

      for (const clientTxId of createdClientTxIds) {
        await db.execute(
          `DELETE FROM audit_logs
           WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
          [clientTxId]
        );
        await db.execute(
          `DELETE pti
           FROM pos_transaction_items pti
           INNER JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id
           WHERE pt.client_tx_id = ?`,
          [clientTxId]
        );
        await db.execute(
          `DELETE ptp
           FROM pos_transaction_payments ptp
           INNER JOIN pos_transactions pt ON pt.id = ptp.pos_transaction_id
           WHERE pt.client_tx_id = ?`,
          [clientTxId]
        );
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [clientTxId]);
      }

      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM pos_transaction_items WHERE outlet_id = ?", [deniedOutletId]);
        await db.execute("DELETE FROM pos_transaction_payments WHERE outlet_id = ?", [deniedOutletId]);
        await db.execute("DELETE FROM pos_transactions WHERE outlet_id = ?", [deniedOutletId]);
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      if (adminUserId > 0) {
        await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [adminUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [adminUserId]);
      }

      try {
        await db.execute("DELETE FROM pos_transaction_items WHERE company_id = ?", [foreignCompanyId]);
        await db.execute("DELETE FROM pos_transaction_payments WHERE company_id = ?", [foreignCompanyId]);
        await db.execute("DELETE FROM pos_transactions WHERE company_id = ?", [foreignCompanyId]);
        await db.execute("DELETE FROM user_outlets WHERE user_id = ?", [foreignUserId]);
        await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [foreignUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [foreignUserId]);
        await db.execute("DELETE FROM outlets WHERE id = ?", [foreignOutletId]);
        await db.execute("DELETE FROM companies WHERE id = ?", [foreignCompanyId]);
      } catch (e) {
        // Ignore cleanup errors for foreign fixtures
      }

      
    }
  }
);

// SPLIT TEST: This test was split into 4 separate tests below for better isolation
// Original test: "active posting card policy, sales tax posting, and duplicate replay journal idempotency"

// Test 1: CARD Payment Policy
localServerTest(
  "sync push integration: active posting card payment policy",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;
    const createdClientTxIds = [];
    let postingFixture = {
      createdMappingKeys: [],
      createdAccountIds: [],
      createdPaymentMethodCodes: []
    };
    let createdFiscalYearId = null;

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

      ownerUserId = Number(owner.id);
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);

      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);
      const fiscalContext = await ensureOpenFiscalDate(db, companyId);
      const postingTrxAt = fiscalContext.trxAt;
      createdFiscalYearId = fiscalContext.createdFiscalYearId;

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        envOverrides: {
          [SYNC_PUSH_POSTING_MODE_ENV]: "active"
        }
      });
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await parseJsonResponse(loginResponse);
      const accessToken = loginBody.data.access_token;

      // Test CARD payment creates proper journal entries
      const cardClientTxId = randomUUID();
      const cardPolicyResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [{
            ...buildSyncTransaction({
              clientTxId: cardClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: postingTrxAt
            }),
            payments: [{ method: "CARD", amount: 12500 }]
          }]
        })
      });
      assert.equal(cardPolicyResponse.status, 200);
      const cardPolicyBody = await parseJsonResponse(cardPolicyResponse);
      assert.equal(cardPolicyBody.success, true);
      assert.deepEqual(cardPolicyBody.results, [{ client_tx_id: cardClientTxId, result: "OK" }]);
      createdClientTxIds.push(cardClientTxId);

      assert.deepEqual(await countSyncPushPersistedRows(db, cardClientTxId), {
        tx_total: 1, item_total: 1, payment_total: 1
      });
      assert.deepEqual(await countSyncPushJournalRows(db, cardClientTxId), {
        batch_total: 1, line_total: 2
      });
      
      const cardAcceptedAuditPayload = await readAcceptedSyncPushAuditPayload(db, cardClientTxId);
      assert.notEqual(cardAcceptedAuditPayload, null);
      assert.equal(cardAcceptedAuditPayload.posting_mode, "active");
      assert.equal(cardAcceptedAuditPayload.balance_ok, true);
    } finally {
      await stopApiServer(childProcess);
      for (const clientTxId of createdClientTxIds) {
        await cleanupSyncPushPersistedArtifacts(db, clientTxId);
      }
      if (companyId > 0 && outletId > 0) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }
      if (createdFiscalYearId && Number(createdFiscalYearId) > 0) {
        await db.execute("DELETE FROM fiscal_years WHERE id = ?", [createdFiscalYearId]);
      }
    }
  }
);

// Test 2: Sales Tax Calculation
localServerTest(
  "sync push integration: active posting sales tax calculation",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;
    const createdClientTxIds = [];
    let postingFixture = {
      createdMappingKeys: [],
      createdAccountIds: [],
      createdPaymentMethodCodes: []
    };
    let createdFiscalYearId = null;
    let taxConfig = null;

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
        throw new Error("owner fixture not found; run database seed first");
      }

      ownerUserId = Number(owner.id);
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);

      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);
      const fiscalContext = await ensureOpenFiscalDate(db, companyId);
      const postingTrxAt = fiscalContext.trxAt;
      createdFiscalYearId = fiscalContext.createdFiscalYearId;

      // Setup tax config with account
      taxConfig = await setCompanyDefaultTaxRate(db, companyId, {
        rate: 10,
        inclusive: false,
        withAccount: true
      });

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        envOverrides: {
          [SYNC_PUSH_POSTING_MODE_ENV]: "active"
        }
      });
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await parseJsonResponse(loginResponse);
      const accessToken = loginBody.data.access_token;

      // Test tax calculation creates proper journal entries with tax lines
      const taxedClientTxId = randomUUID();
      const taxedResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [{
            ...buildSyncTransaction({
              clientTxId: taxedClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: postingTrxAt
            }),
            payments: [{ method: "CASH", amount: 13750 }]
          }]
        })
      });
      assert.equal(taxedResponse.status, 200);
      const taxedBody = await parseJsonResponse(taxedResponse);
      assert.equal(taxedBody.success, true);
      assert.deepEqual(taxedBody.results, [{ client_tx_id: taxedClientTxId, result: "OK" }]);
      createdClientTxIds.push(taxedClientTxId);

      // 3 lines: sales, cash, tax
      assert.deepEqual(await countSyncPushJournalRows(db, taxedClientTxId), {
        batch_total: 1, line_total: 3
      });
      
      const taxedSummary = await readSyncPushJournalSummary(db, taxedClientTxId);
      assert.equal(taxedSummary.tax_line_total, 1);
      assert.equal(taxedSummary.tax_credit_total, 1250);
      assert.equal(taxedSummary.debit_total, taxedSummary.credit_total);
    } finally {
      await stopApiServer(childProcess);
      for (const clientTxId of createdClientTxIds) {
        await cleanupSyncPushPersistedArtifacts(db, clientTxId);
      }
      if (companyId > 0 && taxConfig) {
        await restoreCompanyDefaultTaxRate(db, companyId, taxConfig);
      }
      if (companyId > 0 && outletId > 0) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }
      if (createdFiscalYearId && Number(createdFiscalYearId) > 0) {
        await db.execute("DELETE FROM fiscal_years WHERE id = ?", [createdFiscalYearId]);
      }
    }
  }
);

// Test 3: Missing Tax Account Handling
localServerTest(
  "sync push integration: active posting missing tax account handling",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;
    const createdClientTxIds = [];
    let postingFixture = {
      createdMappingKeys: [],
      createdAccountIds: [],
      createdPaymentMethodCodes: []
    };
    let createdFiscalYearId = null;
    let taxConfig = null;

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
        throw new Error("owner fixture not found; run database seed first");
      }

      ownerUserId = Number(owner.id);
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);

      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);
      const fiscalContext = await ensureOpenFiscalDate(db, companyId);
      const postingTrxAt = fiscalContext.trxAt;
      createdFiscalYearId = fiscalContext.createdFiscalYearId;

      // Setup tax config WITHOUT account (this should cause failure)
      taxConfig = await setCompanyDefaultTaxRate(db, companyId, {
        rate: 10,
        inclusive: false,
        withAccount: false
      });

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        envOverrides: {
          [SYNC_PUSH_POSTING_MODE_ENV]: "active"
        }
      });
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await parseJsonResponse(loginResponse);
      const accessToken = loginBody.data.access_token;

      // Test missing tax account causes graceful failure
      const taxAccountMissingClientTxId = randomUUID();
      const taxAccountMissingResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [{
            ...buildSyncTransaction({
              clientTxId: taxAccountMissingClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: postingTrxAt
            }),
            payments: [{ method: "CASH", amount: 13750 }]
          }]
        })
      });
      assert.equal(taxAccountMissingResponse.status, 200);
      const taxAccountMissingBody = await parseJsonResponse(taxAccountMissingResponse);
      assert.equal(taxAccountMissingBody.success, true);
      assert.deepEqual(taxAccountMissingBody.results, [{
        client_tx_id: taxAccountMissingClientTxId,
        result: "ERROR",
        message: "insert failed"
      }]);
      createdClientTxIds.push(taxAccountMissingClientTxId);

      // Verify error details
      const taxAccountMissingAudit = await readPostingHookFailureAuditPayload(db, taxAccountMissingClientTxId);
      assert.notEqual(taxAccountMissingAudit, null);
      assert.equal(taxAccountMissingAudit.posting_mode, "active");
      assert.equal(taxAccountMissingAudit.balance_ok, false);
      assert.equal(
        String(taxAccountMissingAudit.reason ?? "").startsWith("TAX_ACCOUNT_MISSING:"),
        true
      );

      // Verify nothing was persisted
      assert.deepEqual(await countSyncPushPersistedRows(db, taxAccountMissingClientTxId), {
        tx_total: 0, item_total: 0, payment_total: 0
      });
      assert.deepEqual(await countSyncPushJournalRows(db, taxAccountMissingClientTxId), {
        batch_total: 0, line_total: 0
      });
    } finally {
      await stopApiServer(childProcess);
      for (const clientTxId of createdClientTxIds) {
        await cleanupSyncPushPersistedArtifacts(db, clientTxId);
      }
      if (companyId > 0 && taxConfig) {
        await restoreCompanyDefaultTaxRate(db, companyId, taxConfig);
      }
      if (companyId > 0 && outletId > 0) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }
      if (createdFiscalYearId && Number(createdFiscalYearId) > 0) {
        await db.execute("DELETE FROM fiscal_years WHERE id = ?", [createdFiscalYearId]);
      }
    }
  }
);

// Test 4: Duplicate Transaction Idempotency
localServerTest(
  "sync push integration: duplicate transaction idempotency",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;
    const createdClientTxIds = [];
    let postingFixture = {
      createdMappingKeys: [],
      createdAccountIds: [],
      createdPaymentMethodCodes: []
    };
    let createdFiscalYearId = null;

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
        throw new Error("owner fixture not found; run database seed first");
      }

      ownerUserId = Number(owner.id);
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);

      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);
      const fiscalContext = await ensureOpenFiscalDate(db, companyId);
      const postingTrxAt = fiscalContext.trxAt;
      createdFiscalYearId = fiscalContext.createdFiscalYearId;

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        envOverrides: {
          [SYNC_PUSH_POSTING_MODE_ENV]: "active"
        }
      });
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await parseJsonResponse(loginResponse);
      const accessToken = loginBody.data.access_token;

      // Test 1: Sequential duplicate - first OK, second DUPLICATE
      const duplicateClientTxId = randomUUID();
      const duplicatePayload = {
        outlet_id: outletId,
        transactions: [buildSyncTransaction({
          clientTxId: duplicateClientTxId,
          companyId,
          outletId,
          cashierUserId: ownerUserId,
          trxAt: postingTrxAt
        })]
      };

      // First push - should succeed
      const firstDuplicateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(duplicatePayload)
      });
      assert.equal(firstDuplicateResponse.status, 200);
      const firstDuplicateBody = await parseJsonResponse(firstDuplicateResponse);
      assert.equal(firstDuplicateBody.success, true);
      assert.deepEqual(firstDuplicateBody.results, [{
        client_tx_id: duplicateClientTxId,
        result: "OK"
      }]);
      createdClientTxIds.push(duplicateClientTxId);

      // Second push - should be duplicate
      const replayDuplicateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(duplicatePayload)
      });
      assert.equal(replayDuplicateResponse.status, 200);
      const replayDuplicateBody = await parseJsonResponse(replayDuplicateResponse);
      assert.equal(replayDuplicateBody.success, true);
      assert.deepEqual(replayDuplicateBody.results, [{
        client_tx_id: duplicateClientTxId,
        result: "DUPLICATE"
      }]);

      // Verify audit trail
      assert.equal(await countAcceptedSyncPushEvents(db, duplicateClientTxId), 1);
      assert.equal(await countDuplicateSyncPushEvents(db, duplicateClientTxId), 1);
      const duplicateAuditPayload = await readDuplicateSyncPushAuditPayload(db, duplicateClientTxId);
      assert.notEqual(duplicateAuditPayload, null);
      assert.equal(duplicateAuditPayload.reason, "DUPLICATE_REPLAY");

      // Test 2: Concurrent duplicates - one OK, one DUPLICATE
      const concurrentDuplicateClientTxId = randomUUID();
      const concurrentDuplicatePayload = {
        outlet_id: outletId,
        transactions: [buildSyncTransaction({
          clientTxId: concurrentDuplicateClientTxId,
          companyId,
          outletId,
          cashierUserId: ownerUserId,
          trxAt: postingTrxAt
        })]
      };

      const [concurrentDuplicateFirstResponse, concurrentDuplicateSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentDuplicatePayload)
        }),
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentDuplicatePayload)
        })
      ]);
      assert.equal(concurrentDuplicateFirstResponse.status, 200);
      assert.equal(concurrentDuplicateSecondResponse.status, 200);

      const [concurrentDuplicateFirstBody, concurrentDuplicateSecondBody] = await Promise.all([
        parseJsonResponse(concurrentDuplicateFirstResponse),
        parseJsonResponse(concurrentDuplicateSecondResponse)
      ]);

      const concurrentDuplicateResults = [
        concurrentDuplicateFirstBody.results?.[0]?.result,
        concurrentDuplicateSecondBody.results?.[0]?.result
      ].sort((left, right) => String(left).localeCompare(String(right)));
      assert.deepEqual(concurrentDuplicateResults, ["DUPLICATE", "OK"]);
      createdClientTxIds.push(concurrentDuplicateClientTxId);

      // Test 3: Concurrent conflict - different payloads same ID
      const concurrentConflictClientTxId = randomUUID();
      const concurrentConflictPayloadA = {
        outlet_id: outletId,
        transactions: [buildSyncTransaction({
          clientTxId: concurrentConflictClientTxId,
          companyId,
          outletId,
          cashierUserId: ownerUserId,
          trxAt: postingTrxAt
        })]
      };
      const concurrentConflictPayloadB = {
        outlet_id: outletId,
        transactions: [{
          ...buildSyncTransaction({
            clientTxId: concurrentConflictClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt: postingTrxAt
          }),
          items: [{
            ...buildSyncTransaction({
              clientTxId: concurrentConflictClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: postingTrxAt
            }).items[0],
            name_snapshot: "Test Item Conflict"
          }]
        }]
      };

      const [concurrentConflictFirstResponse, concurrentConflictSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentConflictPayloadA)
        }),
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentConflictPayloadB)
        })
      ]);
      assert.equal(concurrentConflictFirstResponse.status, 200);
      assert.equal(concurrentConflictSecondResponse.status, 200);

      const [concurrentConflictFirstBody, concurrentConflictSecondBody] = await Promise.all([
        parseJsonResponse(concurrentConflictFirstResponse),
        parseJsonResponse(concurrentConflictSecondResponse)
      ]);

      const concurrentConflictResults = [
        concurrentConflictFirstBody.results?.[0],
        concurrentConflictSecondBody.results?.[0]
      ];
      const concurrentConflictOk = concurrentConflictResults.find((item) => item?.result === "OK");
      const concurrentConflictError = concurrentConflictResults.find((item) => item?.result === "ERROR");
      assert.ok(concurrentConflictOk);
      assert.ok(concurrentConflictError);
      assert.equal(concurrentConflictError.message, IDEMPOTENCY_CONFLICT_MESSAGE);
      createdClientTxIds.push(concurrentConflictClientTxId);
    } finally {
      await stopApiServer(childProcess);
      for (const clientTxId of createdClientTxIds) {
        await cleanupSyncPushPersistedArtifacts(db, clientTxId);
      }
      if (companyId > 0 && outletId > 0) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }
      if (createdFiscalYearId && Number(createdFiscalYearId) > 0) {
        await db.execute("DELETE FROM fiscal_years WHERE id = ?", [createdFiscalYearId]);
      }
    }
  }
);

localServerTest(
  "sync push integration: active posting unbalanced journal is rejected and rolled back",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;
    let postingFixture = {
      createdMappingKeys: [],
      createdAccountIds: [],
      createdPaymentMethodCodes: []
    };
    let createdFiscalYearId = null;

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

      ownerUserId = Number(owner.id);
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);
      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);
      const fiscalContext = await ensureOpenFiscalDate(db, companyId);
      const postingTrxAt = fiscalContext.trxAt;
      createdFiscalYearId = fiscalContext.createdFiscalYearId;

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        envOverrides: {
          [SYNC_PUSH_POSTING_MODE_ENV]: "active",
          [SYNC_PUSH_POSTING_FORCE_UNBALANCED_ENV]: "1"
        }
      });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const unbalancedClientTxId = randomUUID();
      const unbalancedResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: unbalancedClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: postingTrxAt
            })
          ]
        })
      });
      assert.equal(unbalancedResponse.status, 200);
      const unbalancedBody = await parseJsonResponse(unbalancedResponse);
      assert.equal(unbalancedBody.success, true);
      assert.deepEqual(unbalancedBody.results, [
        {
          client_tx_id: unbalancedClientTxId,
          result: "ERROR",
          message: "insert failed"
        }
      ]);

      const postingFailureAuditPayload = await readPostingHookFailureAuditPayload(db, unbalancedClientTxId);
      assert.notEqual(postingFailureAuditPayload, null);
      assert.equal(postingFailureAuditPayload.posting_mode, "active");
      assert.equal(postingFailureAuditPayload.balance_ok, false);
      assert.equal(postingFailureAuditPayload.journal_batch_id, null);
      assert.equal(typeof postingFailureAuditPayload.reason, "string");
      assert.equal(postingFailureAuditPayload.reason.length > 0, true);

      assert.deepEqual(await countSyncPushPersistedRows(db, unbalancedClientTxId), {
        tx_total: 0,
        item_total: 0,
        payment_total: 0
      });
      assert.deepEqual(await countSyncPushJournalRows(db, unbalancedClientTxId), {
        batch_total: 0,
        line_total: 0
      });
      assert.equal(await countAcceptedSyncPushEvents(db, unbalancedClientTxId), 0);
    } finally {
      await stopApiServer(childProcess);

      if (companyId > 0 && outletId > 0) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }

      if (createdFiscalYearId && Number(createdFiscalYearId) > 0) {
        await db.execute("DELETE FROM fiscal_years WHERE id = ?", [createdFiscalYearId]);
      }

      if (createdFiscalYearId && Number(createdFiscalYearId) > 0) {
        await db.execute("DELETE FROM fiscal_years WHERE id = ?", [createdFiscalYearId]);
      }

      
    }
  }
);

localServerTest(
  "sync push integration: dine-in metadata is persisted and reservation lifecycle is closed",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    const createdClientTxIds = [];
    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;
    let tableId = 0;
    let reservationId = 0;

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

      ownerUserId = Number(owner.id);
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);

      const tableCode = `ITBL${Date.now().toString(36)}`.slice(0, 12).toUpperCase();
      const [tableInsert] = await db.execute(
        `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
         VALUES (?, ?, ?, ?, ?, ?, 'RESERVED', 2)`,
        [companyId, outletId, tableCode, "Integration Table", "Main", 4]
      );
      tableId = Number(tableInsert.insertId);

      const reservationAt = new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 19).replace("T", " ");
      const [reservationInsert] = await db.execute(
        `INSERT INTO reservations (
           company_id,
           outlet_id,
           table_id,
           customer_name,
           customer_phone,
           guest_count,
           reservation_at,
           duration_minutes,
           status,
           status_id,
           notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SEATED', 4, ?)`,
        [companyId, outletId, tableId, "Integration Guest", "+620000000001", 4, reservationAt, 90, "Window side"]
      );
      reservationId = Number(reservationInsert.insertId);

      const baseUrl = testContext.baseUrl;
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const missingTableClientTxId = randomUUID();
      const missingTableResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...buildSyncTransaction({
                clientTxId: missingTableClientTxId,
                companyId,
                outletId,
                cashierUserId: ownerUserId,
                trxAt: new Date().toISOString()
              }),
              service_type: "DINE_IN",
              table_id: null,
              reservation_id: null,
              guest_count: 2,
              order_status: "READY_TO_PAY",
              opened_at: new Date(Date.now() - 5 * 60_000).toISOString(),
              closed_at: new Date().toISOString(),
              notes: "Missing table"
            }
          ]
        })
      });
      assert.equal(missingTableResponse.status, 200);
      const missingTableBody = await parseJsonResponse(missingTableResponse);
      assert.equal(missingTableBody.success, true);
      assert.deepEqual(missingTableBody.results, [
        {
          client_tx_id: missingTableClientTxId,
          result: "ERROR",
          message: "DINE_IN requires table_id"
        }
      ]);

      const dineInClientTxId = randomUUID();
      const openedAt = new Date(Date.now() - 10 * 60_000).toISOString();
      const closedAt = new Date().toISOString();
      const dineInResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...buildSyncTransaction({
                clientTxId: dineInClientTxId,
                companyId,
                outletId,
                cashierUserId: ownerUserId,
                trxAt: closedAt
              }),
              service_type: "DINE_IN",
              table_id: tableId,
              reservation_id: reservationId,
              guest_count: 4,
              order_status: "COMPLETED",
              opened_at: openedAt,
              closed_at: closedAt,
              notes: "Integration dine-in close"
            }
          ]
        })
      });
      assert.equal(dineInResponse.status, 200);
      const dineInBody = await parseJsonResponse(dineInResponse);
      assert.equal(dineInBody.success, true);
      assert.deepEqual(dineInBody.results, [
        {
          client_tx_id: dineInClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(dineInClientTxId);

      const [txRows] = await db.execute(
        `SELECT service_type, table_id, reservation_id, guest_count, order_status, notes,
                DATE_FORMAT(opened_at, '%Y-%m-%d %H:%i:%s') AS opened_at,
                DATE_FORMAT(closed_at, '%Y-%m-%d %H:%i:%s') AS closed_at
         FROM pos_transactions
         WHERE client_tx_id = ?
         LIMIT 1`,
        [dineInClientTxId]
      );
      assert.equal(txRows.length, 1);
      assert.equal(txRows[0].service_type, "DINE_IN");
      assert.equal(Number(txRows[0].table_id), tableId);
      assert.equal(Number(txRows[0].reservation_id), reservationId);
      assert.equal(Number(txRows[0].guest_count), 4);
      assert.equal(txRows[0].order_status, "COMPLETED");
      assert.equal(txRows[0].notes, "Integration dine-in close");
      assert.equal(txRows[0].opened_at, toMysqlDateTime(openedAt));
      assert.equal(txRows[0].closed_at, toMysqlDateTime(closedAt));

      const [reservationRows] = await db.execute(
        `SELECT status, linked_order_id
         FROM reservations
         WHERE company_id = ? AND outlet_id = ? AND id = ?
         LIMIT 1`,
        [companyId, outletId, reservationId]
      );
      assert.equal(reservationRows.length, 1);
      assert.equal(reservationRows[0].status, "COMPLETED");
      assert.equal(reservationRows[0].linked_order_id, dineInClientTxId);

      const [tableRows] = await db.execute(
        `SELECT status
         FROM outlet_tables
         WHERE company_id = ? AND outlet_id = ? AND id = ?
         LIMIT 1`,
        [companyId, outletId, tableId]
      );
      assert.equal(tableRows.length, 1);
      assert.equal(tableRows[0].status, "AVAILABLE");
    } finally {
      for (const clientTxId of createdClientTxIds) {
        await cleanupSyncPushPersistedArtifacts(db, clientTxId);
      }

      if (reservationId > 0) {
        await db.execute(
          `DELETE FROM reservations
           WHERE company_id = ? AND outlet_id = ? AND id = ?`,
          [companyId, outletId, reservationId]
        );
      }

      if (tableId > 0) {
        await db.execute(
          `DELETE FROM outlet_tables
           WHERE company_id = ? AND outlet_id = ? AND id = ?`,
          [companyId, outletId, tableId]
        );
      }
    }
  }
);

// ============================================================================
// Scope C COGS Integration Tests
// ============================================================================

localServerTest(
  "sync push integration: Scope C - active + cogs_enabled with tracked item",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    const createdClientTxIds = [];
    const createdItemIds = [];
    let postingFixture = null;
    let companyId = 0;
    let outletId = 0;

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
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);

      // Setup COGS accounts and enable feature
      await setupCogsAccounts(db, companyId);
      await enableCogsFeature(db, companyId);
      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);

      // Create tracked item with cost basis
      const trackedItemId = await setupTrackedItemWithCost(db, companyId, outletId, "happy");
      createdItemIds.push(trackedItemId);

      // Record initial stock
      const initialStock = await getProductStockQuantity(db, companyId, outletId, trackedItemId);
      assert.equal(initialStock, 100);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        enableSyncPushTestHooks: true,
        envOverrides: { [SYNC_PUSH_POSTING_MODE_ENV]: "active" }
      });
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const clientTxId = randomUUID();
      const trxAt = new Date().toISOString();

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransactionWithItems({
              clientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt,
              items: [{ itemId: trackedItemId, qty: 5, price: 15000, name: "COGS Test Item" }]
            })
          ]
        })
      });

      assert.equal(response.status, 200);
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);
      assert.deepEqual(body.results, [{ client_tx_id: clientTxId, result: "OK" }]);
      createdClientTxIds.push(clientTxId);

      // Verify stock reduced
      const finalStock = await getProductStockQuantity(db, companyId, outletId, trackedItemId);
      assert.equal(finalStock, 95, "Stock should be reduced by 5");

      // Verify inventory transactions created
      const invTxs = await getInventoryTransactions(db, clientTxId);
      assert.equal(invTxs.length, 1, "Should have one inventory transaction");
      assert.equal(invTxs[0].transaction_type, 1, "Should be SALE type"); // SALE = 1
      assert.equal(Number(invTxs[0].quantity_delta), -5, "Should deduct 5 qty");
      assert.ok(invTxs[0].journal_batch_id, "Inventory tx should be linked to COGS journal batch");

      // Verify cost consumption
      const consumption = await getCostLayerConsumption(db, invTxs[0].id);
      assert.ok(consumption.length > 0, "Should have cost layer consumption");

      // Verify COGS journal created
      const cogsRows = await countCogsJournalRows(db, clientTxId);
      assert.equal(cogsRows.batch_total, 1, "Should have one COGS batch");
      assert.ok(cogsRows.line_total >= 2, "Should have COGS journal lines (debit + credit)");

      // Verify COGS journal is balanced
      const balanceCheck = await verifyCogsJournalBalance(db, clientTxId);
      assert.equal(balanceCheck.balanced, true, "COGS journal should be balanced");

      // Verify POS persisted
      const persisted = await countSyncPushPersistedRows(db, clientTxId);
      assert.equal(persisted.tx_total, 1);
      assert.equal(persisted.item_total, 1);

      // Verify revenue journal also created
      const journalRows = await countSyncPushJournalRows(db, clientTxId);
      assert.equal(journalRows.batch_total, 1, "Should have revenue journal batch");
    } finally {
      await stopApiServer(childProcess);

      // Cleanup in reverse order
      for (const clientTxId of createdClientTxIds) {
        await cleanupInventoryAndCostArtifacts(db, clientTxId);
        await cleanupSyncPushPersistedArtifacts(db, clientTxId);
      }

      if (postingFixture) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }

      await cleanupCogsAccounts(db, companyId);
      await disableCogsFeature(db, companyId);
      await cleanupTrackedItems(db, companyId, createdItemIds);
    }
  }
);

localServerTest(
  "sync push integration: Scope C - shadow mode still deducts stock and cost",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    const createdClientTxIds = [];
    const createdItemIds = [];
    let postingFixture = null;
    let companyId = 0;
    let outletId = 0;

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
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);

      // Setup COGS accounts and enable feature
      await setupCogsAccounts(db, companyId);
      await enableCogsFeature(db, companyId);
      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);

      // Create tracked item with cost basis
      const trackedItemId = await setupTrackedItemWithCost(db, companyId, outletId, "shadow");
      createdItemIds.push(trackedItemId);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        enableSyncPushTestHooks: true,
        envOverrides: { [SYNC_PUSH_POSTING_MODE_ENV]: "shadow" }
      });
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const clientTxId = randomUUID();
      const trxAt = new Date().toISOString();

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransactionWithItems({
              clientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt,
              items: [{ itemId: trackedItemId, qty: 3, price: 15000, name: "COGS Test Item" }]
            })
          ]
        })
      });

      assert.equal(response.status, 200);
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);
      createdClientTxIds.push(clientTxId);

      // Verify stock reduced (stock+cost still work in shadow mode)
      const finalStock = await getProductStockQuantity(db, companyId, outletId, trackedItemId);
      assert.equal(finalStock, 97, "Stock should be reduced by 3 even in shadow mode");

      // Verify inventory transactions created
      const invTxs = await getInventoryTransactions(db, clientTxId);
      assert.equal(invTxs.length, 1, "Should have inventory transaction in shadow mode");

      // Verify cost consumption occurred
      const consumption = await getCostLayerConsumption(db, invTxs[0].id);
      assert.ok(consumption.length > 0, "Should consume cost in shadow mode");

      // Verify NO COGS journal (posting mode is shadow)
      const cogsRows = await countCogsJournalRows(db, clientTxId);
      assert.equal(cogsRows.batch_total, 0, "Should NOT have COGS batch in shadow mode");
      assert.equal(cogsRows.line_total, 0, "Should NOT have COGS lines in shadow mode");

      // POS should still be persisted
      const persisted = await countSyncPushPersistedRows(db, clientTxId);
      assert.equal(persisted.tx_total, 1);
    } finally {
      await stopApiServer(childProcess);

      for (const clientTxId of createdClientTxIds) {
        await cleanupInventoryAndCostArtifacts(db, clientTxId);
        await cleanupSyncPushPersistedArtifacts(db, clientTxId);
      }

      if (postingFixture) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }

      await cleanupCogsAccounts(db, companyId);
      await disableCogsFeature(db, companyId);
      await cleanupTrackedItems(db, companyId, createdItemIds);
    }
  }
);

// ===========================================================================
// Story 17.1: Order Update Authority Semantics - Route-Level Tests
// ===========================================================================

localServerTest(
  "sync push integration: order_updates event_at is client-authoritative, created_at_ts is server-authoritative (Story 17.1)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const updateId = randomUUID();

      // Use a specific client event_at that is DIFFERENT from server time
      // Client says the event happened at a specific time in the past
      const clientEventAt = "2026-03-15T10:30:00.000Z"; // Client says event happened at 10:30 UTC
      const clientCreatedAt = "2026-03-15T10:31:00.000Z"; // Client sends different created_at (should be ignored)
      const beforeServerTime = Date.now();

      const payload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "DINE_IN",
            source_flow: "WALK_IN",
            settlement_flow: "DEFERRED",
            table_id: null,
            reservation_id: null,
            guest_count: 2,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: clientEventAt,
            closed_at: null,
            notes: "authority-test-order",
            updated_at: clientEventAt,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 12500,
                qty: 1,
                discount_amount: 0,
                updated_at: clientEventAt
              }
            ]
          }
        ],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_CANCELLED",
            delta_json: JSON.stringify({ reason: "authority-test", cancelled_qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: clientEventAt,
            created_at: clientCreatedAt  // This should be IGNORED by server
          }
        ]
      };

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);
      assert.deepEqual(body.data.order_update_results, [
        {
          update_id: updateId,
          result: "OK"
        }
      ]);

      // Verify persisted DB values for the order update
      const [updateRows] = await db.execute(
        `SELECT event_at, event_at_ts, created_at, created_at_ts
         FROM pos_order_updates
         WHERE update_id = ?
         LIMIT 1`,
        [updateId]
      );
      assert.equal(updateRows.length, 1, "Should find the persisted order update");

      const persistedUpdate = updateRows[0];

      // AC1: event_at/event_at_ts should be PRESERVED from client payload (client-authoritative)
      // Client said event happened at 2026-03-15T10:30:00.000Z
      const expectedEventAtMysql = "2026-03-15 10:30:00";
      const expectedEventAtTs = new Date(clientEventAt).getTime();
      assert.equal(
        String(persistedUpdate.event_at),
        expectedEventAtMysql,
        "event_at should be preserved from client payload (client-authoritative)"
      );
      assert.equal(
        Number(persistedUpdate.event_at_ts),
        expectedEventAtTs,
        "event_at_ts should match client event_at timestamp (client-authoritative)"
      );

      // AC2 & AC3: created_at_ts should be SERVER-generated, NOT from client payload
      const afterServerTime = Date.now();
      const persistedCreatedAtTs = Number(persistedUpdate.created_at_ts);

      // created_at_ts must be within the server-ingest window (between beforeServerTime and afterServerTime, with some tolerance)
      assert.ok(
        persistedCreatedAtTs >= beforeServerTime - 100, // 100ms tolerance
        `created_at_ts (${persistedCreatedAtTs}) should be >= server time before request (${beforeServerTime})`
      );
      assert.ok(
        persistedCreatedAtTs <= afterServerTime + 100, // 100ms tolerance
        `created_at_ts (${persistedCreatedAtTs}) should be <= server time after request (${afterServerTime})`
      );

      // Key assertion: created_at_ts should NOT equal the client's created_at_ts
      // Client sent created_at of 2026-03-15T10:31:00.000Z (which would be a different timestamp)
      const clientCreatedAtTs = new Date(clientCreatedAt).getTime();
      assert.notEqual(
        persistedCreatedAtTs,
        clientCreatedAtTs,
        "created_at_ts should NOT equal client's created_at - server must generate its own"
      );

      // Verify created_at (MySQL datetime format) is also server-generated
      const persistedCreatedAt = String(persistedUpdate.created_at);
      // Should be in MySQL datetime format YYYY-MM-DD HH:mm:ss
      assert.ok(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(persistedCreatedAt),
        "created_at should be in MySQL datetime format"
      );
      // The date should be today (server's current date), not the client's past date
      const today = new Date().toISOString().slice(0, 10);
      assert.ok(
        persistedCreatedAt.startsWith(today),
        `created_at (${persistedCreatedAt}) should be from today (${today}) - server-generated, not client-provided ${clientCreatedAt}`
      );

      // Cleanup will happen in finally block via cleanupOrderSyncArtifacts
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

localServerTest(
  "sync push integration: order_updates malformed event_at is rejected at schema level (Story 17.1)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const orderId = randomUUID();
      const updateId = randomUUID();

      // Test case 1: Malformed event_at - rolled date (Feb 30 doesn't exist)
      const rolledDatePayload = {
        outlet_id: outletId,
        transactions: [],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_CANCELLED",
            delta_json: "{}",
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: "2026-02-30T10:30:00Z",  // Invalid: Feb 30 doesn't exist
            created_at: new Date().toISOString()
          }
        ]
      };

      const rolledDateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(rolledDatePayload)
      });

      // Schema validation should reject this at Zod level before even reaching business logic
      assert.equal(rolledDateResponse.status, 400, "Should reject malformed event_at with 400");

      // Test case 2: Completely invalid format
      const invalidFormatPayload = {
        outlet_id: outletId,
        transactions: [],
        order_updates: [
          {
            update_id: randomUUID(),
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_CANCELLED",
            delta_json: "{}",
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: "not-a-valid-datetime",  // Invalid format
            created_at: new Date().toISOString()
          }
        ]
      };

      const invalidFormatResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(invalidFormatPayload)
      });

      assert.equal(invalidFormatResponse.status, 400, "Should reject invalid event_at format with 400");

      // Test case 3: Missing timezone offset (naive datetime)
      const naiveDatetimePayload = {
        outlet_id: outletId,
        transactions: [],
        order_updates: [
          {
            update_id: randomUUID(),
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_CANCELLED",
            delta_json: "{}",
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: "2026-03-15T10:30:00",  // Missing Z or offset
            created_at: new Date().toISOString()
          }
        ]
      };

      const naiveDatetimeResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(naiveDatetimePayload)
      });

      // Schema requires offset (Z or ±HH:MM), so naive datetime should be rejected
      assert.equal(naiveDatetimeResponse.status, 400, "Should reject naive datetime without timezone offset");
    } finally {
      await stopApiServer(childProcess);
    }
  }
);

localServerTest(
  "sync push integration: item_cancellations authority semantics - cancelled_at client, created_at server (Story 17.1)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_item_cancellations"))) {
      t.skip("pos_item_cancellations table not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const updateId = randomUUID();
      const cancellationId = randomUUID();

      // Client says cancellation happened at a specific past time
      const clientCancelledAt = "2026-03-15T14:45:00.000+07:00"; // Client's local time
      const beforeServerTime = Date.now();

      const payload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: new Date().toISOString(),
            closed_at: null,
            notes: "authority-test-cancellation",
            updated_at: new Date().toISOString(),
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 2,
                discount_amount: 0,
                updated_at: new Date().toISOString()
              }
            ]
          }
        ],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_CANCELLED",
            delta_json: "{}",
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
        ],
        item_cancellations: [
          {
            cancellation_id: cancellationId,
            update_id: updateId,
            order_id: orderId,
            item_id: 1,
            company_id: companyId,
            outlet_id: outletId,
            cancelled_quantity: 1,
            reason: "authority-test",
            cancelled_by_user_id: ownerUserId,
            cancelled_at: clientCancelledAt  // Client says cancellation happened at this time
          }
        ]
      };

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);
      assert.deepEqual(body.data.item_cancellation_results, [
        {
          cancellation_id: cancellationId,
          result: "OK"
        }
      ]);

      // Verify persisted DB values for the item cancellation
      const [cancellationRows] = await db.execute(
        `SELECT cancelled_at, cancelled_at_ts, created_at, created_at_ts
         FROM pos_item_cancellations
         WHERE cancellation_id = ?
         LIMIT 1`,
        [cancellationId]
      );
      assert.equal(cancellationRows.length, 1, "Should find the persisted item cancellation");

      const persistedCancellation = cancellationRows[0];

      // cancelled_at/cancelled_at_ts should be PRESERVED from client payload (client-authoritative)
      const expectedCancelledAtMysql = "2026-03-15 07:45:00"; // 14:45+07:00 converted to UTC
      const expectedCancelledAtTs = new Date(clientCancelledAt).getTime();
      assert.equal(
        String(persistedCancellation.cancelled_at),
        expectedCancelledAtMysql,
        "cancelled_at should be preserved from client payload (client-authoritative)"
      );
      assert.equal(
        Number(persistedCancellation.cancelled_at_ts),
        expectedCancelledAtTs,
        "cancelled_at_ts should match client cancelled_at timestamp"
      );

      // created_at_ts should be SERVER-generated
      const afterServerTime = Date.now();
      const persistedCreatedAtTs = Number(persistedCancellation.created_at_ts);

      // created_at_ts must be within the server-ingest window
      assert.ok(
        persistedCreatedAtTs >= beforeServerTime - 100,
        `created_at_ts (${persistedCreatedAtTs}) should be >= server time before request`
      );
      assert.ok(
        persistedCreatedAtTs <= afterServerTime + 100,
        `created_at_ts (${persistedCreatedAtTs}) should be <= server time after request`
      );

      // created_at_ts should NOT equal client's cancelled_at_ts
      assert.notEqual(
        persistedCreatedAtTs,
        expectedCancelledAtTs,
        "created_at_ts should NOT equal client's cancelled_at_ts - server generates its own"
      );
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

localServerTest(
  "sync push integration: order_updates idempotency preserved with authority semantics (Story 17.1)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const updateId = randomUUID();
      const eventAt = "2026-03-20T09:00:00.000Z";

      const payload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: eventAt,
            closed_at: null,
            notes: "idempotency-test",
            updated_at: eventAt,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 1,
                discount_amount: 0,
                updated_at: eventAt
              }
            ]
          }
        ],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_CANCELLED",
            delta_json: "{}",
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: eventAt,
            created_at: eventAt
          }
        ]
      };

      // First push - should succeed
      const firstResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      assert.equal(firstResponse.status, 200);
      const firstBody = await parseJsonResponse(firstResponse);
      assert.equal(firstBody.success, true);
      assert.deepEqual(firstBody.data.order_update_results, [
        {
          update_id: updateId,
          result: "OK"
        }
      ]);

      // Second push with same update_id - should be DUPLICATE (idempotency preserved)
      const secondResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      assert.equal(secondResponse.status, 200);
      const secondBody = await parseJsonResponse(secondResponse);
      assert.equal(secondBody.success, true);
      assert.deepEqual(secondBody.data.order_update_results, [
        {
          update_id: updateId,
          result: "DUPLICATE"
        }
      ]);

      // Verify only ONE row exists (no duplicate created)
      const [countRows] = await db.execute(
        `SELECT COUNT(*) as cnt FROM pos_order_updates WHERE update_id = ?`,
        [updateId]
      );
      assert.equal(Number(countRows[0].cnt), 1, "Should only have one order update (idempotency)");
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

// Story 17.2: base_order_updated_at_ts as Version Marker Metadata - Route-Level Tests
// Note: True optimistic-concurrency stale detection requires an authoritative server-side order version,
// which does not currently exist in the codebase. base_order_updated_at_ts is preserved as metadata only.
// ===========================================================================

localServerTest(
  "sync push integration: order_updates base_order_updated_at_ts is preserved as metadata, not as event/business time (Story 17.2)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const updateId = randomUUID();

      // Create order snapshot and send order update with different timestamps
      const eventAt = "2026-03-20T10:00:00.000Z";
      const baseOrderUpdatedAt = "2026-03-20T09:55:00.000Z"; // Different from event_at - proves base is metadata

      const payload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: eventAt,
            closed_at: null,
            notes: "metadata-test",
            updated_at: baseOrderUpdatedAt,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 1,
                discount_amount: 0,
                updated_at: baseOrderUpdatedAt
              }
            ]
          }
        ],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: baseOrderUpdatedAt,
            event_type: "ITEM_ADDED",
            delta_json: JSON.stringify({ item_id: 2, qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: eventAt,
            created_at: eventAt
          }
        ]
      };

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);
      assert.deepEqual(body.data.order_update_results, [
        {
          update_id: updateId,
          result: "OK"
        }
      ]);

      // Verify base_order_updated_at_ts is stored as a positive timestamp (preserved metadata)
      const [baseRows] = await db.execute(
        `SELECT base_order_updated_at_ts, event_at_ts, created_at_ts
         FROM pos_order_updates
         WHERE update_id = ?
         LIMIT 1`,
        [updateId]
      );
      assert.ok(baseRows.length > 0, "Should have stored the order update");

      const expectedBaseTs = new Date(baseOrderUpdatedAt).getTime();
      assert.equal(
        Number(baseRows[0].base_order_updated_at_ts),
        expectedBaseTs,
        "base_order_updated_at_ts should be preserved from client payload"
      );

      // Prove base_order_updated_at_ts is NOT the same as event_at_ts (different semantic meaning)
      const expectedEventAtTs = new Date(eventAt).getTime();
      assert.notEqual(
        Number(baseRows[0].base_order_updated_at_ts),
        Number(baseRows[0].event_at_ts),
        "base_order_updated_at_ts should be different from event_at_ts - they have different semantics"
      );

      // Prove base_order_updated_at_ts is NOT the same as created_at_ts (different semantic meaning)
      assert.notEqual(
        Number(baseRows[0].base_order_updated_at_ts),
        Number(baseRows[0].created_at_ts),
        "base_order_updated_at_ts should be different from created_at_ts - they have different semantics"
      );
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

localServerTest(
  "sync push integration: order_updates null base_order_updated_at is stored as null (Story 17.2)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const updateId = randomUUID();
      const eventAt = "2026-03-20T10:00:00.000Z";

      // First: create an active order snapshot
      const firstPayload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: eventAt,
            closed_at: null,
            notes: "null-base-test",
            updated_at: eventAt,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 1,
                discount_amount: 0,
                updated_at: eventAt
              }
            ]
          }
        ],
        order_updates: []
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

      // Send an order update with null base_order_updated_at
      const updatePayload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_ADDED",
            delta_json: JSON.stringify({ item_id: 2, qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: eventAt,
            created_at: eventAt
          }
        ]
      };

      const updateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });
      assert.equal(updateResponse.status, 200);
      const updateBody = await parseJsonResponse(updateResponse);
      assert.equal(updateBody.success, true);
      assert.deepEqual(updateBody.data.order_update_results, [
        {
          update_id: updateId,
          result: "OK"
        }
      ]);

      // Verify base_order_updated_at_ts was stored as null
      const [baseRows] = await db.execute(
        `SELECT base_order_updated_at_ts FROM pos_order_updates WHERE update_id = ?`,
        [updateId]
      );
      assert.ok(baseRows.length > 0, "Should have stored the order update");
      assert.equal(baseRows[0].base_order_updated_at_ts, null, "base_order_updated_at_ts should be NULL");
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

localServerTest(
  "sync push integration: order_updates idempotency via update_id still works with base_order_updated_at (Story 17.2)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const updateId = randomUUID();
      const eventAt = "2026-03-20T10:00:00.000Z";
      const baseOrderUpdatedAt = "2026-03-20T09:55:00.000Z";

      // First: create an active order snapshot
      const firstPayload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: eventAt,
            closed_at: null,
            notes: "idempotency-test",
            updated_at: eventAt,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 1,
                discount_amount: 0,
                updated_at: eventAt
              }
            ]
          }
        ],
        order_updates: []
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

      // Send an order update with base_order_updated_at
      const updatePayload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: baseOrderUpdatedAt,
            event_type: "ITEM_ADDED",
            delta_json: JSON.stringify({ item_id: 2, qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: eventAt,
            created_at: eventAt
          }
        ]
      };

      // First attempt - should succeed
      const firstUpdateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });
      assert.equal(firstUpdateResponse.status, 200);
      const firstUpdateBody = await parseJsonResponse(firstUpdateResponse);
      assert.equal(firstUpdateBody.success, true);
      assert.deepEqual(firstUpdateBody.data.order_update_results, [
        {
          update_id: updateId,
          result: "OK"
        }
      ]);

      // Retry with same update_id - should be DUPLICATE (idempotency preserved)
      const retryResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });
      assert.equal(retryResponse.status, 200);
      const retryBody = await parseJsonResponse(retryResponse);
      assert.equal(retryBody.success, true);
      assert.deepEqual(retryBody.data.order_update_results, [
        {
          update_id: updateId,
          result: "DUPLICATE"
        }
      ]);

      // Verify only ONE row exists (no duplicate created)
      const [countRows] = await db.execute(
        `SELECT COUNT(*) as cnt FROM pos_order_updates WHERE update_id = ?`,
        [updateId]
      );
      assert.equal(Number(countRows[0].cnt), 1, "Should only have one order update (idempotency)");

      // Verify base_order_updated_at_ts was correctly stored
      const [baseRows] = await db.execute(
        `SELECT base_order_updated_at_ts FROM pos_order_updates WHERE update_id = ?`,
        [updateId]
      );
      assert.ok(baseRows.length > 0, "Should have stored base_order_updated_at_ts");
      const expectedBaseTs = new Date(baseOrderUpdatedAt).getTime();
      assert.equal(
        Number(baseRows[0].base_order_updated_at_ts),
        expectedBaseTs,
        "base_order_updated_at_ts should be correctly stored"
      );
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

localServerTest(
  "sync push integration: order_updates multiple base versions stored without OCC rejection (Story 17.2)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const baseEventAt = "2026-03-20T10:00:00.000Z";

      // First: create an active order snapshot
      const firstPayload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: baseEventAt,
            closed_at: null,
            notes: "multi-base-test",
            updated_at: baseEventAt,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 1,
                discount_amount: 0,
                updated_at: baseEventAt
              }
            ]
          }
        ],
        order_updates: []
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

      // Send multiple updates with different base versions - ALL should be accepted (no OCC rejection)
      const updateId1 = randomUUID();
      const updateId2 = randomUUID();
      const updateId3 = randomUUID();

      const earlierBase = "2026-03-20T09:55:00.000Z"; // Earlier than snapshot updated_at
      const sameBase = baseEventAt; // Same as snapshot updated_at
      const laterBase = "2026-03-20T10:05:00.000Z"; // Later than snapshot updated_at

      const updatePayload1 = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [],
        order_updates: [
          {
            update_id: updateId1,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: earlierBase,
            event_type: "ITEM_ADDED",
            delta_json: JSON.stringify({ item_id: 2, qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: "2026-03-20T10:01:00.000Z",
            created_at: "2026-03-20T10:01:00.000Z"
          }
        ]
      };

      const updatePayload2 = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [],
        order_updates: [
          {
            update_id: updateId2,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: sameBase,
            event_type: "ITEM_ADDED",
            delta_json: JSON.stringify({ item_id: 3, qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: "2026-03-20T10:02:00.000Z",
            created_at: "2026-03-20T10:02:00.000Z"
          }
        ]
      };

      const updatePayload3 = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [],
        order_updates: [
          {
            update_id: updateId3,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: laterBase,
            event_type: "ITEM_ADDED",
            delta_json: JSON.stringify({ item_id: 4, qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: "2026-03-20T10:06:00.000Z",
            created_at: "2026-03-20T10:06:00.000Z"
          }
        ]
      };

      // All three updates should be accepted (no OCC rejection - no authoritative server version exists)
      const response1 = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(updatePayload1)
      });
      assert.equal(response1.status, 200);
      const body1 = await parseJsonResponse(response1);
      assert.equal(body1.success, true);
      assert.deepEqual(body1.data.order_update_results, [{ update_id: updateId1, result: "OK" }]);

      const response2 = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(updatePayload2)
      });
      assert.equal(response2.status, 200);
      const body2 = await parseJsonResponse(response2);
      assert.equal(body2.success, true);
      assert.deepEqual(body2.data.order_update_results, [{ update_id: updateId2, result: "OK" }]);

      const response3 = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(updatePayload3)
      });
      assert.equal(response3.status, 200);
      const body3 = await parseJsonResponse(response3);
      assert.equal(body3.success, true);
      assert.deepEqual(body3.data.order_update_results, [{ update_id: updateId3, result: "OK" }]);

      // Verify all three updates were persisted with their respective base_order_updated_at_ts values
      const [countRows] = await db.execute(
        `SELECT COUNT(*) as cnt FROM pos_order_updates WHERE order_id = ?`,
        [orderId]
      );
      assert.equal(Number(countRows[0].cnt), 3, "All three updates should be persisted (no OCC rejection)");

      const [baseRows] = await db.execute(
        `SELECT update_id, base_order_updated_at_ts
         FROM pos_order_updates
         WHERE order_id = ?
         ORDER BY base_order_updated_at_ts ASC`,
        [orderId]
      );

      assert.equal(baseRows.length, 3);
      assert.equal(Number(baseRows[0].base_order_updated_at_ts), new Date(earlierBase).getTime());
      assert.equal(Number(baseRows[1].base_order_updated_at_ts), new Date(sameBase).getTime());
      assert.equal(Number(baseRows[2].base_order_updated_at_ts), new Date(laterBase).getTime());
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

// ===========================================================================
// Story 17.1 Correction: Missing client created_at is accepted (contract fix)
// ===========================================================================

localServerTest(
  "sync push integration: order_updates missing client created_at is accepted - server generates ingest time (Story 17.1 Contract Fix)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;
    let orderId = "";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      orderId = randomUUID();
      const updateId = randomUUID();

      // Payload WITHOUT created_at field - proves contract is now optional
      const clientEventAt = "2026-03-25T10:00:00.000Z";
      const beforeServerTime = Date.now();

      const payloadWithoutCreatedAt = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: true,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: clientEventAt,
            closed_at: null,
            notes: "contract-test-no-created-at",
            updated_at: clientEventAt,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 1,
                discount_amount: 0,
                updated_at: clientEventAt
              }
            ]
          }
        ],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_ADDED",
            delta_json: JSON.stringify({ item_id: 1, qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: clientEventAt
            // NOTE: created_at is intentionally OMITTED to prove:
            // 1. Schema now accepts order_updates without created_at
            // 2. Server generates created_at_ts server-side regardless
          }
        ]
      };

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payloadWithoutCreatedAt)
      });

      // Should succeed - missing created_at is now accepted
      assert.equal(response.status, 200, "Missing created_at should be accepted");
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true, "Response should indicate success");
      assert.deepEqual(body.data.order_update_results, [
        {
          update_id: updateId,
          result: "OK"
        }
      ]);

      // Verify the order update was persisted
      const afterServerTime = Date.now();
      const [updateRows] = await db.execute(
        `SELECT event_at, event_at_ts, created_at, created_at_ts
         FROM pos_order_updates
         WHERE update_id = ?
         LIMIT 1`,
        [updateId]
      );
      assert.equal(updateRows.length, 1, "Should find the persisted order update");

      const persistedUpdate = updateRows[0];

      // AC1: event_at/event_at_ts should be PRESERVED from client payload (client-authoritative)
      const expectedEventAtMysql = "2026-03-25 10:00:00";
      const expectedEventAtTs = new Date(clientEventAt).getTime();
      assert.equal(
        String(persistedUpdate.event_at),
        expectedEventAtMysql,
        "event_at should be preserved from client payload even when created_at is omitted"
      );
      assert.equal(
        Number(persistedUpdate.event_at_ts),
        expectedEventAtTs,
        "event_at_ts should match client event_at even when created_at is omitted"
      );

      // AC2: created_at_ts should be SERVER-generated, NOT dependent on client's created_at
      const persistedCreatedAtTs = Number(persistedUpdate.created_at_ts);
      assert.ok(
        persistedCreatedAtTs >= beforeServerTime - 100,
        `created_at_ts (${persistedCreatedAtTs}) should be >= server time before request (${beforeServerTime})`
      );
      assert.ok(
        persistedCreatedAtTs <= afterServerTime + 100,
        `created_at_ts (${persistedCreatedAtTs}) should be <= server time after request (${afterServerTime})`
      );

      // Key proof: created_at_ts should NOT equal the client's event_at_ts
      // (Because created_at_ts is server ingest time, not the event time)
      assert.notEqual(
        persistedCreatedAtTs,
        expectedEventAtTs,
        "created_at_ts should NOT equal event_at_ts - they have different authority semantics"
      );

      // Verify created_at (MySQL datetime) is also server-generated
      const persistedCreatedAt = String(persistedUpdate.created_at);
      assert.ok(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(persistedCreatedAt),
        "created_at should be in MySQL datetime format"
      );
      // The date should be today (server's current date)
      const today = new Date().toISOString().slice(0, 10);
      assert.ok(
        persistedCreatedAt.startsWith(today),
        `created_at (${persistedCreatedAt}) should be from today (${today}) - server-generated`
      );
    } finally {
      await stopApiServer(childProcess);

      if (orderId) {
        await cleanupOrderSyncArtifacts(db, orderId);
      }
    }
  }
);

localServerTest(
  "sync push integration: order_updates malformed created_at is ignored, event_at validation still enforced (Story 17.1 Contract Fix)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    if (!(await hasTable(db, "pos_order_updates"))) {
      t.skip("pos_order_updates table not available in current DB");
      return;
    }

    let childProcess;

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const orderId = randomUUID();
      const updateId = randomUUID();

      // Payload with MALFORMED created_at but VALID event_at
      // The malformed created_at should be IGNORED, but valid event_at should be accepted
      // Need to include active_orders first to create the order snapshot (FK constraint)
      const clientEventAt = "2026-03-25T11:00:00.000Z";
      const payloadWithMalformedCreatedAt = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: false,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: clientEventAt,
            closed_at: null,
            notes: "malformed-created-at-test",
            updated_at: clientEventAt,
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 1,
                discount_amount: 0,
                updated_at: clientEventAt
              }
            ]
          }
        ],
        order_updates: [
          {
            update_id: updateId,
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_ADDED",
            delta_json: JSON.stringify({ item_id: 1, qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: clientEventAt,  // Valid event_at - should be accepted
            created_at: "not-a-valid-datetime"  // Malformed - should be IGNORED by server
          }
        ]
      };

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payloadWithMalformedCreatedAt)
      });

      // Should succeed because:
      // 1. event_at is valid and will be used (client-authoritative)
      // 2. created_at is malformed but will be IGNORED (server generates its own)
      assert.equal(response.status, 200, "Malformed created_at should be ignored, request should succeed");
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);
      assert.deepEqual(body.data.order_update_results, [
        {
          update_id: updateId,
          result: "OK"
        }
      ]);

      // Verify the order update was persisted with correct event_at
      const [updateRows] = await db.execute(
        `SELECT event_at, event_at_ts, created_at, created_at_ts
         FROM pos_order_updates
         WHERE update_id = ?
         LIMIT 1`,
        [updateId]
      );
      assert.equal(updateRows.length, 1, "Should find the persisted order update");

      const persistedUpdate = updateRows[0];

      // event_at should be correctly persisted (client-authoritative)
      assert.equal(
        String(persistedUpdate.event_at),
        "2026-03-25 11:00:00",
        "event_at should be correctly persisted"
      );

      // created_at_ts should still be server-generated (not from malformed client input)
      const persistedCreatedAtTs = Number(persistedUpdate.created_at_ts);
      assert.ok(
        persistedCreatedAtTs >= Date.now() - 5000, // Within last 5 seconds
        "created_at_ts should be server-generated"
      );

      // Cleanup
      await db.execute("DELETE FROM pos_order_updates WHERE update_id = ?", [updateId]);
      await db.execute("DELETE FROM pos_order_snapshots WHERE order_id = ?", [orderId]);
    } finally {
      await stopApiServer(childProcess);
    }
  }
);

// ===========================================================================
// Story 17.3: Snapshot and Cancellation Timestamp Semantics Tests
// These tests exercise the REAL write paths through POST /sync/push
// ===========================================================================

localServerTest(
  "sync push integration: active_orders created_at_ts is server-ingest, not client updated_at_ts (Story 17.3)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const orderId = randomUUID();
      const clientUpdatedAt = "2026-03-20T10:00:00.000Z"; // Client says snapshot was generated at 10:00
      const beforeServerTime = Date.now();

      // Send active_orders through the REAL endpoint (POST /sync/push)
      const payload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [
          {
            order_id: orderId,
            company_id: companyId,
            outlet_id: outletId,
            service_type: "TAKEAWAY",
            source_flow: "WALK_IN",
            settlement_flow: "IMMEDIATE",
            table_id: null,
            reservation_id: null,
            guest_count: 1,
            is_finalized: false,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: "2026-03-20T09:00:00.000Z", // Client says order opened at 09:00
            closed_at: null,
            notes: "Story 17.3 snapshot test",
            updated_at: clientUpdatedAt, // Client says snapshot was generated at 10:00
            lines: [
              {
                item_id: 1,
                sku_snapshot: null,
                name_snapshot: "Test Item",
                item_type_snapshot: "PRODUCT",
                unit_price_snapshot: 10000,
                qty: 1,
                discount_amount: 0,
                updated_at: clientUpdatedAt // Client says line updated at 10:00
              }
            ]
          }
        ],
        order_updates: [],
        item_cancellations: []
      };

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);

      const afterServerTime = Date.now();

      // Verify pos_order_snapshots timestamps through REAL implementation path
      const [snapshotRows] = await db.execute(
        `SELECT opened_at_ts, closed_at_ts, updated_at_ts, created_at_ts
         FROM pos_order_snapshots
         WHERE order_id = ?
         LIMIT 1`,
        [orderId]
      );
      assert.equal(snapshotRows.length, 1, "Should find persisted snapshot");

      const persistedSnapshot = snapshotRows[0];

      // AC1: opened_at_ts, updated_at_ts are CLIENT-AUTHORITATIVE (preserved from payload)
      const expectedOpenedAtTs = new Date("2026-03-20T09:00:00.000Z").getTime();
      assert.ok(
        Math.abs(Number(persistedSnapshot.opened_at_ts) - expectedOpenedAtTs) < 1000,
        `opened_at_ts should preserve client-authored state-transition time (expected ~${expectedOpenedAtTs}, got ${persistedSnapshot.opened_at_ts})`
      );

      const expectedUpdatedAtTs = new Date(clientUpdatedAt).getTime();
      assert.ok(
        Math.abs(Number(persistedSnapshot.updated_at_ts) - expectedUpdatedAtTs) < 1000,
        `updated_at_ts should preserve client-authored snapshot freshness (expected ~${expectedUpdatedAtTs}, got ${persistedSnapshot.updated_at_ts})`
      );

      // AC3: created_at_ts is SERVER-INGEST TIME (distinct from updated_at_ts)
      // It should NOT equal updated_at_ts - that's the whole point of Story 17.3
      const persistedCreatedAtTs = Number(persistedSnapshot.created_at_ts);
      assert.ok(
        persistedCreatedAtTs >= beforeServerTime - 100,
        `created_at_ts (${persistedCreatedAtTs}) should be >= server time before request (${beforeServerTime - 100})`
      );
      assert.ok(
        persistedCreatedAtTs <= afterServerTime + 100,
        `created_at_ts (${persistedCreatedAtTs}) should be <= server time after request (${afterServerTime + 100})`
      );

      // KEY ASSERTION: created_at_ts should NOT equal updated_at_ts
      // This is the core fix from Story 17.3 - created_at_ts is server-ingest, not a duplicate of updated_at_ts
      assert.notEqual(
        persistedCreatedAtTs,
        expectedUpdatedAtTs,
        "created_at_ts should NOT equal updated_at_ts - created_at_ts is server-ingest, updated_at_ts is client-authored snapshot freshness"
      );

      // Verify pos_order_snapshot_lines timestamps through REAL implementation path
      const [lineRows] = await db.execute(
        `SELECT updated_at_ts, created_at_ts
         FROM pos_order_snapshot_lines
         WHERE order_id = ?
         LIMIT 1`,
        [orderId]
      );
      assert.equal(lineRows.length, 1, "Should find persisted snapshot line");

      const persistedLine = lineRows[0];

      // AC1: updated_at_ts for lines is snapshot freshness (from line's updated_at)
      assert.ok(
        Math.abs(Number(persistedLine.updated_at_ts) - expectedUpdatedAtTs) < 1000,
        `line updated_at_ts should preserve client-authored snapshot freshness`
      );

      // AC3: created_at_ts for lines is SERVER-INGEST TIME
      const lineCreatedAtTs = Number(persistedLine.created_at_ts);
      assert.ok(
        lineCreatedAtTs >= beforeServerTime - 100,
        `line created_at_ts should be >= server time before request`
      );
      assert.ok(
        lineCreatedAtTs <= afterServerTime + 100,
        `line created_at_ts should be <= server time after request`
      );

      // KEY ASSERTION: line created_at_ts should NOT equal line updated_at_ts
      assert.notEqual(
        lineCreatedAtTs,
        expectedUpdatedAtTs,
        "line created_at_ts should NOT equal line updated_at_ts - created_at_ts is server-ingest"
      );

      // Cleanup
      await db.execute("DELETE FROM pos_order_snapshot_lines WHERE order_id = ?", [orderId]);
      await db.execute("DELETE FROM pos_order_snapshots WHERE order_id = ?", [orderId]);
    } finally {
      await stopApiServer(childProcess);
    }
  }
);

localServerTest(
  "sync push integration: item_cancellations cancelled_at_ts is client-authored, created_at_ts is server-ingest (Story 17.3)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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
      const loginBody = await parseJsonResponse(loginResponse);
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const orderId = randomUUID();
      const snapshotId = randomUUID();
      const updateId = randomUUID();
      const cancellationId = randomUUID();
      const clientCancelledAt = "2026-03-20T11:00:00.000Z"; // Client says cancellation happened at 11:00
      const beforeServerTime = Date.now();

      // First create a snapshot to satisfy FK constraints
      await db.execute(
        `INSERT INTO pos_order_snapshots
         (order_id, company_id, outlet_id, service_type, order_state, order_status,
          is_finalized, paid_amount, opened_at, opened_at_ts, updated_at, updated_at_ts,
          created_at, created_at_ts)
         VALUES (?, ?, ?, 'TAKEAWAY', 'OPEN', 'OPEN', 0, 0, NOW(), ?, NOW(), ?, NOW(), ?)`,
        [snapshotId, companyId, outletId, Date.now(), Date.now(), Date.now()]
      );

      // Send item_cancellations through the REAL endpoint (POST /sync/push)
      const payload = {
        outlet_id: outletId,
        transactions: [],
        active_orders: [],
        order_updates: [
          {
            update_id: updateId,
            order_id: snapshotId,
            company_id: companyId,
            outlet_id: outletId,
            base_order_updated_at: null,
            event_type: "ITEM_CANCELLED",
            delta_json: JSON.stringify({ reason: "Story 17.3 cancellation test", cancelled_qty: 1 }),
            actor_user_id: ownerUserId,
            device_id: "WEB_POS",
            event_at: clientCancelledAt,
            created_at: clientCancelledAt
          }
        ],
        item_cancellations: [
          {
            cancellation_id: cancellationId,
            update_id: updateId,
            order_id: snapshotId,
            item_id: 1,
            company_id: companyId,
            outlet_id: outletId,
            cancelled_quantity: 1,
            reason: "Story 17.3 cancellation test",
            cancelled_by_user_id: ownerUserId,
            cancelled_at: clientCancelledAt // Client says cancellation happened at 11:00
          }
        ]
      };

      const response = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
      const body = await parseJsonResponse(response);
      assert.equal(body.success, true);

      const afterServerTime = Date.now();

      // Verify pos_item_cancellations timestamps through REAL implementation path
      const [cancelRows] = await db.execute(
        `SELECT cancelled_at_ts, created_at_ts
         FROM pos_item_cancellations
         WHERE cancellation_id = ?
         LIMIT 1`,
        [cancellationId]
      );
      assert.equal(cancelRows.length, 1, "Should find persisted cancellation");

      const persistedCancellation = cancelRows[0];

      // AC2: cancelled_at_ts is CLIENT-AUTHORITATIVE (preserved from payload)
      const expectedCancelledAtTs = new Date(clientCancelledAt).getTime();
      assert.ok(
        Math.abs(Number(persistedCancellation.cancelled_at_ts) - expectedCancelledAtTs) < 1000,
        `cancelled_at_ts should preserve client-authored cancellation time (expected ~${expectedCancelledAtTs}, got ${persistedCancellation.cancelled_at_ts})`
      );

      // AC3: created_at_ts is SERVER-INGEST TIME (distinct from cancelled_at_ts)
      const persistedCreatedAtTs = Number(persistedCancellation.created_at_ts);
      assert.ok(
        persistedCreatedAtTs >= beforeServerTime - 100,
        `created_at_ts should be >= server time before request`
      );
      assert.ok(
        persistedCreatedAtTs <= afterServerTime + 100,
        `created_at_ts should be <= server time after request`
      );

      // KEY ASSERTION: created_at_ts should NOT equal cancelled_at_ts
      // This verifies the semantics - created_at_ts is server-ingest, cancelled_at_ts is client-authored event time
      assert.notEqual(
        persistedCreatedAtTs,
        expectedCancelledAtTs,
        "created_at_ts should NOT equal cancelled_at_ts - created_at_ts is server-ingest, cancelled_at_ts is client-authored event occurrence"
      );

      // Cleanup
      await db.execute("DELETE FROM pos_item_cancellations WHERE cancellation_id = ?", [cancellationId]);
      await db.execute("DELETE FROM pos_order_snapshots WHERE order_id = ?", [snapshotId]);
    } finally {
      await stopApiServer(childProcess);
    }
  }
);
