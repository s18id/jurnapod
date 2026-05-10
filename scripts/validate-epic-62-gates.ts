#!/usr/bin/env npx tsx
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Epic 62 Gate Validation Script
 *
 * Parses __EPIC62_GATE__ JSON evidence from test stdout (or log file),
 * verifies all expected projections are present with zero variance,
 * and exits with 0 (pass) or 1 (fail).
 *
 * Usage:
 *   npm test -w @jurnapod/api 2>&1 | npx tsx scripts/validate-epic-62-gates.ts
 *   npx tsx scripts/validate-epic-62-gates.ts --input logs/test-output.log
 *
 * Exit codes:
 *   0 — All expected gates present, all variance == 0
 *   1 — Missing gate or non-zero variance
 *   2 — No gate evidence found in input
 */

import * as fs from 'node:fs';

// ── Expected projections from Epic 62 stories ──────────────────────────────
const EXPECTED_PROJECTIONS = new Set([
  'ar-aging',              // 62.1: AR Aging vs sales_invoices
  'ap-aging',              // 62.1: AP Aging vs purchase_invoices
  'gl-trial-balance',      // 62.1: GL Trial Balance vs journal_lines
  'inventory-valuation',   // 62.2: Inventory valuation vs cost_layers
  'cogs-posting',          // 62.2: COGS posting vs journal entries
  'treasury-balance',      // 62.3: Treasury balance vs cash_bank_transactions
  'sales-revenue',         // 62.3: Sales revenue vs GL REVENUE accounts
  'cash-flow-consistency', // 62.3: Cash-flow consistency check
]);

interface GateEvidence {
  gate: string;
  test?: string;
  projection: string;
  variance: string;
  timestamp?: string;
}

function parseLine(line: string): GateEvidence | null {
  const marker = '{"gate":"__EPIC62_GATE__"';
  const idx = line.indexOf(marker);
  if (idx === -1) return null;

  try {
    const payload = JSON.parse(line.slice(idx)) as GateEvidence;
    if (payload.gate !== '__EPIC62_GATE__') {
      console.warn(`[WARN] Unexpected gate identifier: ${payload.gate}`);
      return null;
    }
    if (!payload.projection) {
      console.warn(`[WARN] Gate missing projection field`);
      return null;
    }
    return payload;
  } catch {
    console.warn(`[WARN] Malformed JSON in gate line: ${line.slice(idx, idx + 120)}`);
    return null;
  }
}

async function main(): Promise<number> {
  // ── Resolve input source ───────────────────────────────────────────────
  const inputArg = process.argv.find((a) => a.startsWith('--input='));
  let input: string;

  if (inputArg) {
    const filePath = inputArg.slice('--input='.length);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      return 2;
    }
    input = fs.readFileSync(filePath, 'utf-8');
  } else {
    // Read stdin synchronously (CI pipelines pipe output)
    input = fs.readFileSync(0, 'utf-8'); // fd 0 = stdin
  }

  const lines = input.split('\n');

  // ── Parse gate evidence ────────────────────────────────────────────────
  const gates: GateEvidence[] = [];
  for (const line of lines) {
    const gate = parseLine(line);
    if (gate) gates.push(gate);
  }

  if (gates.length === 0) {
    console.error('FAIL: No __EPIC62_GATE__ evidence found in input.');
    console.error('Expected projections:', [...EXPECTED_PROJECTIONS].join(', '));
    return 2;
  }

  // ── Check all expected projections are present ─────────────────────────
  const foundProjections = new Set(gates.map((g) => g.projection));
  const missing: string[] = [];
  for (const proj of EXPECTED_PROJECTIONS) {
    if (!foundProjections.has(proj)) {
      missing.push(proj);
    }
  }

  if (missing.length > 0) {
    console.error(`FAIL: Missing gate evidence for: ${missing.join(', ')}`);
    return 1;
  }

  // ── Check all gates have zero variance ─────────────────────────────────
  let failures = 0;
  for (const gate of gates) {
    const varianceNum = parseFloat(gate.variance);
    if (varianceNum !== 0 || gate.variance !== '0.0000') {
      console.error(
        `FAIL: ${gate.projection} variance=${gate.variance} (expected 0.0000)` +
        (gate.test ? ` [test: ${gate.test}]` : '')
      );
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} gate(s) with non-zero variance.`);
    return 1;
  }

  // ── All gates pass ─────────────────────────────────────────────────────
  console.log(`PASS: All ${gates.length} gates present, all variance 0.0000`);
  console.log(`Projections verified: ${[...foundProjections].sort().join(', ')}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(2);
  });
