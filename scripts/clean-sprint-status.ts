#!/usr/bin/env tsx
/// <reference types="node" />

/**
 * Sprint Status Cleaner — detect and fix malformed story keys.
 *
 * Malformed rules:
 *   a) key contains a dot (.)
 *   b) key fails canonical pattern ^\d+-\d+(?:-[a-z0-9-]+)?$
 *   c) key epic prefix doesn't match enclosing epic section
 *
 * Fix behavior:
 *   - N-Xalpha  -> N-X-alpha (rename)
 *   - other malformed keys are removed
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SPRINT_STATUS_PATH = resolve(
  process.cwd(),
  "_bmad-output/implementation-artifacts/sprint-status.yaml"
);

type Action = "remove" | "rename";

interface Finding {
  line: number;
  key: string;
  reason: string;
  action: Action;
  replacementKey?: string;
}

interface FixStats {
  renamed: number;
  removed: number;
  skipped: number;
}

interface CliArgs {
  epic?: string;
  fix?: boolean;
  help?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--epic") args.epic = argv[++i];
    else if (arg === "--fix") args.fix = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }

  return args;
}

function showHelp(): void {
  console.log(`
Sprint Status Cleaner

Usage:
  npx tsx scripts/clean-sprint-status.ts                   # scan all epics (dry run)
  npx tsx scripts/clean-sprint-status.ts --epic 49         # scan epic 49 only (dry run)
  npx tsx scripts/clean-sprint-status.ts --epic 49 --fix   # apply fixes to epic 49
  npx tsx scripts/clean-sprint-status.ts --help

Options:
  --epic <N>   Scope to a single epic. If omitted, all epics are scanned.
  --fix        Apply renames/removals. Without this flag the script runs in dry-run mode.
  --help, -h   Show this help text.
`);
}

function readSprintStatus(): string {
  try {
    return readFileSync(SPRINT_STATUS_PATH, "utf-8");
  } catch {
    console.error(`Error: Could not read ${SPRINT_STATUS_PATH}`);
    process.exit(1);
  }
}

const CANONICAL_KEY_PATTERN = /^\d+-\d+(?:-[a-z0-9-]+)?$/;

function extractEpicNumber(epicHeaderLine: string): string | null {
  const match = epicHeaderLine.match(/^#\s*Epic\s+(\d+):/);
  return match ? match[1] : null;
}

function normalizeMissingHyphenSuffix(key: string): string | null {
  const match = key.match(/^(\d+-\d+)([a-z][a-z0-9-]*)$/i);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function analyzeStoryKey(key: string, epicNum: string): Finding | null {
  if (key.includes(".")) {
    return {
      line: 0,
      key,
      reason: "key contains a dot (.)",
      action: "remove",
    };
  }

  const prefix = key.split("-")[0];
  if (prefix !== epicNum) {
    return {
      line: 0,
      key,
      reason: `epic prefix "${prefix}" does not match epic ${epicNum}`,
      action: "remove",
    };
  }

  // Normalize safe malformed variants before deciding removal:
  // 1) lowercase-only normalization
  // 2) missing hyphen before alpha bucket (N-Xalpha -> N-X-alpha)
  const lowerCased = key.toLowerCase();
  const hyphenNormalized = normalizeMissingHyphenSuffix(lowerCased) ?? lowerCased;
  if (hyphenNormalized !== key && CANONICAL_KEY_PATTERN.test(hyphenNormalized)) {
    return {
      line: 0,
      key,
      reason: `normalize malformed key to canonical form (${hyphenNormalized})`,
      action: "rename",
      replacementKey: hyphenNormalized,
    };
  }

  if (!CANONICAL_KEY_PATTERN.test(key)) {

    return {
      line: 0,
      key,
      reason: `key fails canonical pattern (expected N-M or N-M-slug, got "${key}")`,
      action: "remove",
    };
  }

  return null;
}

function findSections(content: string, targetEpic: string | null): Array<{ epicNum: string; headerIdx: number; sectionEnd: number }> {
  const lines = content.split("\n");
  const sections: Array<{ epicNum: string; headerIdx: number; sectionEnd: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*#\s*Epic\s+(\d+):/);
    if (!match) continue;

    const epicNum = match[1];
    if (targetEpic && epicNum !== targetEpic) continue;

    let sectionEnd = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*#\s*Epic\s+\d+:/.test(lines[j])) {
        sectionEnd = j;
        break;
      }
    }

    sections.push({ epicNum, headerIdx: i, sectionEnd });
  }

  return sections;
}

function scanEpicSection(lines: string[], epicHeaderIdx: number, sectionEnd: number, epicNum: string): Finding[] {
  const findings: Finding[] = [];

  for (let i = epicHeaderIdx + 1; i < sectionEnd; i++) {
    const line = lines[i];
    const storyMatch = line.match(/^(\s*)(\S+):\s*\S+/);
    if (!storyMatch) continue;

    const [, , key] = storyMatch;
    if (key.startsWith("epic-")) continue;

    const finding = analyzeStoryKey(key, epicNum);
    if (finding) findings.push({ ...finding, line: i + 1 });
  }

  return findings;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyFixes(content: string, findings: Finding[]): { content: string; stats: FixStats } {
  const lines = content.split("\n");
  const sorted = [...findings].sort((a, b) => b.line - a.line);
  const existingKeys = new Set(
    lines
      .map((line) => line.match(/^\s*(\S+):\s*\S+/)?.[1])
      .filter((key): key is string => Boolean(key) && !key!.startsWith("epic-"))
  );
  const stats: FixStats = { renamed: 0, removed: 0, skipped: 0 };

  for (const finding of sorted) {
    const lineIdx = finding.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    if (finding.action === "rename" && finding.replacementKey) {
      if (finding.replacementKey !== finding.key && existingKeys.has(finding.replacementKey)) {
        console.warn(
          `⚠️  Rename collision at line ${finding.line}: '${finding.key}' -> '${finding.replacementKey}' (target exists). Removing malformed source key.`
        );
        lines.splice(lineIdx, 1);
        existingKeys.delete(finding.key);
        stats.removed += 1;
        continue;
      }

      lines[lineIdx] = lines[lineIdx].replace(
        new RegExp(`^(\\s*)${escapeRegex(finding.key)}:`),
        `$1${finding.replacementKey}:`
      );
      existingKeys.delete(finding.key);
      existingKeys.add(finding.replacementKey);
      stats.renamed += 1;
      continue;
    }

    lines.splice(lineIdx, 1);
    existingKeys.delete(finding.key);
    stats.removed += 1;
  }

  return { content: lines.join("\n"), stats };
}

function main(): void {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const content = readSprintStatus();
  const targetEpic = args.epic ?? null;
  const lines = content.split("\n");

  const sections = findSections(content, targetEpic);
  if (targetEpic && sections.length === 0) {
    console.error(`Error: Epic ${targetEpic} section not found in sprint-status.yaml`);
    process.exit(1);
  }

  const findings: Finding[] = [];
  for (const section of sections) {
    const sectionFindings = scanEpicSection(lines, section.headerIdx, section.sectionEnd, section.epicNum);
    findings.push(...sectionFindings);
  }

  if (findings.length === 0) {
    console.log("✅ No malformed story entries found.");
    process.exit(0);
  }

  console.log(`🔍 Found ${findings.length} malformed story entry(ies):\n`);
  for (const f of findings) {
    if (f.action === "rename" && f.replacementKey) {
      console.log(`  line ${f.line}: "${f.key}" → "${f.replacementKey}" — ${f.reason}`);
    } else {
      console.log(`  line ${f.line}: "${f.key}" — ${f.reason}`);
    }
  }

  if (!args.fix) {
    console.log("\n[DRY RUN] No changes written. Use --fix to apply renames/removals.");
    process.exit(0);
  }

  const result = applyFixes(content, findings);
  writeFileSync(SPRINT_STATUS_PATH, result.content, "utf-8");
  console.log(
    `\n✅ Applied fixes. Renamed: ${result.stats.renamed}, Removed: ${result.stats.removed}, Skipped: ${result.stats.skipped}. sprint-status.yaml updated.`
  );
  process.exit(0);
}

main();
