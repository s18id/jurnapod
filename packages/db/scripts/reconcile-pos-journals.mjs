import "./load-env.mjs"
import mysql from "mysql2/promise"

const POS_SALE_DOC_TYPE = "POS_SALE"
const DEFAULT_SAMPLE_LIMIT = 20
const MAX_SAMPLE_LIMIT = 200

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
  let companyId = null
  let outletId = null
  let sampleLimit = DEFAULT_SAMPLE_LIMIT

  for (const arg of argv) {
    if (arg === "--help") {
      return {
        help: true,
        companyId,
        outletId,
        sampleLimit
      }
    }

    if (arg.startsWith("--company-id=")) {
      companyId = parsePositiveInt(arg.slice("--company-id=".length), "--company-id")
      continue
    }

    if (arg.startsWith("--outlet-id=")) {
      outletId = parsePositiveInt(arg.slice("--outlet-id=".length), "--outlet-id")
      continue
    }

    if (arg.startsWith("--sample-limit=")) {
      sampleLimit = parsePositiveInt(arg.slice("--sample-limit=".length), "--sample-limit", {
        max: MAX_SAMPLE_LIMIT
      })
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (companyId == null) {
    throw new Error("--company-id is required")
  }

  if (outletId != null && companyId == null) {
    throw new Error("--outlet-id requires --company-id")
  }

  return {
    help: false,
    companyId,
    outletId,
    sampleLimit
  }
}

function printHelp() {
  console.log("Usage: node packages/db/scripts/reconcile-pos-journals.mjs --company-id=<id> [--outlet-id=<id>] [--sample-limit=<n>]")
  console.log(`--sample-limit defaults to ${DEFAULT_SAMPLE_LIMIT} and accepts values up to ${MAX_SAMPLE_LIMIT}`)
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

function whereClauseForPosRows(filters, alias = "p") {
  const clauses = [`${alias}.company_id = ?`]
  const values = [filters.companyId]

  if (filters.outletId != null) {
    clauses.push(`${alias}.outlet_id = ?`)
    values.push(filters.outletId)
  }

  return {
    sql: ` AND ${clauses.join(" AND ")}`,
    values
  }
}

function whereClauseForJournalRows(filters, alias = "jb") {
  const clauses = [`${alias}.company_id = ?`]
  const values = [filters.companyId]

  if (filters.outletId != null) {
    clauses.push(`${alias}.outlet_id = ?`)
    values.push(filters.outletId)
  }

  return {
    sql: ` AND ${clauses.join(" AND ")}`,
    values
  }
}

async function readReconciliationCounts(connection, filters) {
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
     ) t`,
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
    missing_after: Number(missingRows[0].total),
    unbalanced_batches: Number(unbalancedRows[0].total),
    orphan_batches: Number(orphanRows[0].total)
  }
}

async function readSampleRows(connection, filters, sampleLimit) {
  const posWhere = whereClauseForPosRows(filters, "p")
  const journalWhere = whereClauseForJournalRows(filters, "jb")

  const [missingRows] = await connection.execute(
    `SELECT p.id
     FROM pos_transactions p
     LEFT JOIN journal_batches jb
       ON jb.company_id = p.company_id
      AND jb.doc_type = ?
      AND jb.doc_id = p.id
     WHERE p.status = 'COMPLETED'
       AND jb.id IS NULL${posWhere.sql}
     ORDER BY p.id ASC
     LIMIT ?`,
    [POS_SALE_DOC_TYPE, ...posWhere.values, sampleLimit]
  )

  const [unbalancedRows] = await connection.execute(
    `SELECT jb.id
     FROM journal_batches jb
     LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
     WHERE jb.doc_type = ?${journalWhere.sql}
     GROUP BY jb.id
     HAVING COALESCE(SUM(jl.debit), 0) <> COALESCE(SUM(jl.credit), 0)
     ORDER BY jb.id ASC
     LIMIT ?`,
    [POS_SALE_DOC_TYPE, ...journalWhere.values, sampleLimit]
  )

  const [orphanRows] = await connection.execute(
    `SELECT jb.id
     FROM journal_batches jb
     LEFT JOIN pos_transactions p
       ON p.company_id = jb.company_id
      AND p.id = jb.doc_id
     WHERE jb.doc_type = ?
       AND p.id IS NULL${journalWhere.sql}
     ORDER BY jb.id ASC
     LIMIT ?`,
    [POS_SALE_DOC_TYPE, ...journalWhere.values, sampleLimit]
  )

  return {
    missing_pos_ids: missingRows.map((row) => Number(row.id)),
    unbalanced_batch_ids: unbalancedRows.map((row) => Number(row.id)),
    orphan_batch_ids: orphanRows.map((row) => Number(row.id))
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const connection = await mysql.createConnection(dbConfigFromEnv())
  try {
    const filters = {
      companyId: args.companyId,
      outletId: args.outletId
    }

    const counts = await readReconciliationCounts(connection, filters)
    const samples = await readSampleRows(connection, filters, args.sampleLimit)
    const status = counts.missing_after === 0
      && counts.unbalanced_batches === 0
      && counts.orphan_batches === 0
      ? "PASS"
      : "FAIL"

    console.log(`scope.company_id=${args.companyId}`)
    console.log(`scope.outlet_id=${args.outletId ?? "ALL"}`)
    console.log(`scope.sample_limit=${args.sampleLimit}`)
    console.log(`reconcile.missing_after=${counts.missing_after}`)
    console.log(`reconcile.unbalanced_batches=${counts.unbalanced_batches}`)
    console.log(`reconcile.orphan_batches=${counts.orphan_batches}`)
    console.log(`sample.missing_pos_ids=${samples.missing_pos_ids.join(",") || "none"}`)
    console.log(`sample.unbalanced_batch_ids=${samples.unbalanced_batch_ids.join(",") || "none"}`)
    console.log(`sample.orphan_batch_ids=${samples.orphan_batch_ids.join(",") || "none"}`)
    console.log(`reconcile.status=${status}`)

    if (status === "FAIL") {
      process.exitCode = 2
    }
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error("pos journal reconciliation failed")
  console.error(error.message)
  process.exitCode = 1
})
