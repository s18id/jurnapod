#!/usr/bin/env tsx

/**
 * Sprint Status Health Check
 *
 * Validates sprint-status.yaml has not been accidentally overwritten.
 * Run as part of CI to catch wholesale file replacement.
 *
 * Usage:
 *   npx tsx scripts/validate-sprint-status.ts
 *   npx tsx scripts/validate-sprint-status.ts --fail-under 40
 *
 * Exit codes:
 *   0 = healthy
 *   1 = validation failed (file appears overwritten)
 *   2 = file not found
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const SPRINT_STATUS_PATH = resolve(
  process.cwd(),
  "_bmad-output/implementation-artifacts/sprint-status.yaml"
);

const MIN_EXPECTED_EPICS = 40;

interface CliArgs {
  failUnder?: number;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fail-under") args.failUnder = parseInt(argv[++i], 10);
  }
  return args;
}

function validateSprintStatus(): { healthy: boolean; details: string[] } {
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

function main() {
  const args = parseArgs();
  const threshold = args.failUnder ?? MIN_EXPECTED_EPICS;

  console.log(`\n🔍 Sprint Status Health Check`);
  console.log(`   File: ${SPRINT_STATUS_PATH}`);
  console.log(`   Minimum expected epics: ${threshold}`);
  console.log("");

  const { healthy, details } = validateSprintStatus();

  details.forEach((d) => console.log(`   ${d}`));

  console.log("");

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

main();
