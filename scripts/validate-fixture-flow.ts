#!/usr/bin/env tsx

/**
 * Fixture Flow Validator
 *
 * Enforcement target:
 * - apps/api/__test__/**.ts
 * - apps/api/src/lib/test-fixtures.ts
 *
 * Rule immutability:
 * Agents and contributors MUST NOT modify this validator unless explicitly
 * requested by the user or story owner in the active task.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

type Severity = "P0" | "P1" | "P2";

interface Violation {
  severity: Severity;
  ruleId: string;
  file: string;
  line: number;
  message: string;
}

const TEST_PREFIX = "apps/api/__test__/";
const FIXTURE_FILE = "apps/api/src/lib/test-fixtures.ts";

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function toLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function lineOfIndex(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}

function changedFiles(): string[] {
  const files = new Set<string>();

  const baseRef = process.env.GITHUB_BASE_REF;
  if (process.env.CI && baseRef) {
    const mergeBase = run(`git merge-base HEAD origin/${baseRef}`);
    if (mergeBase) {
      const diff = run(`git diff --name-only ${mergeBase}...HEAD`);
      diff
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((f) => files.add(f));
      return Array.from(files);
    }
  }

  [
    "git diff --name-only --cached",
    "git diff --name-only",
    "git ls-files --others --exclude-standard"
  ].forEach((cmd) => {
    const out = run(cmd);
    out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((f) => files.add(f));
  });

  return Array.from(files);
}

function allTargetFiles(): string[] {
  const files = new Set<string>();

  const trackedTests = run(`git ls-files "${TEST_PREFIX}**/*.ts"`);
  trackedTests
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((f) => files.add(f));

  const untrackedTests = run(`git ls-files --others --exclude-standard "${TEST_PREFIX}**/*.ts"`);
  untrackedTests
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((f) => files.add(f));

  files.add(FIXTURE_FILE);
  return Array.from(files);
}

function hasTeardownTag(lines: string[], line: number): boolean {
  const start = Math.max(1, line - 3);
  for (let i = start; i <= line; i++) {
    const content = lines[i - 1] ?? "";
    if (content.includes("@fixture-teardown-allowed")) {
      return true;
    }
  }
  return false;
}

function collectViolations(file: string): Violation[] {
  const abs = path.resolve(process.cwd(), file);
  const text = readFileSync(abs, "utf8");
  const lines = toLines(text);
  const out: Violation[] = [];

  const sqlWriteRegex = /\bsql\s*`[^`]*\b(INSERT|UPDATE|DELETE)\b[^`]*`/gi;

  if (file.startsWith(TEST_PREFIX) && file.endsWith(".ts")) {
    for (const match of text.matchAll(sqlWriteRegex)) {
      const idx = match.index ?? 0;
      const line = lineOfIndex(text, idx);
      const stmt = match[0] ?? "";

      if (hasTeardownTag(lines, line)) continue;

      if (/\b(module_roles|role_assignments)\b/i.test(stmt) && /\b(DELETE|UPDATE)\b/i.test(stmt)) {
        out.push({
          severity: "P0",
          ruleId: "FF-ACL-001",
          file,
          line,
          message: "Forbidden ACL write SQL in test file. Use canonical fixture helpers and scoped cleanup."
        });
      } else {
        out.push({
          severity: "P1",
          ruleId: "FF-TEST-001",
          file,
          line,
          message: "Raw setup write SQL in test file is forbidden. Move setup to canonical fixture helper."
        });
      }
    }
  }

  if (file === FIXTURE_FILE) {
    const mappingWriteRegex = /\bsql\s*`[^`]*\b(INSERT|UPDATE|DELETE)\b[^`]*\baccount_mappings\b[^`]*`/gi;
    for (const match of text.matchAll(mappingWriteRegex)) {
      const idx = match.index ?? 0;
      const line = lineOfIndex(text, idx);
      out.push({
        severity: "P1",
        ruleId: "FF-FIXTURE-STRICT-001",
        file,
        line,
        message: "Raw account_mappings write SQL in fixture library is forbidden. Use owner-package canonical flow."
      });
    }
  }

  return out;
}

function main(): void {
  const targets = allTargetFiles();

  if (targets.length === 0) {
    console.log("fixture-flow: no relevant files found; pass");
    return;
  }

  const violations = targets.flatMap((f) => {
    try {
      return collectViolations(f);
    } catch (error) {
      return [
        {
          severity: "P1" as const,
          ruleId: "FF-RUNTIME-001",
          file: f,
          line: 1,
          message: `Validator could not parse file: ${error instanceof Error ? error.message : String(error)}`
        }
      ];
    }
  });

  if (violations.length === 0) {
    console.log(`fixture-flow: pass (${targets.length} file(s) checked)`);
    return;
  }

  console.error("fixture-flow: violations detected");
  for (const v of violations) {
    console.error(`- [${v.severity}] ${v.ruleId} ${v.file}:${v.line} — ${v.message}`);
  }

  const blocking = violations.some((v) => v.severity === "P0" || v.severity === "P1");
  process.exit(blocking ? 1 : 0);
}

main();
