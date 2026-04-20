#!/usr/bin/env tsx
/// <reference types="node" />

/**
 * Structure Conformance Validation Script
 *
 * Scans active scope for structure violations and compares against baseline.
 * FAIL only on NEW violations not in baseline. Report baseline violations as tolerated debt.
 *
 * Usage:
 *   npx tsx scripts/validate-structure-conformance.ts
 *     # Uses default baseline: _bmad-output/planning-artifacts/file-structure-baseline.json
 *
 *   npx tsx scripts/validate-structure-conformance.ts --baseline <path>
 *     # Uses specified baseline JSON
 *
 * Exit codes:
 *   0 = PASS (0 new violations; baseline violations reported as info)
 *   1 = FAIL (new violations found — CI should fail)
 *   2 = ERROR (baseline not found or invalid)
 */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { cwd } from "node:process";

const DEFAULT_BASELINE = "_bmad-output/planning-artifacts/file-structure-baseline.json";
const DEFERRED_SCOPE = new Set([
  "apps/backoffice",
  "apps/pos",
  "packages/backoffice-sync",
  "packages/offline-db",
]);

interface BaselineViolation {
  id: string;
  ruleId: string;
  filePath: string;
  description: string;
  severity: string;
  justification?: string;
}

interface Baseline {
  version: string;
  created: string;
  epic: string;
  activeScope: string[];
  deferredScope: string[];
  violations: BaselineViolation[];
  deferredViolations: BaselineViolation[];
  statistics: {
    totalActiveViolations: number;
    totalDeferredViolations: number;
    byRule: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

interface FoundViolation {
  ruleId: string;
  filePath: string;
  description: string;
}

/** Rule definitions for structure enforcement */
interface Rule {
  id: string;
  pattern: RegExp;
  description: string;
  scope: "all" | "api" | "packages" | "modules";
}

const RULES: Rule[] = [
  {
    id: "FS-FORBIDDEN-003",
    pattern: /\.bak\d*$/,
    description: "Backup file (.bak, .bak2, etc.) in source tree",
    scope: "all",
  },
  {
    id: "FS-FORBIDDEN-002",
    pattern: /\.test\.ts$/,
    description: "Test file inside src/ instead of __test__/ directory",
    scope: "all",
  },
  {
    id: "FS-FORBIDDEN-002",
    pattern: /\.spec\.ts$/,
    description: "Test spec file inside src/ instead of __test__/ directory",
    scope: "all",
  },
];

interface CliArgs {
  baseline?: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--baseline") {
      args.baseline = argv[++i];
    }
  }
  return args;
}

/**
 * Recursively find all files that could be structure violations.
 * - TypeScript files (.ts, .tsx)
 * - Backup files (.bak, .bak2, .tmp, .orig, etc.)
 * Skips node_modules, .git, dist, __test__, and deferred scope directories.
 */
function findViolationCandidates(root: string, relativeRoot: string = ""): string[] {
  const files: string[] = [];
  const skippedDirs = new Set(["node_modules", ".git", "dist", ".opencode", "_bmad"]);

  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skippedDirs.has(entry.name)) continue;

        const relPath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;

        // Check if this directory or any parent is in deferred scope
        // DEFERRED_SCOPE contains full paths like "apps/backoffice", "apps/pos"
        let isDeferred = false;
        for (const deferred of DEFERRED_SCOPE) {
          if (relPath === deferred || relPath.startsWith(deferred + "/")) {
            isDeferred = true;
            break;
          }
        }
        if (isDeferred) continue;

        if (entry.name === "__test__") {
          // Skip test directories - they contain tests, not violations
          continue;
        }

        files.push(...findViolationCandidates(join(root, entry.name), relPath));
      } else {
        // Check if this file could be a violation
        const name = entry.name;
        const isTsFile = name.endsWith(".ts") || name.endsWith(".tsx");
        const isBackupFile = /\.(bak\d*|tmp|orig)$/.test(name);

        if (isTsFile || isBackupFile) {
          const relPath = relativeRoot ? `${relativeRoot}/${name}` : name;
          files.push(relPath);
        }
      }
    }
  } catch {
    // Directory not readable, skip
  }

  return files;
}

/**
 * Check if a file path is inside a __test__/ directory.
 */
function isInTestDir(filePath: string): boolean {
  const parts = filePath.split("/");
  return parts.includes("__test__");
}

/**
 * Check if a file is a test file.
 */
function isTestFile(filePath: string): boolean {
  return /\.test\.ts$/.test(filePath) || /\.spec\.ts$/.test(filePath);
}

/**
 * Scan a directory for structure violations.
 * Returns violations with their rule IDs and descriptions.
 */
function scanForViolations(rootPath: string): FoundViolation[] {
  const violations: FoundViolation[] = [];
  const files = findViolationCandidates(rootPath);

  for (const fileRelPath of files) {
    const fullPath = join(rootPath, fileRelPath);

    // Skip if file doesn't exist (e.g., due to readdir race)
    try {
      statSync(fullPath);
    } catch {
      continue;
    }

    // Check each rule
    for (const rule of RULES) {
      if (rule.pattern.test(fileRelPath)) {
        // For test file rule, verify it's actually inside src/ (not __test__/)
        if ((rule.id === "FS-FORBIDDEN-002") && isTestFile(fileRelPath)) {
          // Test files in __test__/ are fine; only flag those in src/
          if (isInTestDir(fileRelPath)) {
            continue;
          }
        }

        violations.push({
          ruleId: rule.id,
          filePath: fileRelPath,
          description: rule.description,
        });
      }
    }
  }

  return violations;
}

/**
 * Load and parse baseline JSON.
 */
function loadBaseline(baselinePath: string): { baseline: Baseline | null; error: string | null } {
  try {
    const content = readFileSync(baselinePath, "utf-8");
    const baseline = JSON.parse(content) as Baseline;

    // Validate required fields
    if (!baseline.violations || !Array.isArray(baseline.violations)) {
      return { baseline: null, error: "Invalid baseline: missing violations array" };
    }

    return { baseline, error: null };
  } catch (e) {
    if (e instanceof Error) {
      return { baseline: null, error: `Failed to load baseline: ${e.message}` };
    }
    return { baseline: null, error: "Failed to load baseline: unknown error" };
  }
}

/**
 * Create a unique key for a violation for comparison.
 */
function violationKey(v: { ruleId: string; filePath: string }): string {
  return `${v.ruleId}::${v.filePath}`;
}

/**
 * Main validation logic.
 */
function validate(
  rootPath: string,
  baselinePath: string
): { exitCode: number; newViolations: FoundViolation[]; baselineViolations: FoundViolation[] } {
  // Load baseline
  const { baseline, error } = loadBaseline(baselinePath);
  if (error || !baseline) {
    console.error(`❌ ERROR: ${error}`);
    return { exitCode: 2, newViolations: [], baselineViolations: [] };
  }

  console.log(`\n🔍 Structure Conformance Validation`);
  console.log(`   Baseline: ${baselinePath}`);
  console.log(`   Scope: ${rootPath}`);
  console.log(`   Baseline violations: ${baseline.statistics.totalActiveViolations}`);

  // Scan for violations
  const found = scanForViolations(rootPath);

  // Create sets for comparison
  const baselineKeys = new Set(baseline.violations.map((v) => violationKey(v)));
  const foundKeys = new Set(found.map((v) => violationKey(v)));

  // New violations: found but not in baseline
  const newViolations = found.filter((v) => !baselineKeys.has(violationKey(v)));

  // Baseline violations: found AND in baseline (tolerated debt)
  const baselineViolations = found.filter((v) => baselineKeys.has(violationKey(v)));

  return { exitCode: newViolations.length > 0 ? 1 : 0, newViolations, baselineViolations };
}

/**
 * Print validation results in CI-friendly format.
 */
function printResults(
  newViolations: FoundViolation[],
  baselineViolations: FoundViolation[],
  baselineStats: { totalActiveViolations: number } | null
): void {
  console.log("");
  console.log("   Results");
  console.log("   " + "─".repeat(50));

  // Report baseline violations as info
  if (baselineViolations.length > 0) {
    console.log(`   ℹ ${baselineViolations.length} baseline violation(s) found (tolerated debt):`);
    for (const v of baselineViolations) {
      console.log(`      - [${v.ruleId}] ${v.filePath}`);
    }
    console.log("");
  } else if (baselineStats && baselineStats.totalActiveViolations > 0) {
    console.log(
      `   ℹ ${baselineStats.totalActiveViolations} baseline violation(s) known but not currently present`
    );
    console.log("");
  }

  // Report new violations as errors
  if (newViolations.length > 0) {
    console.log(`   ❌ ${newViolations.length} NEW violation(s) found:`);
    for (const v of newViolations) {
      console.log(`      - [${v.ruleId}] ${v.filePath}`);
      console.log(`        ${v.description}`);
    }
    console.log("");
    console.log("   ❌ CI RATCHET: FAIL — new violations introduced");
    console.log("");
    console.log("   Fix required: resolve the above violations before merging.");
    return;
  }

  // No new violations
  if (baselineViolations.length > 0) {
    console.log("   ✅ CI RATCHET: PASS — no new violations");
    console.log(`      (${baselineViolations.length} baseline violation(s) tolerated)`);
  } else {
    console.log("   ✅ CI RATCHET: PASS — no violations found");
  }
  console.log("");
}

function main() {
  const args = parseArgs();

  // Resolve paths
  const rootPath = cwd();
  const baselinePath = resolve(rootPath, args.baseline ?? DEFAULT_BASELINE);

  // Check baseline exists
  if (!existsSync(baselinePath)) {
    console.error(`\n❌ ERROR: Baseline file not found: ${baselinePath}`);
    console.error("   Use --baseline <path> to specify a different baseline.");
    process.exit(2);
  }

  // Run validation
  const { exitCode, newViolations, baselineViolations } = validate(rootPath, baselinePath);

  // Load baseline for stats
  const { baseline } = loadBaseline(baselinePath);

  // Print results
  printResults(
    newViolations,
    baselineViolations,
    baseline?.statistics ?? null
  );

  process.exit(exitCode);
}

main();
