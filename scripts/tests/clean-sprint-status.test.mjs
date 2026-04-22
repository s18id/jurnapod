import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const repoRoot = resolve(__dirname, '..', '..')
const cleanerScript = resolve(repoRoot, 'scripts/clean-sprint-status.ts')
const tsxCli = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs')

function makeTempRepo(yamlContent) {
  const root = mkdtempSync(resolve(tmpdir(), 'jp-clean-status-'))
  const statusDir = resolve(root, '_bmad-output/implementation-artifacts')
  mkdirSync(statusDir, { recursive: true })
  writeFileSync(resolve(statusDir, 'sprint-status.yaml'), yamlContent, 'utf8')
  return root
}

function runCleaner(root, args) {
  return spawnSync(process.execPath, [tsxCli, cleanerScript, ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

function readStatus(root) {
  return readFileSync(resolve(root, '_bmad-output/implementation-artifacts/sprint-status.yaml'), 'utf8')
}

test('dry-run reports malformed keys without writing changes', () => {
  const root = makeTempRepo(`development_status:
  # Epic 49: Sample
  epic-49: in_progress
  49-49.3: done
`)

  try {
    const result = runCleaner(root, ['--epic', '49'])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /49-49\.3/)
    assert.match(result.stdout, /\[DRY RUN\]/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fix removes malformed source key on rename collision', () => {
  const root = makeTempRepo(`development_status:
  # Epic 6: Sample
  epic-6: in_progress
  6-1a-foo: done
  6-1-a-foo: review
`)

  try {
    const result = runCleaner(root, ['--epic', '6', '--fix'])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /Applied fixes/)

    const content = readStatus(root)
    assert.ok(!content.includes('6-1a-foo: done'))
    assert.match(content, /6-1-a-foo: review/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fix normalizes uppercase keys to lowercase canonical form', () => {
  const root = makeTempRepo(`development_status:
  # Epic 10: Sample
  epic-10: in_progress
  10-1-Add-Thing: done
`)

  try {
    const result = runCleaner(root, ['--epic', '10', '--fix'])
    assert.equal(result.status, 0)

    const content = readStatus(root)
    assert.ok(!content.includes('10-1-Add-Thing: done'))
    assert.match(content, /10-1-add-thing: done/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
