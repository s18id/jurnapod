// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import "./load-env.mjs"
import mysql from "mysql2/promise"

const RESERVATION_DEFAULT_DURATION_KEY = "feature.reservation.default_duration_minutes"
const DEFAULT_DURATION_MINUTES = 120
const DEFAULT_BATCH_SIZE = 500
const MAX_LIMIT = 100000
const SAMPLE_LIMIT = 20

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
  let companyId = null
  let outletId = null
  let limit = null

  for (const arg of argv) {
    if (arg === "--help") {
      return {
        help: true,
        mode,
        companyId,
        outletId,
        limit
      }
    }

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

    if (arg.startsWith("--company-id=")) {
      companyId = parsePositiveInt(arg.slice("--company-id=".length), "--company-id")
      continue
    }

    if (arg.startsWith("--outlet-id=")) {
      outletId = parsePositiveInt(arg.slice("--outlet-id=".length), "--outlet-id")
      continue
    }

    if (arg.startsWith("--limit=")) {
      limit = parsePositiveInt(arg.slice("--limit=".length), "--limit", { max: MAX_LIMIT })
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (outletId != null && companyId == null) {
    throw new Error("--outlet-id requires --company-id")
  }

  return {
    help: false,
    mode,
    companyId,
    outletId,
    limit
  }
}

function printHelp() {
  console.log("Usage: node packages/db/scripts/backfill-reservation-start-end-ts.mjs [--dry-run|--execute] [--company-id=<id>] [--outlet-id=<id>] [--limit=<n>]")
  console.log("Defaults to --dry-run when mode is omitted")
  console.log("--outlet-id requires --company-id")
  console.log(`--limit accepts positive integers up to ${MAX_LIMIT}`)
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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function readTimezone(row) {
  if (isNonEmptyString(row.outlet_timezone)) {
    return row.outlet_timezone.trim()
  }

  if (isNonEmptyString(row.company_timezone)) {
    return row.company_timezone.trim()
  }

  return null
}

function parsePositiveDurationMinutes(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function parseCompanyDefaultDurationMinutes(valueJson) {
  if (!isNonEmptyString(valueJson)) {
    return null
  }

  try {
    const parsedJson = JSON.parse(valueJson)
    if (typeof parsedJson === "number") {
      return parsePositiveDurationMinutes(parsedJson)
    }

    if (typeof parsedJson === "string") {
      return parsePositiveDurationMinutes(parsedJson.trim())
    }
  } catch {
    return null
  }

  return null
}

function resolveEffectiveDurationMinutes(row) {
  const fromRow = parsePositiveDurationMinutes(row.duration_minutes)
  if (fromRow != null) {
    return fromRow
  }

  const fromCompany = parseCompanyDefaultDurationMinutes(row.company_default_duration_json)
  if (fromCompany != null) {
    return fromCompany
  }

  return DEFAULT_DURATION_MINUTES
}

const formatterCache = new Map()
const offsetFormatterCache = new Map()

function getLocalPartsFormatter(timezone) {
  if (!formatterCache.has(timezone)) {
    formatterCache.set(
      timezone,
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23"
      })
    )
  }

  return formatterCache.get(timezone)
}

function getOffsetFormatter(timezone) {
  if (!offsetFormatterCache.has(timezone)) {
    offsetFormatterCache.set(
      timezone,
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23",
        timeZoneName: "shortOffset"
      })
    )
  }

  return offsetFormatterCache.get(timezone)
}

function getPartsValue(parts, type) {
  const found = parts.find((part) => part.type === type)?.value
  return found == null ? null : Number(found)
}

function parseOffsetMinutes(offsetText) {
  if (offsetText === "GMT" || offsetText === "UTC") {
    return 0
  }

  const match = offsetText.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    return null
  }

  const sign = match[1] === "+" ? 1 : -1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? "0")
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return null
  }

  return sign * (hours * 60 + minutes)
}

function parseLocalDateTime(localDateTime) {
  if (!isNonEmptyString(localDateTime)) {
    return null
  }

  const match = localDateTime.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
  )

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const millisecond = Number((match[7] ?? "0").padEnd(3, "0"))

  const utcValidation = new Date(Date.UTC(year, month - 1, day))
  if (
    Number.isNaN(utcValidation.getTime())
    || utcValidation.getUTCFullYear() !== year
    || utcValidation.getUTCMonth() + 1 !== month
    || utcValidation.getUTCDate() !== day
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || second < 0
    || second > 59
  ) {
    return null
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond
  }
}

function readZonedParts(utcMs, timezone) {
  const formatter = getLocalPartsFormatter(timezone)
  const parts = formatter.formatToParts(new Date(utcMs))
  return {
    year: getPartsValue(parts, "year"),
    month: getPartsValue(parts, "month"),
    day: getPartsValue(parts, "day"),
    hour: getPartsValue(parts, "hour"),
    minute: getPartsValue(parts, "minute"),
    second: getPartsValue(parts, "second")
  }
}

function getOffsetMinutesAtUtcMs(utcMs, timezone) {
  const formatter = getOffsetFormatter(timezone)
  const parts = formatter.formatToParts(new Date(utcMs))
  const offsetText = parts.find((part) => part.type === "timeZoneName")?.value
  if (!offsetText) {
    return null
  }

  return parseOffsetMinutes(offsetText)
}

function localDateTimeToUtcMs(localDateTime, timezone) {
  const parsed = parseLocalDateTime(localDateTime)
  if (!parsed) {
    return null
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date())
  } catch {
    return null
  }

  const desiredNaiveMs = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
    parsed.millisecond
  )

  let candidateUtcMs = desiredNaiveMs
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offsetMinutes = getOffsetMinutesAtUtcMs(candidateUtcMs, timezone)
    if (offsetMinutes == null) {
      return null
    }

    const nextCandidate = desiredNaiveMs - offsetMinutes * 60000
    if (nextCandidate === candidateUtcMs) {
      break
    }

    candidateUtcMs = nextCandidate
  }

  const actual = readZonedParts(candidateUtcMs, timezone)
  const exactMatch = actual.year === parsed.year
    && actual.month === parsed.month
    && actual.day === parsed.day
    && actual.hour === parsed.hour
    && actual.minute === parsed.minute
    && actual.second === parsed.second

  if (!exactMatch) {
    return null
  }

  return candidateUtcMs
}

function pushSampleId(list, value) {
  if (list.length >= SAMPLE_LIMIT) {
    return
  }

  list.push(value)
}

function whereClauseForScope(filters) {
  const clauses = ["(r.reservation_start_ts IS NULL OR r.reservation_end_ts IS NULL)"]
  const values = []

  if (filters.companyId != null) {
    clauses.push("r.company_id = ?")
    values.push(filters.companyId)
  }

  if (filters.outletId != null) {
    clauses.push("r.outlet_id = ?")
    values.push(filters.outletId)
  }

  return {
    sql: clauses.join(" AND "),
    values
  }
}

async function readCandidatesBatch(connection, filters) {
  const scope = whereClauseForScope(filters)

  const [rows] = await connection.execute(
    `SELECT
       r.id,
       r.company_id,
       r.outlet_id,
       DATE_FORMAT(r.reservation_at, '%Y-%m-%d %H:%i:%s') AS reservation_at_local,
       r.duration_minutes,
       r.reservation_start_ts,
       r.reservation_end_ts,
       o.timezone AS outlet_timezone,
       c.timezone AS company_timezone,
       cs.value_json AS company_default_duration_json
     FROM reservations r
     INNER JOIN companies c ON c.id = r.company_id
     LEFT JOIN outlets o
       ON o.company_id = r.company_id
      AND o.id = r.outlet_id
     LEFT JOIN company_settings cs
       ON cs.company_id = r.company_id
      AND cs.outlet_id IS NULL
      AND cs.key = ?
     WHERE ${scope.sql}
       AND r.id > ?
     ORDER BY r.id ASC
     LIMIT ?`,
    [
      RESERVATION_DEFAULT_DURATION_KEY,
      ...scope.values,
      filters.afterId,
      filters.batchSize
    ]
  )

  return rows
}

async function applyBatchUpdates(connection, updates) {
  await connection.beginTransaction()
  try {
    let affectedTotal = 0

    for (const update of updates) {
      const [result] = await connection.execute(
        `UPDATE reservations
         SET reservation_start_ts = COALESCE(reservation_start_ts, ?),
             reservation_end_ts = COALESCE(reservation_end_ts, ?)
         WHERE id = ?
           AND (reservation_start_ts IS NULL OR reservation_end_ts IS NULL)`,
        [update.reservationStartTs, update.reservationEndTs, update.id]
      )

      affectedTotal += Number(result.affectedRows ?? 0)
    }

    await connection.commit()
    return affectedTotal
  } catch (error) {
    try {
      await connection.rollback()
    } catch {
      // Ignore rollback failure and keep original cause.
    }
    throw error
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const connection = await mysql.createConnection(dbConfigFromEnv())

  const summary = {
    scanned: 0,
    updated: 0,
    skipped_missing_timezone: 0,
    parse_failures: 0,
    dry_run_candidates: 0
  }

  const sampleIds = {
    updated: [],
    skipped_missing_timezone: [],
    parse_failures: [],
    dry_run_candidates: []
  }

  try {
    const batchSize = args.limit != null ? Math.min(args.limit, DEFAULT_BATCH_SIZE) : DEFAULT_BATCH_SIZE
    let remaining = args.limit
    let afterId = 0

    while (remaining == null || remaining > 0) {
      const currentBatchSize = remaining == null ? batchSize : Math.min(batchSize, remaining)
      const batchRows = await readCandidatesBatch(connection, {
        companyId: args.companyId,
        outletId: args.outletId,
        afterId,
        batchSize: currentBatchSize
      })

      if (batchRows.length === 0) {
        break
      }

      afterId = Number(batchRows[batchRows.length - 1].id)
      if (remaining != null) {
        remaining -= batchRows.length
      }

      const updates = []
      for (const row of batchRows) {
        summary.scanned += 1

        const timezone = readTimezone(row)
        if (!timezone) {
          summary.skipped_missing_timezone += 1
          pushSampleId(sampleIds.skipped_missing_timezone, Number(row.id))
          continue
        }

        const startTs = localDateTimeToUtcMs(String(row.reservation_at_local), timezone)
        if (startTs == null) {
          summary.parse_failures += 1
          pushSampleId(sampleIds.parse_failures, Number(row.id))
          continue
        }

        const effectiveDurationMinutes = resolveEffectiveDurationMinutes(row)
        const endTs = startTs + effectiveDurationMinutes * 60000

        updates.push({
          id: Number(row.id),
          reservationStartTs: startTs,
          reservationEndTs: endTs
        })

        summary.dry_run_candidates += 1
        pushSampleId(sampleIds.dry_run_candidates, Number(row.id))
      }

      if (updates.length === 0 || args.mode === "dry-run") {
        continue
      }

      const affected = await applyBatchUpdates(connection, updates)
      summary.updated += affected
      for (const update of updates) {
        pushSampleId(sampleIds.updated, update.id)
      }
    }

    console.log(`mode=${args.mode}`)
    console.log(`scope.company_id=${args.companyId ?? "ALL"}`)
    console.log(`scope.outlet_id=${args.outletId ?? "ALL"}`)
    console.log(`scope.limit=${args.limit ?? "ALL"}`)
    console.log(`summary.scanned=${summary.scanned}`)
    console.log(`summary.updated=${summary.updated}`)
    console.log(`summary.skipped_missing_timezone=${summary.skipped_missing_timezone}`)
    console.log(`summary.parse_failures=${summary.parse_failures}`)
    console.log(`summary.dry_run_candidates=${summary.dry_run_candidates}`)
    console.log(`sample.updated_ids=${sampleIds.updated.join(",") || "none"}`)
    console.log(`sample.skipped_missing_timezone_ids=${sampleIds.skipped_missing_timezone.join(",") || "none"}`)
    console.log(`sample.parse_failure_ids=${sampleIds.parse_failures.join(",") || "none"}`)
    console.log(`sample.dry_run_candidate_ids=${sampleIds.dry_run_candidates.join(",") || "none"}`)
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error("reservation timestamp backfill failed")
  console.error(error.message)
  process.exitCode = 1
})
