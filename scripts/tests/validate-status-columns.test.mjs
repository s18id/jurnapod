import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { validateStatusColumns } from '../validate-status-columns.mjs'

function makeTempRepo() {
  const root = mkdtempSync(resolve(tmpdir(), 'jp-status-'))
  const migrationsDir = resolve(root, 'packages/db/migrations')
  mkdirSync(migrationsDir, { recursive: true })
  return { root, migrationsDir }
}

test('passes when status/state use tinyint in enforced migrations', () => {
  const { root, migrationsDir } = makeTempRepo()
  try {
    writeFileSync(
      resolve(migrationsDir, '0170_ok.sql'),
      "CREATE TABLE t (\n  status TINYINT NOT NULL,\n  order_state tinyint NOT NULL\n);\n",
      'utf8',
    )

    const violations = validateStatusColumns({ rootDir: root, startMigration: 170 })
    assert.equal(violations.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fails when status uses non-tinyint in enforced migrations', () => {
  const { root, migrationsDir } = makeTempRepo()
  try {
    writeFileSync(
      resolve(migrationsDir, '0171_bad.sql'),
      "CREATE TABLE t (\n  status ENUM('DRAFT','POSTED') NOT NULL\n);\n",
      'utf8',
    )

    const violations = validateStatusColumns({ rootDir: root, startMigration: 170 })
    assert.equal(violations.length, 1)
    assert.equal(violations[0].columnName, 'status')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fails for multiline ADD COLUMN status enum', () => {
  const { root, migrationsDir } = makeTempRepo()
  try {
    writeFileSync(
      resolve(migrationsDir, '0172_bad_multiline.sql'),
      "ALTER TABLE t\n  ADD COLUMN status\n    ENUM('DRAFT','POSTED')\n    NOT NULL;\n",
      'utf8',
    )

    const violations = validateStatusColumns({ rootDir: root, startMigration: 170 })
    assert.equal(violations.length, 1)
    assert.equal(violations[0].columnName, 'status')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ignores legacy migrations before enforcement threshold', () => {
  const { root, migrationsDir } = makeTempRepo()
  try {
    writeFileSync(
      resolve(migrationsDir, '0169_legacy.sql'),
      "CREATE TABLE t (\n  status ENUM('A','B') NOT NULL\n);\n",
      'utf8',
    )

    const violations = validateStatusColumns({ rootDir: root, startMigration: 170 })
    assert.equal(violations.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
