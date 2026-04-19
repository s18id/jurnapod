#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_START_MIGRATION = 170

function listMigrationFiles(migrationsDir) {
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    // Skip archived migrations from legacy baselines
    if (entry.isDirectory() && entry.name === 'archive') continue
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue
    files.push(resolve(migrationsDir, entry.name))
  }

  return files
}

function getMigrationNumber(filePath) {
  const base = filePath.split('/').pop() ?? ''
  const match = base.match(/^(\d+)_/)
  if (!match) return null
  return Number(match[1])
}

function isStatusOrStateColumn(columnName) {
  const lower = columnName.toLowerCase()
  if (lower.endsWith('_id')) return false
  return lower === 'status' || lower === 'state' || lower.endsWith('_status') || lower.endsWith('_state')
}

function checkFile(filePath) {
  const text = readFileSync(filePath, 'utf8')
  const lines = text.split('\n')
  const violations = []

  // Build logical SQL fragments to support multiline column definitions.
  const fragments = []
  let buffer = ''
  let startLine = 1

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('--')) continue

    // Ignore statement headers/closers that are not column definitions.
    if (/^create\s+table\b/i.test(trimmed) || /^alter\s+table\b/i.test(trimmed) || /^\)?;?$/.test(trimmed)) {
      continue
    }

    if (!buffer) {
      startLine = i + 1
    }

    buffer = `${buffer} ${trimmed}`.trim()
    if (trimmed.endsWith(',') || trimmed.endsWith(';')) {
      fragments.push({ text: buffer, line: startLine })
      buffer = ''
    }
  }
  if (buffer) {
    fragments.push({ text: buffer, line: startLine })
  }

  for (const fragment of fragments) {
    const trimmed = fragment.text

    // Match common SQL column definitions in CREATE TABLE / ALTER TABLE ADD COLUMN
    // Examples:
    //   `status` TINYINT NOT NULL,
    //   status ENUM('DRAFT','POSTED') NOT NULL,
    //   ADD COLUMN `order_status` TINYINT NOT NULL
    //   MODIFY COLUMN status TINYINT NOT NULL
    //   CHANGE COLUMN old_status status TINYINT NOT NULL
    const alterMatch = trimmed.match(
      /(?:add|modify)\s+column\s+`?([a-zA-Z0-9_]+)`?\s+([a-zA-Z0-9_()'",\s]+)/i,
    )
    const changeMatch = trimmed.match(
      /change\s+column\s+`?[a-zA-Z0-9_]+`?\s+`?([a-zA-Z0-9_]+)`?\s+([a-zA-Z0-9_()'",\s]+)/i,
    )
    const createMatch = trimmed.match(/`?([a-zA-Z0-9_]+)`?\s+([a-zA-Z0-9_()'",\s]+)/i)
    const match = alterMatch ?? changeMatch ?? createMatch
    if (!match) continue

    const [, columnName, typeSegment] = match
    if (!isStatusOrStateColumn(columnName)) continue

    if (!/\btinyint\b/i.test(typeSegment)) {
      violations.push({
        filePath,
        line: fragment.line,
        columnName,
        snippet: trimmed,
      })
    }
  }

  return violations
}

export function validateStatusColumns({
  rootDir = process.cwd(),
  startMigration = Number(process.env.STATUS_TINYINT_ENFORCEMENT_START ?? DEFAULT_START_MIGRATION),
} = {}) {
  const migrationsDir = resolve(rootDir, 'packages/db/migrations')
  let files
  try {
    files = listMigrationFiles(migrationsDir)
  } catch {
    throw new Error(`Migrations directory not found: ${migrationsDir}`)
  }

  const violations = []
  for (const file of files) {
    const migrationNo = getMigrationNumber(file)
    if (migrationNo == null || migrationNo < startMigration) continue
    violations.push(...checkFile(file))
  }

  return violations
}

function main() {
  let violations
  try {
    violations = validateStatusColumns()
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  if (violations.length > 0) {
    console.error('❌ Status/state columns must use TINYINT (project rule).')
    console.error('   Found violations in migrations:')
    for (const v of violations) {
      console.error(`   - ${v.filePath}:${v.line} (${v.columnName})`)
      console.error(`     ${v.snippet}`)
    }
    process.exit(1)
  }

  console.log('✅ Status/state migration validation passed (TINYINT enforced).')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
