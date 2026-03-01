import "./load-env.mjs"
import mysql from "mysql2/promise"

const POS_SALE_DOC_TYPE = "POS_SALE"
const JOURNAL_BATCH_DOC_UNIQUE_KEY = "uq_journal_batches_company_doc"
const MYSQL_DUPLICATE_ERROR_CODE = 1062
const OUTLET_ACCOUNT_MAPPING_KEYS = ["CASH", "QRIS", "CARD", "SALES_REVENUE", "SALES_TAX", "AR"]
const MONEY_SCALE = 100
const MAX_LIMIT = 10000

function parsePositiveInt(value, flagName, options = {}) {
  const max = options.max ?? null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`)
  }

  if (max != null && parsed > max) {
    throw new Error(`${flagName} must be <= ${max}`)
  }

  return parsed
}

function parseArgs(argv) {
  let mode = "dry-run"
  let modeSetBy = null
  let limit = null
  let companyId = null
  let outletId = null
  let allCompanies = false

  for (const arg of argv) {
    if (arg === "--dry-run") {
      if (modeSetBy === "--execute") {
        throw new Error("--dry-run and --execute are mutually exclusive")
      }

      mode = "dry-run"
      modeSetBy = "--dry-run"
      continue
    }

    if (arg === "--execute") {
      if (modeSetBy === "--dry-run") {
        throw new Error("--dry-run and --execute are mutually exclusive")
      }

      mode = "execute"
      modeSetBy = "--execute"
      continue
    }

    if (arg === "--all-companies") {
      allCompanies = true
      continue
    }

    if (arg === "--help") {
      return {
        help: true,
        mode,
        limit,
        companyId,
        outletId,
        allCompanies
      }
    }

    if (arg.startsWith("--limit=")) {
      limit = parsePositiveInt(arg.slice("--limit=".length), "--limit", {
        max: MAX_LIMIT
      })
      continue
    }

    if (arg.startsWith("--company-id=")) {
      companyId = parsePositiveInt(arg.slice("--company-id=".length), "--company-id")
      continue
    }

    if (arg.startsWith("--outlet-id=")) {
      outletId = parsePositiveInt(arg.slice("--outlet-id=".length), "--outlet-id")
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (outletId != null && companyId == null) {
    throw new Error("--outlet-id requires --company-id")
  }

  if (allCompanies && companyId != null) {
    throw new Error("--all-companies cannot be combined with --company-id")
  }

  if (mode === "execute" && companyId == null && !allCompanies) {
    throw new Error("--execute requires --company-id (or --all-companies for full-scope runs)")
  }

  return {
    help: false,
    mode,
    limit,
    companyId,
    outletId,
    allCompanies
  }
}

function printHelp() {
  console.log("Usage: node packages/db/scripts/backfill-pos-journals.mjs [--dry-run|--execute] [--company-id=<id>|--all-companies] [--outlet-id=<id>] [--limit=<n>]")
  console.log("Defaults to --dry-run when mode is omitted")
  console.log(`--limit accepts positive integers up to ${MAX_LIMIT}`)
  console.log("--execute requires --company-id unless --all-companies is provided")
  console.log("--outlet-id requires --company-id")
}

function dbConfigFromEnv() {
  const port = Number(process.env.DB_PORT ?? "3306")
  if (Number.isNaN(port)) {
    throw new Error("DB_PORT must be a number")
  }

  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port,
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jurnapod"
  }
}

function toMinorUnits(value) {
  return Math.round(value * MONEY_SCALE)
}

function fromMinorUnits(value) {
  return value / MONEY_SCALE
}

function normalizeMoney(value) {
  return fromMinorUnits(toMinorUnits(value))
}

function normalizeTaxRate(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return parsed
}

function normalizePaymentMethodToMappingKey(method) {
  const normalized = String(method ?? "").trim().toUpperCase()
  if (normalized === "CASH" || normalized === "QRIS") {
    return normalized
  }

  if (normalized === "CARD") {
    return "CASH"
  }

  throw new Error(`UNSUPPORTED_PAYMENT_METHOD:${normalized || "<empty>"}`)
}

function assertBalancedLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("UNBALANCED_JOURNAL")
  }

  let totalDebitMinor = 0
  let totalCreditMinor = 0
  for (const line of lines) {
    totalDebitMinor += toMinorUnits(Number(line.debit ?? 0))
    totalCreditMinor += toMinorUnits(Number(line.credit ?? 0))
  }

  if (totalDebitMinor !== totalCreditMinor) {
    throw new Error("UNBALANCED_JOURNAL")
  }
}

function assertOneSidedPositiveLineShape(lines) {
  for (const line of lines) {
    const debit = Number(line.debit ?? 0)
    const credit = Number(line.credit ?? 0)
    if (debit < 0 || credit < 0) {
      throw new Error("INVALID_JOURNAL_LINE_SHAPE")
    }

    const debitMinor = toMinorUnits(debit)
    const creditMinor = toMinorUnits(credit)
    const isDebitOnly = debitMinor > 0 && creditMinor === 0
    const isCreditOnly = creditMinor > 0 && debitMinor === 0
    if (!isDebitOnly && !isCreditOnly) {
      throw new Error("INVALID_JOURNAL_LINE_SHAPE")
    }
  }
}

function readDuplicateKeyName(error) {
  const rawMessage = (typeof error?.sqlMessage === "string" && error.sqlMessage)
    || (typeof error?.message === "string" && error.message)
    || ""
  if (rawMessage.length === 0) {
    return null
  }

  const keyMatch = rawMessage.match(/for key ['`"]([^'`"]+)['`"]/i)
  if (!keyMatch) {
    return null
  }

  const keyName = keyMatch[1]?.trim()
  if (!keyName) {
    return null
  }

  return keyName.split(".").pop() ?? keyName
}

function isJournalBatchDocDuplicateError(error) {
  return Number(error?.errno) === MYSQL_DUPLICATE_ERROR_CODE
    && readDuplicateKeyName(error) === JOURNAL_BATCH_DOC_UNIQUE_KEY
}

function whereClauseForPosRows(filters, alias = "p") {
  const clauses = []
  const values = []

  if (filters.companyId != null) {
    clauses.push(`${alias}.company_id = ?`)
    values.push(filters.companyId)
  }

  if (filters.outletId != null) {
    clauses.push(`${alias}.outlet_id = ?`)
    values.push(filters.outletId)
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "",
    values
  }
}

function whereClauseForJournalRows(filters, alias = "jb") {
  const clauses = []
  const values = []

  if (filters.companyId != null) {
    clauses.push(`${alias}.company_id = ?`)
    values.push(filters.companyId)
  }

  if (filters.outletId != null) {
    clauses.push(`${alias}.outlet_id = ?`)
    values.push(filters.outletId)
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "",
    values
  }
}

async function readMissingCompletedPosTransactions(connection, filters) {
  const posWhere = whereClauseForPosRows(filters, "p")
  const params = [...posWhere.values]

  let sql = `SELECT
    p.id,
    p.company_id,
    p.outlet_id,
    p.client_tx_id,
    DATE_FORMAT(p.trx_at, '%Y-%m-%d %H:%i:%s') AS trx_at
   FROM pos_transactions p
   LEFT JOIN journal_batches jb
     ON jb.company_id = p.company_id
    AND jb.doc_type = ?
    AND jb.doc_id = p.id
   WHERE p.status = 'COMPLETED'
     AND jb.id IS NULL${posWhere.sql}
   ORDER BY p.id ASC`

  const queryParams = [POS_SALE_DOC_TYPE, ...params]
  if (filters.limit != null) {
    sql += " LIMIT ?"
    queryParams.push(filters.limit)
  }

  const [rows] = await connection.execute(sql, queryParams)
  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    client_tx_id: String(row.client_tx_id),
    trx_at: String(row.trx_at)
  }))
}

async function readCompanyPosTaxConfig(connection, companyId) {
  const [rows] = await connection.execute(
    `SELECT tr.rate_percent, tr.is_inclusive
     FROM company_tax_defaults ctd
     INNER JOIN tax_rates tr ON tr.id = ctd.tax_rate_id
     WHERE ctd.company_id = ?
       AND tr.is_active = 1
     ORDER BY tr.id ASC`,
    [companyId]
  )

  if (!rows || rows.length === 0) {
    return { rate: 0, inclusive: false }
  }

  const inclusive = Number(rows[0].is_inclusive) === 1
  const rate = rows.reduce((acc, row) => acc + normalizeTaxRate(row.rate_percent), 0)
  return {
    rate: normalizeMoney(rate),
    inclusive
  }
}

async function readOutletAccountMappingByKey(connection, companyId, outletId) {
  const placeholders = OUTLET_ACCOUNT_MAPPING_KEYS.map(() => "?").join(", ")
  const [rows] = await connection.execute(
    `SELECT mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [companyId, outletId, ...OUTLET_ACCOUNT_MAPPING_KEYS]
  )

  const accountByKey = new Map()
  for (const row of rows) {
    if (typeof row.mapping_key !== "string" || !Number.isFinite(row.account_id)) {
      continue
    }

    accountByKey.set(row.mapping_key, Number(row.account_id))
  }

  const missing = OUTLET_ACCOUNT_MAPPING_KEYS.filter((key) => !accountByKey.has(key))
  if (missing.length > 0) {
    throw new Error(`OUTLET_ACCOUNT_MAPPING_MISSING:${missing.join(",")}`)
  }

  return {
    CASH: accountByKey.get("CASH"),
    QRIS: accountByKey.get("QRIS"),
    SALES_REVENUE: accountByKey.get("SALES_REVENUE"),
    SALES_TAX: accountByKey.get("SALES_TAX"),
    AR: accountByKey.get("AR")
  }
}

async function readPosPaymentsByMethod(connection, posTransactionId) {
  const [rows] = await connection.execute(
    `SELECT method, SUM(amount) AS amount
     FROM pos_transaction_payments
     WHERE pos_transaction_id = ?
     GROUP BY method
     ORDER BY method ASC`,
    [posTransactionId]
  )

  const payments = rows.map((row) => ({
    method: String(row.method ?? "").trim(),
    amount: normalizeMoney(Number(row.amount ?? 0))
  })).filter((payment) => payment.method.length > 0 && payment.amount > 0)

  if (payments.length === 0) {
    throw new Error("POS_EMPTY_PAYMENT_SET")
  }

  return payments
}

async function readPosGrossSalesAmount(connection, posTransactionId) {
  const [rows] = await connection.execute(
    `SELECT SUM(qty * price_snapshot) AS gross_sales
     FROM pos_transaction_items
     WHERE pos_transaction_id = ?`,
    [posTransactionId]
  )

  const grossSales = normalizeMoney(Number(rows[0]?.gross_sales ?? 0))
  if (grossSales <= 0) {
    throw new Error("UNBALANCED_JOURNAL")
  }

  return grossSales
}

async function buildPosSaleJournalLines(connection, tx) {
  const mapping = await readOutletAccountMappingByKey(connection, tx.company_id, tx.outlet_id)
  const payments = await readPosPaymentsByMethod(connection, tx.id)
  const grossSales = await readPosGrossSalesAmount(connection, tx.id)
  const taxConfig = await readCompanyPosTaxConfig(connection, tx.company_id)

  let salesTaxAmount = 0
  let salesRevenueAmount = grossSales
  if (taxConfig.rate > 0) {
    const taxMultiplier = taxConfig.rate / 100
    if (taxConfig.inclusive) {
      salesRevenueAmount = normalizeMoney(grossSales / (1 + taxMultiplier))
      salesTaxAmount = normalizeMoney(grossSales - salesRevenueAmount)
    } else {
      salesTaxAmount = normalizeMoney(grossSales * taxMultiplier)
    }
  }

  const totalDue = normalizeMoney(grossSales + (taxConfig.inclusive ? 0 : salesTaxAmount))

  const lines = []
  let paymentTotal = 0
  for (const payment of payments) {
    const paymentMappingKey = normalizePaymentMethodToMappingKey(payment.method)
    const amount = normalizeMoney(payment.amount)
    paymentTotal = normalizeMoney(paymentTotal + amount)
    lines.push({
      account_id: mapping[paymentMappingKey],
      debit: amount,
      credit: 0,
      description: `POS ${paymentMappingKey} receipt`
    })
  }

  const receivableAmount = normalizeMoney(totalDue - paymentTotal)
  if (receivableAmount < 0) {
    throw new Error("POS_OVERPAYMENT_NOT_SUPPORTED")
  }

  if (receivableAmount > 0) {
    lines.push({
      account_id: mapping.AR,
      debit: receivableAmount,
      credit: 0,
      description: "POS outstanding receivable"
    })
  }

  lines.push({
    account_id: mapping.SALES_REVENUE,
    debit: 0,
    credit: salesRevenueAmount,
    description: "POS sales revenue"
  })

  if (salesTaxAmount > 0) {
    lines.push({
      account_id: mapping.SALES_TAX,
      debit: 0,
      credit: salesTaxAmount,
      description: "POS sales tax"
    })
  }

  return lines
}

async function rollbackQuietly(connection) {
  try {
    await connection.rollback()
  } catch {
    // Ignore rollback failure so the root cause remains visible.
  }
}

async function backfillSingleTransaction(connection, tx) {
  let started = false

  try {
    await connection.beginTransaction()
    started = true

    const [lockedRows] = await connection.execute(
      `SELECT id, company_id, outlet_id, DATE_FORMAT(trx_at, '%Y-%m-%d %H:%i:%s') AS trx_at
       FROM pos_transactions
       WHERE id = ?
         AND status = 'COMPLETED'
       LIMIT 1
       FOR UPDATE`,
      [tx.id]
    )

    const lockedTx = lockedRows[0]
    if (!lockedTx) {
      await connection.commit()
      return {
        status: "SKIPPED_NOT_COMPLETED"
      }
    }

    const [existingBatchRows] = await connection.execute(
      `SELECT id
       FROM journal_batches
       WHERE company_id = ?
         AND doc_type = ?
         AND doc_id = ?
       LIMIT 1
       FOR UPDATE`,
      [Number(lockedTx.company_id), POS_SALE_DOC_TYPE, Number(lockedTx.id)]
    )

    if (existingBatchRows.length > 0) {
      await connection.commit()
      return {
        status: "SKIPPED_EXISTS",
        journal_batch_id: Number(existingBatchRows[0].id)
      }
    }

    const postingContext = {
      id: Number(lockedTx.id),
      company_id: Number(lockedTx.company_id),
      outlet_id: Number(lockedTx.outlet_id),
      trx_at: String(lockedTx.trx_at)
    }
    const lines = await buildPosSaleJournalLines(connection, postingContext)
    assertOneSidedPositiveLineShape(lines)
    assertBalancedLines(lines)

    const [batchInsertResult] = await connection.execute(
      `INSERT INTO journal_batches (
         company_id,
         outlet_id,
         doc_type,
         doc_id,
         posted_at
       ) VALUES (?, ?, ?, ?, ?)`,
      [postingContext.company_id, postingContext.outlet_id, POS_SALE_DOC_TYPE, postingContext.id, postingContext.trx_at]
    )

    const journalBatchId = Number(batchInsertResult.insertId)
    const lineDate = postingContext.trx_at.slice(0, 10)
    const placeholders = lines.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ")
    const values = lines.flatMap((line) => [
      journalBatchId,
      postingContext.company_id,
      postingContext.outlet_id,
      line.account_id,
      lineDate,
      line.debit,
      line.credit,
      line.description
    ])

    await connection.execute(
      `INSERT INTO journal_lines (
         journal_batch_id,
         company_id,
         outlet_id,
         account_id,
         line_date,
         debit,
         credit,
         description
       ) VALUES ${placeholders}`,
      values
    )

    await connection.commit()
    return {
      status: "INSERTED",
      journal_batch_id: journalBatchId,
      line_total: lines.length
    }
  } catch (error) {
    if (started) {
      await rollbackQuietly(connection)
    }

    if (isJournalBatchDocDuplicateError(error)) {
      return {
        status: "SKIPPED_RACE_DUPLICATE"
      }
    }

    return {
      status: "FAILED",
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

async function readReconciliationSnapshot(connection, filters) {
  const posWhere = whereClauseForPosRows(filters, "p")
  const journalWhere = whereClauseForJournalRows(filters, "jb")

  const [missingRows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM pos_transactions p
     LEFT JOIN journal_batches jb
       ON jb.company_id = p.company_id
      AND jb.doc_type = ?
      AND jb.doc_id = p.id
     WHERE p.status = 'COMPLETED'
       AND jb.id IS NULL${posWhere.sql}`,
    [POS_SALE_DOC_TYPE, ...posWhere.values]
  )

  const [unbalancedRows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM (
       SELECT jb.id
       FROM journal_batches jb
       LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
       WHERE jb.doc_type = ?${journalWhere.sql}
       GROUP BY jb.id
       HAVING COALESCE(SUM(jl.debit), 0) <> COALESCE(SUM(jl.credit), 0)
     ) AS unbalanced`,
    [POS_SALE_DOC_TYPE, ...journalWhere.values]
  )

  const [orphanRows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM journal_batches jb
     LEFT JOIN pos_transactions p
       ON p.company_id = jb.company_id
      AND p.id = jb.doc_id
     WHERE jb.doc_type = ?
       AND p.id IS NULL${journalWhere.sql}`,
    [POS_SALE_DOC_TYPE, ...journalWhere.values]
  )

  return {
    missing_completed_pos: Number(missingRows[0].total),
    unbalanced_pos_sale_batches: Number(unbalancedRows[0].total),
    orphan_pos_sale_batches: Number(orphanRows[0].total)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const dbConfig = dbConfigFromEnv()
  const connection = await mysql.createConnection(dbConfig)

  try {
    const filters = {
      companyId: args.companyId,
      outletId: args.outletId,
      limit: args.limit
    }

    const before = await readReconciliationSnapshot(connection, filters)
    const missing = await readMissingCompletedPosTransactions(connection, filters)

    console.log(`mode=${args.mode}`)
    console.log(`scope.company_id=${args.companyId ?? "ALL"}`)
    console.log(`scope.outlet_id=${args.outletId ?? "ALL"}`)
    console.log(`scope.limit=${args.limit ?? "ALL"}`)
    console.log(`scope.all_companies=${args.allCompanies}`)
    console.log(`missing_candidates=${missing.length}`)
    console.log(`reconcile_before.missing_completed_pos=${before.missing_completed_pos}`)
    console.log(`reconcile_before.unbalanced_pos_sale_batches=${before.unbalanced_pos_sale_batches}`)
    console.log(`reconcile_before.orphan_pos_sale_batches=${before.orphan_pos_sale_batches}`)

    if (args.mode === "dry-run") {
      const preview = missing.slice(0, 10).map((row) => row.id).join(",")
      console.log(`dry_run.preview_pos_transaction_ids=${preview || "none"}`)
      return
    }

    let inserted = 0
    let skippedExists = 0
    let skippedRaceDuplicate = 0
    let skippedNotCompleted = 0
    let failed = 0

    for (const tx of missing) {
      const result = await backfillSingleTransaction(connection, tx)
      if (result.status === "INSERTED") {
        inserted += 1
        console.log(`backfilled pos_transaction_id=${tx.id} journal_batch_id=${result.journal_batch_id} line_total=${result.line_total}`)
        continue
      }

      if (result.status === "SKIPPED_EXISTS") {
        skippedExists += 1
        continue
      }

      if (result.status === "SKIPPED_RACE_DUPLICATE") {
        skippedRaceDuplicate += 1
        continue
      }

      if (result.status === "SKIPPED_NOT_COMPLETED") {
        skippedNotCompleted += 1
        continue
      }

      failed += 1
      console.error(`backfill_failed pos_transaction_id=${tx.id} client_tx_id=${tx.client_tx_id} reason=${result.reason}`)
    }

    const after = await readReconciliationSnapshot(connection, filters)

    console.log(`execute.inserted=${inserted}`)
    console.log(`execute.skipped_exists=${skippedExists}`)
    console.log(`execute.skipped_race_duplicate=${skippedRaceDuplicate}`)
    console.log(`execute.skipped_not_completed=${skippedNotCompleted}`)
    console.log(`execute.failed=${failed}`)
    console.log(`reconcile_after.missing_completed_pos=${after.missing_completed_pos}`)
    console.log(`reconcile_after.unbalanced_pos_sale_batches=${after.unbalanced_pos_sale_batches}`)
    console.log(`reconcile_after.orphan_pos_sale_batches=${after.orphan_pos_sale_batches}`)

    if (failed > 0) {
      process.exitCode = 1
    }
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error("pos journal backfill failed")
  console.error(error.message)
  process.exitCode = 1
})
