#!/usr/bin/env tsx
/// <reference types="node" />

/**
 * Sprint Status Validation Script
 *
 * Validates sprint-status.yaml integrity and epic-level gate conditions.
 * Run as part of CI to catch wholesale file replacement and enforce sprint closure gates.
 *
 * Usage:
 *   npx tsx scripts/validate-sprint-status.ts                    # integrity only (backward compatible)
 *   npx tsx scripts/validate-sprint-status.ts --epic <N>         # epic gate check (P0/P1 risk + story consistency)
 *
 * Exit codes:
 *   0 = healthy / gate passed
 *   1 = validation failed
 *   2 = file not found
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const SPRINT_STATUS_PATH = resolve(
  process.cwd(),
  "_bmad-output/implementation-artifacts/sprint-status.yaml"
);

const PLANNING_ARTIFACTS_PATH = resolve(
  process.cwd(),
  "_bmad-output/planning-artifacts"
);

const MIN_EXPECTED_EPICS = 40;

const ACCEPTED_STATUSES = new Set(["backlog", "ready-for-dev", "in-progress", "review", "done"]);

interface CliArgs {
  epic?: number;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--epic") args.epic = parseInt(argv[++i], 10);
  }
  return args;
}

function validateSprintStatusIntegrity(): {
  healthy: boolean;
  details: string[];
} {
  const details: string[] = [];
  let content: string;

  try {
    content = readFileSync(SPRINT_STATUS_PATH, "utf-8");
  } catch {
    return {
      healthy: false,
      details: [`Could not read ${SPRINT_STATUS_PATH}`],
    };
  }

  const lines = content.split("\n");

  // Count epic comment headers
  const epicHeaderPattern = /^\s*#\s*Epic\s+\d+:/;
  const epicHeaders = lines.filter((l) => epicHeaderPattern.test(l)).length;

  // Count epic-N: entries (both done and total)
  const epicEntryPattern = /^\s*epic-\d+:/;
  const epicEntries = lines.filter((l) => epicEntryPattern.test(l)).length;

  details.push(`Epic comment headers: ${epicHeaders}`);
  details.push(`Epic status entries: ${epicEntries}`);

  // Check for presence of early epics (indicates file wasn't wiped)
  const hasEpic1 = content.includes("epic-1:");
  const hasEpic10 = content.includes("epic-10:");
  const hasEpic20 = content.includes("epic-20:");
  const hasEpic30 = content.includes("epic-30:");
  const hasEpic40 = content.includes("epic-40:");
  const hasEpic45 = content.includes("epic-45:");

  details.push(`Has epic-1: ${hasEpic1}`);
  details.push(`Has epic-10: ${hasEpic10}`);
  details.push(`Has epic-20: ${hasEpic20}`);
  details.push(`Has epic-30: ${hasEpic30}`);
  details.push(`Has epic-40: ${hasEpic40}`);
  details.push(`Has epic-45: ${hasEpic45}`);

  // Validation rules
  const threshold = MIN_EXPECTED_EPICS;
  const isHealthy = epicHeaders >= threshold && hasEpic1;

  if (!isHealthy) {
    if (epicHeaders < threshold) {
      details.push(
        `❌ FAIL: Only ${epicHeaders} epic headers found, expected >= ${threshold}`
      );
    }
    if (!hasEpic1) {
      details.push(`❌ FAIL: epic-1 not found — file may have been overwritten`);
    }
  } else {
    details.push(`✅ PASS: ${epicHeaders} epic headers — file appears healthy`);
  }

  return { healthy: isHealthy, details };
}

/**
 * Normalize a status value: lowercase, trimmed.
 * Handles variations like "done", "Done", " done", "in-progress", "in_progress".
 */
function normalizeStatus(s: string): string {
  return s.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Parse sprint-status.yaml to extract epic and story statuses.
 * Normalizes all status values for consistent comparison.
 */
function parseSprintStatus(): Map<string, string> {
  const content = readFileSync(SPRINT_STATUS_PATH, "utf-8");
  const statuses = new Map<string, string>();

  // Epic lines: "epic-48: done" or "epic-48: in-progress"
  const epicPattern = /^\s*epic-(\d+)\s*:\s*([\w-]+)/;
  // Story lines: "48-5-ci-quality-gate-enforcement: done"
  // Stories may have dots in filenames but YAML keys use dashes/hyphens
  const storyPattern = /^\s*(\d+-\d+(?:[-.\w+]+)?)\s*:\s*([\w-]+)/;
  const lines = content.split("\n");
  for (const line of lines) {
    const epicMatch = line.match(epicPattern);
    if (epicMatch) {
      statuses.set(`epic-${epicMatch[1]}`, normalizeStatus(epicMatch[2]));
      continue;
    }
    const storyMatch = line.match(storyPattern);
    if (storyMatch) {
      statuses.set(storyMatch[1], normalizeStatus(storyMatch[2]));
    }
  }

  return statuses;
}

/**
 * Validate that all epic and story statuses in the parsed map are within accepted values.
 * Returns a list of errors: ["line N: key 'foo' has invalid status 'bar' (allowed: ...)"]
 */
function validateStatusValues(statuses: Map<string, string>): string[] {
  const errors: string[] = [];
  const content = readFileSync(SPRINT_STATUS_PATH, "utf-8");
  const lines = content.split("\n");

  // Epic lines: "epic-48: done"
  const epicPattern = /^\s*epic-(\d+)\s*:\s*([\w-]+)/;
  // Story lines: "48-5-ci-quality-gate-enforcement: done"
  const storyPattern = /^\s*(\d+-\d+(?:[-.\w+]+)?)\s*:\s*([\w-]+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const epicMatch = line.match(epicPattern);
    if (epicMatch) {
      const key = `epic-${epicMatch[1]}`;
      const status = normalizeStatus(epicMatch[2]);
      if (!ACCEPTED_STATUSES.has(status)) {
        errors.push(
          `line ${i + 1}: key '${key}' has invalid status '${status}' (allowed: ${[...ACCEPTED_STATUSES].join(", ")})`
        );
      }
      continue;
    }
    const storyMatch = line.match(storyPattern);
    if (storyMatch) {
      const key = storyMatch[1];
      const status = normalizeStatus(storyMatch[2]);
      if (!ACCEPTED_STATUSES.has(status)) {
        errors.push(
          `line ${i + 1}: key '${key}' has invalid status '${status}' (allowed: ${[...ACCEPTED_STATUSES].join(", ")})`
        );
      }
    }
  }

  return errors;
}

/**
 * Get the list of story keys for a given epic number by scanning the yaml.
 */
function getEpicStories(epicNum: number, statuses: Map<string, string>): string[] {
  const epicKey = `epic-${epicNum}`;
  const epicStatus = statuses.get(epicKey);
  if (!epicStatus) return [];

  const prefix = `${epicNum}-`;
  const stories: string[] = [];
  for (const key of statuses.keys()) {
    if (key.startsWith(prefix) && !key.startsWith(`epic-${epicNum}`)) {
      stories.push(key);
    }
  }
  return stories;
}

/**
 * Read risk register for an epic and extract risks with their severity and status.
 * Uses column-split parsing for robustness instead of fragile regex.
 *
 * Expected markdown table columns:
 * | Risk ID | Severity | ... | Mitigation Plan | ... | Status |
 *
 * Column indices (0-based, split by |):
 *   0 = (empty before first |)
 *   1 = Risk ID
 *   2 = Severity
 *   3 = Domain
 *   4 = Risk Statement
 *   5 = Trigger / Symptom
 *   6 = Mitigation Plan
 *   7 = Owner
 *   8 = SLA
 *   9 = Status
 */
interface RiskEntry {
  id: string;
  severity: string;
  status: string;
}

function getRiskRegisterEpics(epicNum: number): RiskEntry[] {
  const riskPath = join(
    PLANNING_ARTIFACTS_PATH,
    `epic-${epicNum}-risk-register.md`
  );
  if (!existsSync(riskPath)) return [];

  const content = readFileSync(riskPath, "utf-8");
  const risks: RiskEntry[] = [];

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // Skip separator rows (|----|...)
    if (/^\|[-:\s]+\|$/.test(trimmed)) continue;

    // Split by | and trim each cell
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // Require at least 9 cells (empty leading cell + Risk ID + Severity + ... + Status at index 8)
    if (cells.length < 9) continue;

    // Risk ID is at column index 0, Severity at 1, Status at 8
    const riskId = cells[0];
    const severity = cells[1];
    const status = cells[8];

    // Only capture P0-P3 risks by ID pattern
    if (!/^R\d+-\d+$/.test(riskId)) continue;
    if (!/^P[0-3]$/.test(severity)) continue;
    if (!status) continue;

    // Strip surrounding bold markers (e.g. "**closed**" → "closed")
    const cleanStatus = status.replace(/\*\*/g, "").trim().toLowerCase();

    risks.push({ id: riskId, severity, status: cleanStatus });
  }

  return risks;
}

interface GateResult {
  passed: boolean;
  epic: number;
  errors: string[];
  warnings: string[];
  details: string[];
}

function validateEpicGate(epicNum: number): GateResult {
  const result: GateResult = {
    passed: true,
    epic: epicNum,
    errors: [],
    warnings: [],
    details: [],
  };

  const statuses = parseSprintStatus();
  const epicKey = `epic-${epicNum}`;
  const epicStatus = statuses.get(epicKey);

  // 1. Check epic exists
  if (!epicStatus) {
    result.passed = false;
    result.errors.push(
      `❌ Epic ${epicNum} not found in sprint-status.yaml`
    );
    return result;
  }

  result.details.push(`Epic ${epicNum} status: ${epicStatus}`);

  // 2. Story consistency: if epic is "done", all its stories must be "done"
  const stories = getEpicStories(epicNum, statuses);
  result.details.push(`Stories found for epic-${epicNum}: ${stories.length}`);

  if (stories.length > 0) {
    const notDone = stories.filter((s) => {
      const st = statuses.get(s);
      return st !== "done";
    });

    if (notDone.length > 0) {
      if (epicStatus === "done") {
        result.passed = false;
        result.errors.push(
          `❌ Epic ${epicNum} is marked 'done' but ${notDone.length} story(ies) are not done: ${notDone.join(", ")}`
        );
      } else {
        result.warnings.push(
          `⚠ Epic ${epicNum} is '${epicStatus}' and ${notDone.length} story(ies) not done: ${notDone.join(", ")}`
        );
      }
    } else {
      result.details.push(
        `✅ All ${stories.length} stories under epic-${epicNum} are done`
      );
    }
  }

  // 3. Risk gate rule:
  //    - if epic is "done": fail when any P0/P1 risk is not closed or approved-carry-over
  //    - if epic is NOT done: report unresolved risks as info/warn, do not fail
  const risks = getRiskRegisterEpics(epicNum);
  const openP0P1 = risks.filter(
    (r) =>
      (r.severity === "P0" || r.severity === "P1") &&
      r.status !== "closed" &&
      r.status !== "approved-carry-over"
  );

  if (epicStatus === "done") {
    if (openP0P1.length > 0) {
      result.passed = false;
      result.errors.push(
        `❌ Epic ${epicNum}: ${openP0P1.length} unresolved P0/P1 risk(s) in risk register: ${openP0P1.map((r) => `${r.id}(${r.severity}, ${r.status})`).join(", ")}`
      );
    } else {
      result.details.push(
        `✅ No open P0/P1 risks in epic-${epicNum} risk register`
      );
    }
  } else {
    // Epic not done: report open P0/P1 as warning (not failure)
    if (openP0P1.length > 0) {
      result.warnings.push(
        `⚠ Epic ${epicNum} has ${openP0P1.length} open P0/P1 risk(s) — risk gate will be enforced when epic is marked done: ${openP0P1.map((r) => `${r.id}(${r.severity}, ${r.status})`).join(", ")}`
      );
    } else {
      result.details.push(
        `✅ No open P0/P1 risks in epic-${epicNum} risk register (gate deferred until epic is done)`
      );
    }
  }

  return result;
}

function printGateResult(result: GateResult): void {
  console.log(`\n   Epic ${result.epic} Gate Check`);
  console.log(`   ${"─".repeat(50)}`);
  result.details.forEach((d) => console.log(`   ${d}`));
  if (result.warnings.length > 0) {
    result.warnings.forEach((w) => console.log(`   ${w}`));
  }
  if (result.errors.length > 0) {
    result.errors.forEach((e) => console.log(`   ${e}`));
  }
  console.log("");
  if (result.passed) {
    console.log(`   ✅ Sprint ${result.epic} closure gate: GO`);
  } else {
    console.log(`   ❌ Sprint ${result.epic} closure gate: NO-GO`);
  }
}

function main() {
  const args = parseArgs();

  console.log(`\n🔍 Sprint Status Validation`);
  console.log(`   File: ${SPRINT_STATUS_PATH}`);

  // No epic arg: run integrity check only (backward compatible)
  if (args.epic === undefined) {
    console.log(`   Mode: integrity check only`);
    console.log("");

    const { healthy, details } = validateSprintStatusIntegrity();
    details.forEach((d) => console.log(`   ${d}`));
    console.log("");

    // Strict status value validation — always runs
    const statusErrors = validateStatusValues(parseSprintStatus());
    if (statusErrors.length > 0) {
      console.log("❌ Status value validation failed:");
      statusErrors.forEach((e) => console.log(`   ${e}`));
      console.log("");
      console.log("✅ sprint-status.yaml is healthy (append-only structure OK)");
      console.log("   but status values above are invalid. Fix them before proceeding.");
      process.exit(1);
    }

    if (healthy) {
      console.log("✅ sprint-status.yaml is healthy");
      process.exit(0);
    } else {
      console.log("❌ sprint-status.yaml appears to have been overwritten!");
      console.log("");
      console.log("   Recovery:");
      console.log(
        `   git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
      );
      process.exit(1);
    }
  }

  // Epic arg: run full epic gate check
  console.log(`   Mode: epic ${args.epic} gate check`);
  const gateResult = validateEpicGate(args.epic!);
  printGateResult(gateResult);

  // Strict status value validation — always runs on epic gate too
  const statusErrors = validateStatusValues(parseSprintStatus());
  if (statusErrors.length > 0) {
    console.log("❌ Status value validation failed:");
    statusErrors.forEach((e) => console.log(`   ${e}`));
    gateResult.passed = false;
  }

  if (!gateResult.passed) {
    console.log("");
    console.log("   Fix required before epic can be marked done:");
    gateResult.errors.forEach((e) => console.log(`   - ${e}`));
    process.exit(1);
  }

  process.exit(0);
}

main();
