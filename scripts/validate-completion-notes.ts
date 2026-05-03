#!/usr/bin/env tsx
/// <reference types="node" />

/**
 * Completion Notes Validation Script
 *
 * Validates that every story marked "done" in sprint-status.yaml has a
 * corresponding .completion.md file. This enforces the Definition of Done
 * requirement that story completion notes are present before marking done.
 *
 * Usage:
 *   npx tsx scripts/validate-completion-notes.ts        # baseline mode (default)
 *   npx tsx scripts/validate-completion-notes.ts --strict  # full check
 *
 * Baseline Mode (default):
 *   - Reads scripts/validate-completion-notes.baseline.json
 *   - Reports only NEW missing completion notes (not in baseline)
 *   - Known missing notes from baseline are exempted
 *   - Use this for day-to-day development to catch NEW misses
 *
 * Strict Mode (--strict):
 *   - Performs full validation of all done stories
 *   - Use this for CI gates and release validation
 *
 * Exit codes:
 *   0 = all done stories have completion notes (strict)
 *   0 = no new missing completion notes (baseline)
 *   1 = one or more done stories are missing completion notes (strict)
 *   1 = one or more NEW missing completion notes (baseline)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const SPRINT_STATUS_PATH = resolve(
  process.cwd(),
  "_bmad-output/implementation-artifacts/sprint-status.yaml"
);

const STORIES_BASE = resolve(
  process.cwd(),
  "_bmad-output/implementation-artifacts/stories"
);

const BASELINE_PATH = resolve(
  process.cwd(),
  "scripts/validate-completion-notes.baseline.json"
);

const ACCEPTED_STATUSES = new Set(["done"]);

// -----------------------------------------------------------------------
// Help
// -----------------------------------------------------------------------

function showHelp() {
  console.log(`
🔍 Completion Notes Validation

Usage:
  npx tsx scripts/validate-completion-notes.ts              # baseline mode (default)
  npx tsx scripts/validate-completion-notes.ts --strict     # full check
  npx tsx scripts/validate-completion-notes.ts --help        # show this help

Modes:
  baseline (default)  Only NEW missing notes cause failure.
                       Known missing notes from baseline are exempted.
  strict              Full validation of all done stories.

Flags:
  --strict            Run full validation (no baseline exemptions)
  --help              Show this help message
`);
}

// -----------------------------------------------------------------------
// Arguments
// -----------------------------------------------------------------------

const args = process.argv.slice(2);
const strictMode = args.includes("--strict");
const generateBaseline = args.includes("--generate-baseline");
const helpMode = args.includes("--help");

if (helpMode) {
  showHelp();
  process.exit(0);
}

// -----------------------------------------------------------------------
// Generate baseline (hidden flag, used to bootstrap)
// -----------------------------------------------------------------------

if (generateBaseline) {
  const statuses = parseSprintStatus();
  const doneStories: Array<{ key: string; path: string }> = [];
  const missing: Array<{ key: string }> = [];

  for (const [key, status] of statuses) {
    if (ACCEPTED_STATUSES.has(status)) {
      const path = completionNotePath(key);
      if (path) doneStories.push({ key, path });
    }
  }

  const fs = require("node:fs");
  for (const { key, path } of doneStories) {
    try {
      fs.readFileSync(path, "utf-8");
    } catch {
      missing.push({ key });
    }
  }

  const baseline: Baseline = {
    version: 1,
    generated: new Date().toISOString(),
    totalMissing: missing.length,
    missing: missing.map(m => ({
      storyKey: m.key,
      epic: parseStoryKey(m.key)?.epic ?? 0
    }))
  };

  const { writeFileSync } = require("node:fs");
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), "utf-8");
  console.log(`\n   ✅ Baseline generated: ${BASELINE_PATH}`);
  console.log(`   Total known missing: ${missing.length}`);
  process.exit(0);
}

// -----------------------------------------------------------------------
// Baseline loading
// -----------------------------------------------------------------------

interface BaselineEntry {
  storyKey: string;
  epic: number;
}

interface Baseline {
  version: number;
  generated: string;
  totalMissing: number;
  missing: BaselineEntry[];
}

/**
 * Load baseline file. Returns null if baseline does not exist.
 */
function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) {
    return null;
  }
  try {
    const content = readFileSync(BASELINE_PATH, "utf-8");
    return JSON.parse(content) as Baseline;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------
// YAML parsing
// -----------------------------------------------------------------------

/**
 * Normalize a status value: lowercase, trimmed.
 */
function normalizeStatus(s: string): string {
  return s.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Parse sprint-status.yaml to extract story statuses.
 * Returns map of story-key → normalized status.
 *
 * Story keys in YAML look like:
 *   45-1-dead-code-audit-step: done
 *   45-5-fixture-standards: done
 *   epic-45: done
 */
function parseSprintStatus(): Map<string, string> {
  const content = readFileSync(SPRINT_STATUS_PATH, "utf-8");
  const statuses = new Map<string, string>();

  const epicLinePattern = /^\s*epic-(\d+)\s*:\s*([\w-]+)/;
  // Stories may have suffix after story number: e.g. 45-1-dead-code-audit-step
  // Story number part is the first two dot-free segments: 45-1
  const storyPattern = /^\s*(\d+-\d+(?:[-.\w+]+)?)\s*:\s*([\w-]+)/;

  const lines = content.split("\n");
  for (const line of lines) {
    const epicMatch = line.match(epicLinePattern);
    if (epicMatch) {
      // Skip epic-level entries (e.g. epic-45: done)
      continue;
    }
    const storyMatch = line.match(storyPattern);
    if (storyMatch) {
      const key = storyMatch[1];
      const status = normalizeStatus(storyMatch[2]);
      statuses.set(key, status);
    }
  }

  return statuses;
}

/**
 * Extract epic number and story number (without suffix) from a story key.
 *
 * Story key format: {epic}-{storyNum}[-suffix]
 * e.g. "45-1-dead-code-audit-step" → epic=45, storyNum="1"
 * e.g. "23-0-1-author-package-..." → epic=23, storyNum="0-1"
 *
 * The completion note filename uses dot notation: story-{epic}.{storyNum}.completion.md
 * e.g. story-45.1.completion.md
 */
function parseStoryKey(key: string): { epic: number; storyNum: string } | null {
  const parts = key.split("-");
  if (parts.length < 2) return null;

  const epicStr = parts[0];
  const epic = parseInt(epicStr, 10);
  if (isNaN(epic)) return null;

  // Story number is the second segment (e.g. "1" from "45-1-dead-code-audit-step")
  const storyNum = parts[1];

  return { epic, storyNum };
}

/**
 * Compute the expected completion note path for a given story key.
 * Uses dot notation to match existing completion note filename pattern:
 *   story-{epic}.{storyNum}.completion.md
 * e.g. story-45.1.completion.md
 */
function completionNotePath(key: string): string | null {
  const parsed = parseStoryKey(key);
  if (!parsed) return null;

  const { epic, storyNum } = parsed;
  return join(STORIES_BASE, `epic-${epic}`, `story-${epic}.${storyNum}.completion.md`);
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

function main() {
  console.log("\n🔍 Completion Notes Validation");
  console.log(`   File: ${SPRINT_STATUS_PATH}`);
  console.log(`   Mode: ${strictMode ? "STRICT (full check)" : "BASELINE (delta only)"}`);

  const baseline = loadBaseline();
  if (!strictMode && !baseline) {
    console.error("\n   ⚠️  No baseline file found. Run with --strict to perform full validation.");
    console.error(`   Create baseline: npx tsx scripts/validate-completion-notes.ts --generate-baseline`);
    process.exit(1);
  }

  const statuses = parseSprintStatus();
  const doneStories: Array<{ key: string; path: string }> = [];
  const missing: Array<{ key: string; path: string }> = [];

  for (const [key, status] of statuses) {
    if (ACCEPTED_STATUSES.has(status)) {
      const path = completionNotePath(key);
      if (path) {
        doneStories.push({ key, path });
      }
    }
  }

  console.log(`   Done stories found: ${doneStories.length}`);

  // Build set of known-missing story keys from baseline (for baseline mode)
  const knownMissingKeys = new Set<string>();
  if (baseline) {
    for (const entry of baseline.missing) {
      knownMissingKeys.add(entry.storyKey);
    }
    console.log(`   Baseline known missing: ${baseline.totalMissing}`);
  }

  // Check each done story for a completion note
  // We check synchronously using readFileSync to match CI expectations
  const fs = require("node:fs");
  for (const { key, path } of doneStories) {
    try {
      fs.readFileSync(path, "utf-8");
    } catch {
      missing.push({ key, path });
    }
  }

  if (missing.length === 0) {
    console.log(`\n   ✅ All ${doneStories.length} done stories have completion notes`);
    console.log("");
    process.exit(0);
  }

  // In strict mode, all missing are errors
  // In baseline mode, only NEW misses (not in baseline) are errors
  const newMissing = strictMode
    ? missing
    : missing.filter(({ key }) => !knownMissingKeys.has(key));

  const exemptedMissing = strictMode
    ? []
    : missing.filter(({ key }) => knownMissingKeys.has(key));

  if (strictMode) {
    console.log(`\n   ❌ ${missing.length} done story(ies) missing completion notes:`);
    for (const { key, path } of missing) {
      console.log(`   - ${key} → ${path}`);
    }
    console.log("");
    console.log("   Fix: Create the missing .completion.md files before marking stories done.");
    console.log("   Template: docs/templates/story-completion-template.md");
    console.log("");
    process.exit(1);
  }

  // Baseline mode
  if (exemptedMissing.length > 0) {
    console.log(`\n   📋 ${exemptedMissing.length} known missing (exempted via baseline):`);
    for (const { key } of exemptedMissing) {
      console.log(`   - ${key}`);
    }
  }

  if (newMissing.length === 0) {
    console.log(`\n   ✅ No NEW missing completion notes (baseline mode)`);
    console.log("   (All known missing notes are exempted via baseline)");
    console.log("");
    process.exit(0);
  }

  console.log(`\n   ❌ ${newMissing.length} NEW missing completion note(s):`);
  for (const { key, path } of newMissing) {
    console.log(`   - ${key} → ${path}`);
  }
  console.log("");
  console.log("   These stories were marked done AFTER the baseline was generated.");
  console.log("   Fix: Create the missing .completion.md files before marking stories done.");
  console.log("   Template: docs/templates/story-completion-template.md");
  console.log("");
  console.log("   To regenerate the baseline after creating completion notes:");
  console.log(`   npx tsx scripts/validate-completion-notes.ts --generate-baseline`);
  console.log("");
  process.exit(1);
}

main();
