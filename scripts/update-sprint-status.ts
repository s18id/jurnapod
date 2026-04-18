#!/usr/bin/env tsx

/**
 * Canonical Sprint Status Update Utility
 *
 * Safely updates sprint-status.yaml without overwriting existing epic data.
 * Use this instead of manually editing the file.
 *
 * Usage:
 *   npx tsx scripts/update-sprint-status.ts --epic 45 --story 45-1-my-story --status done
 *   npx tsx scripts/update-sprint-status.ts --epic 45 --status in-progress
 *
 * Rules:
 *   - ALWAYS read existing file before modifying
 *   - APPEND only — never replace the entire file
 *   - Preserve all existing epic sections
 *   - Epic-level status updates update the epic header only
 *
 * Recovery if file is accidentally overwritten:
 *   git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const SPRINT_STATUS_PATH = resolve(
  process.cwd(),
  "_bmad-output/implementation-artifacts/sprint-status.yaml"
);

interface CliArgs {
  epic?: string;
  story?: string;
  status?: string;
  epicStatus?: string;
  dryRun?: boolean;
  help?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--epic") args.epic = argv[++i];
    else if (arg === "--story") args.story = argv[++i];
    else if (arg === "--status") args.status = argv[++i];
    else if (arg === "--epic-status") args.epicStatus = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }

  return args;
}

function validateArgs(args: CliArgs): void {
  const errors: string[] = [];

  if (!args.epic) errors.push("--epic is required (e.g., 45)");
  if (!args.story && !args.epicStatus)
    errors.push("--story or --epic-status is required");
  if (args.story && !args.status)
    errors.push("--status is required when updating a story");
  if (args.status && !["backlog", "ready-for-dev", "in-progress", "review", "done"].includes(args.status))
    errors.push(`--status must be one of: backlog, ready-for-dev, in-progress, review, done`);

  if (errors.length > 0) {
    console.error("Validation errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

function readSprintStatus(): string {
  try {
    return readFileSync(SPRINT_STATUS_PATH, "utf-8");
  } catch {
    console.error(`Error: Could not read ${SPRINT_STATUS_PATH}`);
    console.error("Has the file been deleted? Run: git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml");
    process.exit(1);
  }
}

function buildStoryLine(epic: string, story: string, status: string): string {
  const indentation = "  ";
  return `${indentation}${epic}-${story}: ${status}`;
}

function updateSprintStatus(content: string, args: CliArgs): string {
  const epic = args.epic!;
  const lines = content.split("\n");

  // Validate that this epic section exists
  const epicHeaderPattern = new RegExp(`^\\s*#\\s*Epic\\s+${epic}:`);
  const epicHeaderIdx = lines.findIndex((l) => epicHeaderPattern.test(l));

  if (epicHeaderIdx === -1) {
    console.error(`Error: Epic ${epic} section not found in sprint-status.yaml`);
    console.error("Available epics:");
    lines
      .filter((l) => l.match(/^##?\s*Epic\s+\d+:/))
      .forEach((l) => console.error(`  ${l.trim()}`));
    process.exit(1);
  }

  // Check if file was likely overwritten (too few lines for known epics)
  // Count ALL epic comment headers, not just this epic's header
  const anyEpicHeaderPattern = /^\s*#\s*Epic\s+\d+:/;
  const totalEpicHeaders = lines.filter((l) => anyEpicHeaderPattern.test(l)).length;
  // Warn if we see "epic-1:" but have far fewer epic headers than expected (~45)
  if (totalEpicHeaders < 10 && content.includes("epic-1:")) {
    console.warn("⚠️  Warning: This file appears to be missing many epic sections.");
    console.warn("⚠️  It may have been accidentally overwritten.");
    console.warn("⚠️  Run: git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml");
    console.warn("⚠️  Then re-run this script.\n");
    if (!args.dryRun) {
      process.exit(1);
    }
  }

  if (args.status && args.story) {
    // Update a story status
    const storyPattern = new RegExp(`^\\s*${epic}-${args.story}:`);
    const storyIdx = lines.findIndex((l) => storyPattern.test(l));

    if (storyIdx === -1) {
      // Story doesn't exist — append it after the epic header and epic status
      // Find the line after the epic status line
      const epicStatusPattern = new RegExp(`^\\s*epic-${epic}(?::|\\s)`);
      let insertIdx = lines.findIndex((l) => epicStatusPattern.test(l));
      if (insertIdx === -1) {
        // Fallback: insert after epic header
        insertIdx = epicHeaderIdx;
      }
      // Find the next non-comment, non-empty line after epic status
      while (
        insertIdx + 1 < lines.length &&
        (lines[insertIdx + 1].trim().startsWith("#") || lines[insertIdx + 1].trim() === "")
      ) {
        insertIdx++;
      }
      insertIdx++; // Move past the epic status line itself
      const newLine = buildStoryLine(epic, args.story, args.status);
      if (args.dryRun) {
        console.log(`[DRY RUN] Would add story: ${newLine}`);
      } else {
        lines.splice(insertIdx, 0, newLine);
        console.log(`✅ Added story: ${newLine}`);
      }
    } else {
      // Update existing story
      const oldLine = lines[storyIdx];
      const newLine = oldLine.replace(/:.+$/, `: ${args.status}`);
      if (oldLine !== newLine) {
        if (args.dryRun) {
          console.log(`[DRY RUN] Would change:\n  ${oldLine.trim()}\n  → ${newLine.trim()}`);
        } else {
          lines[storyIdx] = newLine;
          console.log(`✅ Updated story: ${newLine.trim()}`);
        }
      } else {
        console.log(`ℹ️  Story already has status '${args.status}' — no change needed.`);
      }
    }
  }

  if (args.epicStatus) {
    // Update epic-level status
    const epicStatusPattern = new RegExp(`^(\\s*epic-${epic})(?::|(\\s))`);
    const epicStatusIdx = lines.findIndex((l) => epicStatusPattern.test(l));

    if (epicStatusIdx === -1) {
      console.error(`Error: Could not find epic-${epic} status line`);
      process.exit(1);
    }

    const oldLine = lines[epicStatusIdx];
    const newLine = oldLine.replace(/:.+$/, `: ${args.epicStatus}`);
    if (oldLine !== newLine) {
      if (args.dryRun) {
        console.log(`[DRY RUN] Would change:\n  ${oldLine.trim()}\n  → ${newLine.trim()}`);
      } else {
        lines[epicStatusIdx] = newLine;
        console.log(`✅ Updated epic status: ${newLine.trim()}`);
      }
    } else {
      console.log(`ℹ️  Epic status already has status '${args.epicStatus}' — no change needed.`);
    }
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(`
Sprint Status Update Utility

Safely update sprint-status.yaml without overwriting existing data.

Usage:
  npx tsx scripts/update-sprint-status.ts --epic 45 --story 45-1-my-story --status done
  npx tsx scripts/update-sprint-status.ts --epic 45 --epic-status done
  npx tsx scripts/update-sprint-status.ts --epic 45 --story 45-1-my-story --status done --dry-run

Options:
  --epic N          Epic number (required)
  --story ID         Story ID within epic (e.g., 45-1-my-story)
  --status STATUS    New status for the story (backlog|ready-for-dev|in-progress|review|done)
  --epic-status      New status for the epic itself
  --dry-run          Show what would change without modifying the file
  --help, -h        Show this help message

Recovery:
  If sprint-status.yaml is accidentally overwritten:
  git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml

Rules:
  - ALWAYS reads existing file before modifying
  - APPENDS story entries — never replaces the file
  - PRESERVES all existing epic sections
  - Exits with error if file appears to have been overwritten (too few epics)
`);
    process.exit(0);
  }

  validateArgs(args);

  const originalContent = readSprintStatus();
  const newContent = updateSprintStatus(originalContent, args);

  if (!args.dryRun) {
    writeFileSync(SPRINT_STATUS_PATH, newContent, "utf-8");
  }

  if (args.dryRun) {
    console.log("\n[DRY RUN] No changes written. Use without --dry-run to apply.");
  } else {
    console.log(`\n✅ sprint-status.yaml updated successfully.`);
    console.log(`   File: ${SPRINT_STATUS_PATH}`);
  }
}

main();
