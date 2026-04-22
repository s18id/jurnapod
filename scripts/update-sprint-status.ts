#!/usr/bin/env tsx
/// <reference types="node" />

/**
 * Canonical Sprint Status Update Utility
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SPRINT_STATUS_PATH = resolve(
  process.cwd(),
  "_bmad-output/implementation-artifacts/sprint-status.yaml"
);

interface CliArgs {
  epic?: string;
  story?: string;
  title?: string;
  status?: string;
  epicStatus?: string;
  multi?: boolean;
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
    else if (arg === "--title") args.title = argv[++i];
    else if (arg === "--status") args.status = argv[++i];
    else if (arg === "--epic-status") args.epicStatus = argv[++i];
    else if (arg === "--multi") args.multi = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }

  return args;
}

function validateArgs(args: CliArgs): void {
  const errors: string[] = [];

  if (!args.epic) errors.push("--epic is required (e.g., 45)");
  if (!args.story && !args.epicStatus) {
    errors.push("--story or --epic-status is required");
  }
  if (args.story && !args.status) {
    errors.push("--status is required when updating a story");
  }
  if (args.title && !args.story) {
    errors.push("--title requires --story");
  }
  if (args.title && args.multi) {
    errors.push("--title cannot be used with --multi");
  }
  if (
    args.status &&
    !["backlog", "ready-for-dev", "in-progress", "review", "done"].includes(args.status)
  ) {
    errors.push("--status must be one of: backlog, ready-for-dev, in-progress, review, done");
  }

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
    console.error(
      "Has the file been deleted? Run: git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml"
    );
    process.exit(1);
  }
}

function buildStoryLine(storyKey: string, status: string): string {
  return `  ${storyKey}: ${status}`;
}

function findEpicSectionEnd(lines: string[], epicHeaderIdx: number): number {
  for (let i = epicHeaderIdx + 1; i < lines.length; i++) {
    if (/^\s*#\s*Epic\s+\d+:/.test(lines[i])) return i;
  }
  return lines.length;
}

function getEpicStatusIndex(lines: string[], epic: string, sectionStart: number, sectionEnd: number): number {
  const pattern = new RegExp(`^\\s*epic-${epic}:`);
  for (let i = sectionStart; i < sectionEnd; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

function getStoryKeysForEpic(lines: string[], sectionStart: number, sectionEnd: number): string[] {
  const storyKeys: string[] = [];
  const storyPattern = /^\s*(\d+-[^:]+):/;

  for (let i = sectionStart; i < sectionEnd; i++) {
    const match = lines[i].match(storyPattern);
    if (match) storyKeys.push(match[1]);
  }

  return storyKeys;
}

function normalizeStoryInput(epic: string, story: string): string {
  const value = story.trim();

  if (value.length === 0) {
    console.error("Error: --story cannot be empty");
    process.exit(1);
  }

  // Enforce strict dash notation only:
  // - N-X
  // - N-X-a
  // where bucket after N-X is exactly ONE letter [a-z]
  let normalized = value;

  // Normalize bracketed single-letter bucket: N-X-[a]-title -> N-X-a-title
  normalized = normalized.replace(/-\[([a-z])\](?=-|$)/gi, "-$1");

  // Reject placeholder class literal; require concrete letter (e.g. 6-1-a-title)
  if (/\[a-z\]/i.test(normalized)) {
    console.error(`Error: --story '${value}' is invalid.`);
    console.error("Use a concrete alpha bucket, e.g. '6-1-a-title' (not '[a-z]').");
    process.exit(1);
  }

  // Normalize compact one-letter bucket form: N-Xa-title -> N-X-a-title
  const compactBucketMatch = normalized.match(/^(\d+-\d+)([a-z])$/i);
  if (compactBucketMatch) {
    const [, prefix, bucket] = compactBucketMatch;
    normalized = `${prefix}-${bucket}`;
  }

  normalized = normalized.toLowerCase();

  const isNumericStory = /^\d+-\d+$/.test(normalized);
  const isBucketStory = /^\d+-\d+-[a-z]$/i.test(normalized);

  if (!isNumericStory && !isBucketStory) {
    console.error(`Error: --story '${value}' is invalid.`);
    console.error("Story input MUST be: 'N-X' OR 'N-X-a'.");
    console.error("Use --title for title part, e.g. --story 6-1-a --title platform-acl.");
    console.error("Bucket MUST be exactly one letter [a-z] (e.g., 6-1-a). Inputs like '6-1-aa' are invalid.");
    console.error("Do NOT use dot notation (49.3) or short form (3).");
    console.error(`If existing keys are malformed, run: npx tsx scripts/clean-sprint-status.ts --epic ${epic}`);
    process.exit(1);
  }

  const storyEpic = normalized.split("-")[0];
  if (storyEpic !== epic) {
    console.error(`Error: --story '${normalized}' targets epic ${storyEpic}, but --epic is ${epic}.`);
    process.exit(1);
  }

  return normalized;
}

function normalizeTitleInput(title: string): string {
  const value = title.trim();
  if (value.length === 0) {
    console.error("Error: --title cannot be empty");
    process.exit(1);
  }
  if (!/^[a-z0-9-]+$/i.test(value)) {
    console.error(`Error: --title '${title}' is invalid.`);
    console.error("Title MUST use dash notation only: lowercase letters, numbers, and '-' (e.g., my-title-name).");
    process.exit(1);
  }
  return value.toLowerCase();
}

function toLegacyCompactKey(key: string): string | null {
  const match = key.match(/^(\d+-\d+)-([a-z])(?:-(.+))?$/i);
  if (!match) return null;
  const [, prefix, bucket, tail] = match;
  return tail ? `${prefix}${bucket}-${tail}` : `${prefix}${bucket}`;
}

function resolveStoryKeys(epic: string, story: string, existingKeys: string[], allowMulti: boolean): string[] {
  const normalized = normalizeStoryInput(epic, story);

  const exactMatches = new Set<string>();
  const prefixMatches = new Set<string>();

  // 1) exact and canonical prefix matches
  for (const key of existingKeys) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === normalized) exactMatches.add(key);
    if (lowerKey.startsWith(`${normalized}-`)) prefixMatches.add(key);
  }

  // 2) Legacy compact bucket match support:
  //    N-Xa-title should be considered a match for N-X queries.
  if (/^\d+-\d+$/.test(normalized)) {
    const compactBucketPattern = new RegExp(`^${normalized}[a-z](?:-|$)`, "i");
    for (const key of existingKeys) {
      if (compactBucketPattern.test(key)) prefixMatches.add(key);
    }
  }

  const allMatches = existingKeys.filter((key) => exactMatches.has(key) || prefixMatches.has(key));
  if (allMatches.length === 1) return [allMatches[0]];

  if (allMatches.length > 1) {
    if (!allowMulti) {
      console.error(`\n❌ Error: Multiple existing keys match '${story}':`);
      allMatches.forEach((m) => console.error(`  - ${m}`));
      console.error("\nUse --multi to update all matches, or pass a more specific --story key.");
      console.error(`If these matches look malformed, run: npx tsx scripts/clean-sprint-status.ts --epic ${epic}`);
      process.exit(1);
    }

    return allMatches;
  }

  // 3) no match -> create normalized key
  return [normalized];
}

function updateSprintStatus(content: string, args: CliArgs): string {
  const epic = args.epic!;
  const lines = content.split("\n");

  const epicHeaderPattern = new RegExp(`^\\s*#\\s*Epic\\s+${epic}:`);
  const epicHeaderIdx = lines.findIndex((l) => epicHeaderPattern.test(l));

  if (epicHeaderIdx === -1) {
    console.error(`Error: Epic ${epic} section not found in sprint-status.yaml`);
    process.exit(1);
  }

  const anyEpicHeaderPattern = /^\s*#\s*Epic\s+\d+:/;
  const totalEpicHeaders = lines.filter((l) => anyEpicHeaderPattern.test(l)).length;
  if (totalEpicHeaders < 10 && content.includes("epic-1:")) {
    console.warn("⚠️  Warning: This file appears to be missing many epic sections.");
    console.warn("⚠️  It may have been accidentally overwritten.");
    console.warn("⚠️  Run: git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml");
    if (!args.dryRun) process.exit(1);
  }

  const sectionStart = epicHeaderIdx + 1;
  const sectionEnd = findEpicSectionEnd(lines, epicHeaderIdx);
  const epicStatusIdx = getEpicStatusIndex(lines, epic, sectionStart, sectionEnd);

  if (epicStatusIdx === -1) {
    console.error(`Error: Could not find epic-${epic} status line within Epic ${epic} section.`);
    console.error("Please repair sprint-status.yaml structure before updating stories.");
    process.exit(1);
  }

  if (args.status && args.story) {
    const storyKeys = getStoryKeysForEpic(lines, sectionStart, sectionEnd);
    let targetKeys: string[];

    if (args.title) {
      const normalizedTitle = normalizeTitleInput(args.title);
      targetKeys = [`${normalizeStoryInput(epic, args.story)}-${normalizedTitle}`];
    } else {
      targetKeys = resolveStoryKeys(epic, args.story, storyKeys, Boolean(args.multi));
    }

    for (const targetKey of targetKeys) {
      const escapedKey = targetKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const storyPattern = new RegExp(`^\\s*${escapedKey}:`);
      const storyIdx = lines.findIndex((l) => storyPattern.test(l));

      if (storyIdx === -1) {
        const legacyCompact = toLegacyCompactKey(targetKey);
        if (legacyCompact && storyKeys.includes(legacyCompact)) {
          console.error(`\n❌ Error: Found legacy malformed key '${legacyCompact}' for '${targetKey}'.`);
          console.error(`Run cleaner first: npx tsx scripts/clean-sprint-status.ts --epic ${epic} --fix`);
          process.exit(1);
        }

        // append within section, after last story key if any, else after epic status line
        let insertIdx = epicStatusIdx + 1;
        for (let i = epicStatusIdx + 1; i < sectionEnd; i++) {
          if (/^\s*\d+-[^:]+:/.test(lines[i])) {
            insertIdx = i + 1;
          }
        }

        const newLine = buildStoryLine(targetKey, args.status);
        if (args.dryRun) {
          console.log(`[DRY RUN] Would add story: ${newLine}`);
        } else {
          lines.splice(insertIdx, 0, newLine);
          console.log(`✅ Added story: ${newLine}`);
        }
      } else {
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
  }

  if (args.epicStatus) {
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

Usage:
  npx tsx scripts/update-sprint-status.ts --epic 46 --story 46-4 --status done
  npx tsx scripts/update-sprint-status.ts --epic 6 --story 6-1-a --title platform-acl --status done
  npx tsx scripts/update-sprint-status.ts --epic 6 --story 6-1 --status done --multi
  npx tsx scripts/update-sprint-status.ts --epic 46 --epic-status done
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
    console.log("\n✅ sprint-status.yaml updated successfully.");
    console.log(`   File: ${SPRINT_STATUS_PATH}`);
  }
}

main();
