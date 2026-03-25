// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Integration Test DB Helpers
 *
 * Audit counters, persisted row counters, tax/outlet fixtures, cleanup.
 */

import { randomUUID } from "node:crypto";
import { toMysqlDateTime, toDateOnly } from "./sync-push-runtime.mjs";

const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";
const SYNC_PUSH_DUPLICATE_AUDIT_ACTION = "SYNC_PUSH_DUPLICATE";
const SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION = "SYNC_PUSH_POSTING_HOOK_FAIL";
export const POS_SALE_DOC_TYPE = "POS_SALE";
export const OUTLET_ACCOUNT_MAPPING_KEYS = ["CASH", "QRIS", "CARD", "SALES_REVENUE", "AR"];

export async function ensureOpenFiscalDate(db, companyId) {
  const [openRows] = await db.execute(
    `SELECT id, start_date
     FROM fiscal_years
     WHERE company_id = ?
       AND status = 'OPEN'
     ORDER BY start_date DESC
     LIMIT 1`,
    [companyId]
  );

  if (openRows.length > 0) {
    const startDate = toDateOnly(openRows[0].start_date);
    return {
      trxAt: `${startDate}T12:00:00.000Z`,
      createdFiscalYearId: null
    };
  }

  const year = new Date().getUTCFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const code = `ITFY${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
  const name = `Integration Fiscal Year ${year}`;
  const [insertResult] = await db.execute(
    `INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status)
     VALUES (?, ?, ?, ?, ?, 'OPEN')`,
    [companyId, code, name, startDate, endDate]
  );

  return {
    trxAt: `${startDate}T12:00:00.000Z`,
    createdFiscalYearId: Number(insertResult.insertId)
  };
}

export async function countAcceptedSyncPushEvents(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     WHERE action = ?
       AND success = 1
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
    [SYNC_PUSH_ACCEPTED_AUDIT_ACTION, clientTxId]
  );

  return Number(rows[0].total);
}

export async function countDuplicateSyncPushEvents(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     WHERE action = ?
       AND success = 1
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
    [SYNC_PUSH_DUPLICATE_AUDIT_ACTION, clientTxId]
  );

  return Number(rows[0].total);
}

export async function readAcceptedSyncPushAuditPayload(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT payload_json
     FROM audit_logs
     WHERE action = ?
       AND success = 1
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [SYNC_PUSH_ACCEPTED_AUDIT_ACTION, clientTxId]
  );

  if (rows.length === 0) {
    return null;
  }

  const payloadJson = String(rows[0].payload_json ?? "{}");
  return JSON.parse(payloadJson);
}

export async function readPostingHookFailureAuditPayload(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT payload_json
     FROM audit_logs
     WHERE action = ?
       AND result = 'FAIL'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION, clientTxId]
  );

  if (rows.length === 0) {
    return null;
  }

  const payloadJson = String(rows[0].payload_json ?? "{}");
  return JSON.parse(payloadJson);
}

export async function readDuplicateSyncPushAuditPayload(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT payload_json
     FROM audit_logs
     WHERE action = ?
       AND success = 1
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [SYNC_PUSH_DUPLICATE_AUDIT_ACTION, clientTxId]
  );

  if (rows.length === 0) {
    return null;
  }

  const payloadJson = String(rows[0].payload_json ?? "{}");
  return JSON.parse(payloadJson);
}

export async function countSyncPushPersistedRows(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT
       (SELECT COUNT(*) FROM pos_transactions WHERE client_tx_id = ?) AS tx_total,
       (
         SELECT COUNT(*)
         FROM pos_transaction_items pti
         INNER JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id
         WHERE pt.client_tx_id = ?
       ) AS item_total,
       (
         SELECT COUNT(*)
         FROM pos_transaction_payments ptp
         INNER JOIN pos_transactions pt ON pt.id = ptp.pos_transaction_id
         WHERE pt.client_tx_id = ?
       ) AS payment_total`,
    [clientTxId, clientTxId, clientTxId]
  );

  return {
    tx_total: Number(rows[0].tx_total),
    item_total: Number(rows[0].item_total),
    payment_total: Number(rows[0].payment_total)
  };
}

export async function countSyncPushJournalRows(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT
       (
         SELECT COUNT(*)
         FROM journal_batches jb
         INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
         WHERE jb.doc_type = ?
           AND pt.client_tx_id = ?
       ) AS batch_total,
       (
         SELECT COUNT(*)
         FROM journal_lines jl
         INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
         INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
         WHERE jb.doc_type = ?
           AND pt.client_tx_id = ?
       ) AS line_total`,
    [POS_SALE_DOC_TYPE, clientTxId, POS_SALE_DOC_TYPE, clientTxId]
  );

  return {
    batch_total: Number(rows[0].batch_total),
    line_total: Number(rows[0].line_total)
  };
}

export async function readSyncPushJournalSummary(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT
       COALESCE(SUM(jl.debit), 0) AS debit_total,
       COALESCE(SUM(jl.credit), 0) AS credit_total,
       COALESCE(SUM(CASE WHEN jl.description LIKE 'POS sales tax%' THEN jl.credit ELSE 0 END), 0) AS tax_credit_total,
       COALESCE(SUM(CASE WHEN jl.description LIKE 'POS sales tax%' THEN 1 ELSE 0 END), 0) AS tax_line_total
     FROM journal_lines jl
     INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
     INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
     WHERE jb.doc_type = ?
       AND pt.client_tx_id = ?`,
    [POS_SALE_DOC_TYPE, clientTxId]
  );

  return {
    debit_total: Number(rows[0].debit_total),
    credit_total: Number(rows[0].credit_total),
    tax_credit_total: Number(rows[0].tax_credit_total),
    tax_line_total: Number(rows[0].tax_line_total)
  };
}

export async function setCompanyDefaultTaxRate(db, companyId, config) {
  const [defaultRows] = await db.execute(
    `SELECT tax_rate_id
     FROM company_tax_defaults
     WHERE company_id = ?`,
    [companyId]
  );
  const previousDefaults = defaultRows.map((row) => Number(row.tax_rate_id)).filter((id) => id > 0);

  const createAccount = config.withAccount !== false;
  let createdAccountId = null;
  if (createAccount) {
    const accountCode = `ITTAX${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const [accountInsertResult] = await db.execute(
      `INSERT INTO accounts (company_id, code, name)
       VALUES (?, ?, ?)`,
      [companyId, accountCode, "Integration Test Tax Liability"]
    );
    createdAccountId = Number(accountInsertResult.insertId);
  }

  const code = `SYNC_TAX_${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const [insertResult] = await db.execute(
    `INSERT INTO tax_rates (company_id, code, name, rate_percent, is_inclusive, is_active, account_id)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [companyId, code, "Sync Tax", config.rate, config.inclusive ? 1 : 0, createdAccountId]
  );
  const taxRateId = Number(insertResult.insertId);

  await db.execute(
    `DELETE FROM company_tax_defaults WHERE company_id = ?`,
    [companyId]
  );
  await db.execute(
    `INSERT INTO company_tax_defaults (company_id, tax_rate_id)
     VALUES (?, ?)`,
    [companyId, taxRateId]
  );

  return { previousDefaults, taxRateId, createdAccountId };
}

export async function restoreCompanyDefaultTaxRate(db, companyId, previous) {
  await db.execute(
    `DELETE FROM company_tax_defaults WHERE company_id = ?`,
    [companyId]
  );

  if (Array.isArray(previous.previousDefaults) && previous.previousDefaults.length > 0) {
    const placeholders = previous.previousDefaults.map(() => "(?, ?)").join(", ");
    const values = previous.previousDefaults.flatMap((taxRateId) => [companyId, taxRateId]);
    await db.execute(
      `INSERT INTO company_tax_defaults (company_id, tax_rate_id)
       VALUES ${placeholders}`,
      values
    );
  }

  if (Number.isFinite(previous.taxRateId)) {
    await db.execute(
      `DELETE FROM pos_transaction_taxes
       WHERE company_id = ?
         AND tax_rate_id = ?`,
      [companyId, previous.taxRateId]
    );
    await db.execute(
      `DELETE FROM sales_invoice_taxes
       WHERE company_id = ?
         AND tax_rate_id = ?`,
      [companyId, previous.taxRateId]
    );
    await db.execute(
      `DELETE FROM tax_rates WHERE id = ? AND company_id = ?`,
      [previous.taxRateId, companyId]
    );
  }

  if (Number.isFinite(previous.createdAccountId) && Number(previous.createdAccountId) > 0) {
    // journal_lines are immutable (DB trigger) so we cannot delete them.
    // Only delete the account if no journal lines reference it.
    const [refRows] = await db.execute(
      `SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1`,
      [previous.createdAccountId]
    );
    if (refRows.length === 0) {
      await db.execute(
        `DELETE FROM accounts WHERE company_id = ? AND id = ?`,
        [companyId, previous.createdAccountId]
      );
    }
  }
}

export function buildTestAccountCode(mappingKey) {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const base = `IT${mappingKey.replaceAll("_", "")}${suffix}`;
  return base.slice(0, 32);
}

export async function ensureOutletAccountMappings(db, companyId, outletId) {
  const [constraintRows] = await db.execute(
    `SELECT check_clause
     FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE()
       AND constraint_name = 'chk_outlet_account_mappings_mapping_key'
     LIMIT 1`
  );

  const clause = constraintRows[0]?.check_clause ?? "";
  if (typeof clause !== "string" || !clause.includes("'CARD'")) {
    const dropConstraintStatements = [
      "ALTER TABLE outlet_account_mappings DROP CONSTRAINT chk_outlet_account_mappings_mapping_key",
      "ALTER TABLE outlet_account_mappings DROP CHECK chk_outlet_account_mappings_mapping_key"
    ];

    for (const statement of dropConstraintStatements) {
      try {
        await db.execute(statement);
        break;
      } catch (error) {
        const message = error?.message ?? "";
        if (typeof message === "string" && message.includes("doesn't exist")) {
          break;
        }
      }
    }

    await db.execute(
      `ALTER TABLE outlet_account_mappings
       ADD CONSTRAINT chk_outlet_account_mappings_mapping_key
       CHECK (mapping_key IN ('CASH', 'QRIS', 'CARD', 'SALES_REVENUE', 'AR'))`
    );
  }

  const placeholders = OUTLET_ACCOUNT_MAPPING_KEYS.map(() => "?").join(", ");
  const [existingRows] = await db.execute(
    `SELECT mapping_key
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [companyId, outletId, ...OUTLET_ACCOUNT_MAPPING_KEYS]
  );

  const existingKeys = new Set(
    (existingRows).map((row) => String(row.mapping_key ?? "")).filter((value) => value.length > 0)
  );

  const createdMappingKeys = [];
  const createdAccountIds = [];
  const createdPaymentMethodCodes = [];

  for (const mappingKey of OUTLET_ACCOUNT_MAPPING_KEYS) {
    if (existingKeys.has(mappingKey)) {
      continue;
    }

    const accountCode = buildTestAccountCode(mappingKey);
    const [accountInsertResult] = await db.execute(
      `INSERT INTO accounts (company_id, code, name)
       VALUES (?, ?, ?)`,
      [companyId, accountCode, `Integration Test ${mappingKey}`]
    );
    const accountId = Number(accountInsertResult.insertId);

    await db.execute(
      `INSERT INTO outlet_account_mappings (
         company_id,
         outlet_id,
         mapping_key,
         account_id
       ) VALUES (?, ?, ?, ?)`,
      [companyId, outletId, mappingKey, accountId]
    );

    createdMappingKeys.push(mappingKey);
    createdAccountIds.push(accountId);
  }

  const [paymentTableRows] = await db.execute(
    `SELECT 1 AS present
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'outlet_payment_method_mappings'
     LIMIT 1`
  );
  const hasPaymentMethodMappingTable = paymentTableRows.length > 0;

  if (hasPaymentMethodMappingTable) {
    const [paymentMappingRows] = await db.execute(
      `SELECT method_code
       FROM outlet_payment_method_mappings
       WHERE company_id = ?
         AND outlet_id = ?
         AND method_code IN ('CASH', 'QRIS', 'CARD')`,
      [companyId, outletId]
    );

    const existingMethodCodes = new Set(
      paymentMappingRows
        .map((row) => String(row.method_code ?? "").toUpperCase())
        .filter((value) => value.length > 0)
    );

    const [accountMappingRows] = await db.execute(
      `SELECT mapping_key, account_id
       FROM outlet_account_mappings
       WHERE company_id = ?
         AND outlet_id = ?
         AND mapping_key IN ('CASH', 'QRIS', 'CARD')`,
      [companyId, outletId]
    );
    const accountIdByMethodCode = new Map(
      accountMappingRows
        .map((row) => [String(row.mapping_key ?? "").toUpperCase(), Number(row.account_id)])
        .filter((row) => row[0].length > 0 && Number.isFinite(row[1]))
    );

    for (const methodCode of ["CASH", "QRIS", "CARD"]) {
      if (existingMethodCodes.has(methodCode)) {
        continue;
      }

      const accountId = accountIdByMethodCode.get(methodCode);
      if (!accountId) {
        continue;
      }

      await db.execute(
        `INSERT INTO outlet_payment_method_mappings (company_id, outlet_id, method_code, account_id)
         VALUES (?, ?, ?, ?)`,
        [companyId, outletId, methodCode, accountId]
      );
      createdPaymentMethodCodes.push(methodCode);
    }
  }

  return {
    createdMappingKeys,
    createdAccountIds,
    createdPaymentMethodCodes
  };
}

export async function cleanupCreatedOutletAccountMappings(db, companyId, outletId, fixture) {
  if (fixture.createdPaymentMethodCodes.length > 0) {
    const paymentMethodPlaceholders = fixture.createdPaymentMethodCodes.map(() => "?").join(", ");
    await db.execute(
      `DELETE FROM outlet_payment_method_mappings
       WHERE company_id = ?
         AND outlet_id = ?
         AND method_code IN (${paymentMethodPlaceholders})`,
      [companyId, outletId, ...fixture.createdPaymentMethodCodes]
    );
  }

  if (fixture.createdMappingKeys.length > 0) {
    const mappingPlaceholders = fixture.createdMappingKeys.map(() => "?").join(", ");
    await db.execute(
      `DELETE FROM outlet_account_mappings
       WHERE company_id = ?
         AND outlet_id = ?
         AND mapping_key IN (${mappingPlaceholders})`,
      [companyId, outletId, ...fixture.createdMappingKeys]
    );
  }

  if (fixture.createdAccountIds.length > 0) {
    const accountPlaceholders = fixture.createdAccountIds.map(() => "?").join(", ");
    await db.execute(
      `DELETE FROM accounts
       WHERE company_id = ?
         AND id IN (${accountPlaceholders})`,
      [companyId, ...fixture.createdAccountIds]
    );
  }
}

export async function cleanupSyncPushPersistedArtifacts(db, clientTxId) {
  // Note: journal_lines and journal_batches are immutable (enforced by DB triggers).
  // They are left in place; doc_id has no FK constraint so pos_transaction deletion is safe.

  // Delete audit logs
  await db.execute(
    `DELETE FROM audit_logs
     WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
    [clientTxId]
  );

  // Delete POS transaction items/payments first (FK constraints)
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

  await db.execute(
    `DELETE ptt
     FROM pos_transaction_taxes ptt
     INNER JOIN pos_transactions pt ON pt.id = ptt.pos_transaction_id
     WHERE pt.client_tx_id = ?`,
    [clientTxId]
  );

  // Finally delete the transaction header
  await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [clientTxId]);
}

export async function cleanupOrderSyncArtifacts(db, orderId) {
  try {
    await db.execute("DELETE FROM pos_item_cancellations WHERE order_id = ?", [orderId]);
  } catch (error) {
    if (error?.code !== "ER_NO_SUCH_TABLE") {
      throw error;
    }
  }
  try {
    await db.execute("DELETE FROM pos_order_updates WHERE order_id = ?", [orderId]);
    await db.execute("DELETE FROM pos_order_snapshot_lines WHERE order_id = ?", [orderId]);
    await db.execute("DELETE FROM pos_order_snapshots WHERE order_id = ?", [orderId]);
  } catch (error) {
    if (error?.code !== "ER_NO_SUCH_TABLE") {
      throw error;
    }
  }
}

export async function hasTable(db, tableName) {
  const [rows] = await db.execute(
    `SELECT 1 AS present
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [tableName]
  );

  return rows.length > 0;
}
