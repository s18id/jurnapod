import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const repoRoot = resolve(__dirname, '..', '..')
const updateScript = resolve(repoRoot, 'scripts/update-sprint-status.ts')
const tsxCli = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs')

function makeTempRepo(yamlContent) {
  const root = mkdtempSync(resolve(tmpdir(), 'jp-update-status-'))
  const statusDir = resolve(root, '_bmad-output/implementation-artifacts')
  mkdirSync(statusDir, { recursive: true })
  writeFileSync(resolve(statusDir, 'sprint-status.yaml'), yamlContent, 'utf8')
  return root
}

function runUpdate(root, args) {
  return spawnSync(process.execPath, [tsxCli, updateScript, ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

test('fails multiple matches without --multi', () => {
  const root = makeTempRepo(`development_status:
  # Epic 6: Sample
  epic-6: in_progress
  6-1a-invoice-types-extraction: ready-for-dev
  6-1b-payment-types-extraction: ready-for-dev
`)

  try {
    const result = runUpdate(root, ['--epic', '6', '--story', '6-1', '--status', 'done', '--dry-run'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Multiple existing keys match '6-1'/)
    assert.match(result.stderr, /Use --multi/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('updates multiple matches with --multi', () => {
  const root = makeTempRepo(`development_status:
  # Epic 6: Sample
  epic-6: in_progress
  6-1a-invoice-types-extraction: ready-for-dev
  6-1b-payment-types-extraction: ready-for-dev
`)

  try {
    const result = runUpdate(root, ['--epic', '6', '--story', '6-1', '--status', 'done', '--multi', '--dry-run'])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /6-1a-invoice-types-extraction: ready-for-dev/)
    assert.match(result.stdout, /6-1b-payment-types-extraction: ready-for-dev/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('requires cleaner first when legacy compact key conflicts with canonical target', () => {
  const root = makeTempRepo(`development_status:
  # Epic 6: Sample
  epic-6: in_progress
  6-1a-platform-acl: ready-for-dev
`)

  try {
    const result = runUpdate(root, ['--epic', '6', '--story', '6-1-a', '--title', 'platform-acl', '--status', 'done', '--dry-run'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Run cleaner first:/)
    assert.match(result.stderr, /clean-sprint-status\.ts --epic 6 --fix/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('normalizes uppercase bucket and title to lowercase canonical key', () => {
  const root = makeTempRepo(`development_status:
  # Epic 8: Sample
  epic-8: backlog
`)

  try {
    const result = runUpdate(root, ['--epic', '8', '--story', '8-1-A', '--title', 'Platform-ACL', '--status', 'done', '--dry-run'])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /8-1-a-platform-acl: done/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
