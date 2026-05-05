#!/usr/bin/env tsx
/// <reference types="node" />

/**
 * Lint Migrations — CI Gate for AGENTS.md §C
 *
 * Scans SQL migration files for CREATE TRIGGER statements containing
 * business-logic enforcement (SIGNAL SQLSTATE). Detects violations of
 * the "no new business DB triggers" policy.
 *
 * Usage:
 *   npx tsx scripts/lint-migrations.ts                           # scan all migrations
 *   npx tsx scripts/lint-migrations.ts --stdin                   # read from stdin
 *   npx tsx scripts/lint-migrations.ts --file <path>             # scan single file
 *   npx tsx scripts/lint-migrations.ts --help                    # show help
 *
 * Exit codes:
 *   0 = no violations (or all violations annotated)
 *   1 = violations found
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LintResult {
  /** Migration file name (or `<stdin>` for pipe mode) */
  filename: string;
  /** Name of the trigger that triggered the violation */
  triggerName: string;
  /** 1-indexed line where CREATE TRIGGER appears */
  line: number;
  /** Human-readable violation description */
  message: string;
}

/** Parsed trigger block from content scanning */
interface ParsedTrigger {
  name: string;
  line: number; // 1-indexed
  body: string;
  hasAnnotation: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure function: lint migration content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan migration content for business-logic trigger violations.
 *
 * Detection rules:
 * 1. Find all `CREATE TRIGGER` statements.
 * 2. If the line immediately before `CREATE TRIGGER` contains
 *    `-- lint:allow-business-trigger`, skip (explicitly allowed).
 * 3. If trigger body contains `SIGNAL SQLSTATE`, it is a business-logic
 *    trigger and a violation is recorded.
 * 4. Audit-only triggers (SET NEW.field without SIGNAL) pass silently.
 *
 * @param content  Full file content as a string.
 * @param filename File name (used in output; default `"<input>"`).
 * @returns Array of lint violations (empty = clean).
 */
export function lintMigrationsContent(
  content: string,
  filename: string = "<input>"
): LintResult[] {
  const results: LintResult[] = [];
  const lines = content.split("\n");
  const triggers = extractTriggers(lines);

  for (const trigger of triggers) {
    if (trigger.hasAnnotation) {
      continue; // explicitly allowed
    }

    if (isBusinessLogicTrigger(trigger.body)) {
      results.push({
        filename,
        triggerName: trigger.name,
        line: trigger.line,
        message: `Business-logic trigger '${trigger.name}' without '-- lint:allow-business-trigger' annotation (line ${trigger.line}). Add annotation or move logic to application code. See AGENTS.md §C.`,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection helpers
// ─────────────────────────────────────────────────────────────────────────────

const CREATE_TRIGGER_RE =
  /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?(\w+)`?\.)?`?(\w+)`?/i;

/**
 * Extract trigger definitions from source lines.
 * Handles MySQL/MariaDB trigger syntax:
 * - `BEGIN ... END` blocks (multi-statement)
 * - Single SQL statements (no BEGIN/END)
 * - One-liner `SIGNAL SQLSTATE` triggers
 */
function extractTriggers(lines: string[]): ParsedTrigger[] {
  const triggers: ParsedTrigger[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(CREATE_TRIGGER_RE);
    if (!match) continue;

    const triggerName = match[2] ?? match[1] ?? "unknown";
    const line = i + 1; // 1-indexed

    // Check annotation on line immediately before
    const hasAnnotation =
      i > 0 && lines[i - 1].includes("-- lint:allow-business-trigger");

    // Skip past DROP TRIGGER (if any) and the CREATE TRIGGER header lines
    // to reach the body. The header ends at the line after FOR EACH ROW.
    let bodyStart = i;
    for (let k = i; k < lines.length; k++) {
      if (/^\s*FOR\s+EACH\s+ROW\b/i.test(lines[k])) {
        bodyStart = k + 1;
        break;
      }
    }

    // Collect body from bodyStart
    const bodyLines: string[] = [];
    let depth = 0;
    let inBlock = false;
    let j: number;

    for (j = bodyStart; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      const trimmedUpper = trimmed.toUpperCase();

      // Stop at next CREATE/ALTER/DROP TRIGGER (would be a new trigger definition)
      if (
        j > bodyStart &&
        /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s/i.test(lines[j])
      ) {
        break;
      }

      // Track BEGIN/END nesting
      if (/^\s*BEGIN\b/i.test(lines[j])) {
        inBlock = true;
        depth++;
        bodyLines.push(lines[j]);
        continue;
      }

      if (/^\s*END\b/i.test(lines[j]) && !trimmed.includes("--")) {
        if (inBlock) {
          depth--;
          bodyLines.push(lines[j]);
          if (depth === 0) break; // END complete
          continue;
        }
      }

      bodyLines.push(lines[j]);

      // For non-block triggers: single SQL statement ends at `;`
      // But need to handle multi-line function calls like SET col = IF(...)
      if (!inBlock) {
        // Simple heuristic: lines ending with `;` and not containing
        // unclosed parentheses signal end of non-block trigger
        const trimmedClean = trimmed.replace(/--.*$/, "").trimEnd();
        if (trimmedClean.endsWith(";")) {
          // Check for unclosed parens in the body so far
          const bodyText = bodyLines.join("\n");
          const openParens = (bodyText.match(/\(/g) || []).length;
          const closeParens = (bodyText.match(/\)/g) || []).length;
          if (openParens <= closeParens) break;
        }
      }
    }

    triggers.push({
      name: triggerName,
      line,
      body: bodyLines.join("\n"),
      hasAnnotation,
    });

    i = j; // skip ahead
  }

  return triggers;
}

/**
 * Determine whether trigger body contains business-logic enforcement.
 * Business-logic triggers signal SQLSTATE to block operations.
 */
function isBusinessLogicTrigger(body: string): boolean {
  // SIGNAL SQLSTATE with any message text = business enforcement
  return /SIGNAL\s+SQLSTATE/i.test(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI — filesystem scanner
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = resolve(
  __dirname,
  "..",
  "packages/db/migrations"
);

/** Resolve migration directory relative to project root */
function resolveMigrationsDir(override?: string): string {
  if (override) return resolve(override);
  // Walk up from scripts/ to find the project root
  const cwd = process.cwd();
  const candidate = resolve(cwd, "packages/db/migrations");
  if (existsSync(candidate)) return candidate;
  // Fallback: relative from script
  return resolve(__dirname, "..", "packages/db/migrations");
}

/**
 * Find all .sql migration files in the migrations directory.
 * Returns file paths sorted alphabetically (by prefix number).
 */
function findMigrationFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    console.error(`Migrations directory not found: ${dir}`);
    process.exit(2);
  }

  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => resolve(dir, f));
}

/**
 * Print lint results to stdout.
 * @returns Number of violations found.
 */
function printResults(results: LintResult[]): number {
  if (results.length === 0) {
    console.log("✅ No migration lint violations found.");
    return 0;
  }

  console.error(`❌ Found ${results.length} migration lint violation(s):\n`);

  for (const r of results) {
    console.error(`  File: ${r.filename}`);
    console.error(`  Trigger: ${r.triggerName} (line ${r.line})`);
    console.error(`  ${r.message}\n`);
  }

  return results.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main — CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage:
  npx tsx scripts/lint-migrations.ts                    Scan all migration files
  npx tsx scripts/lint-migrations.ts --stdin             Read migration from stdin
  npx tsx scripts/lint-migrations.ts --file <path>       Scan single file
  npx tsx scripts/lint-migrations.ts --dir <path>        Scan custom directory

Exit codes:
  0 = No violations
  1 = Violations found
  2 = Directory not found / error
`);
    process.exit(0);
  }

  // --stdin mode: read from pipe
  if (args.includes("--stdin")) {
    const stdin = process.stdin;
    const chunks: Buffer[] = [];

    stdin.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stdin.on("end", () => {
      const content = Buffer.concat(chunks).toString("utf-8");
      const results = lintMigrationsContent(content, "<stdin>");
      const count = printResults(results);
      process.exit(count > 0 ? 1 : 0);
    });

    stdin.on("error", (err) => {
      console.error(`Error reading stdin: ${err.message}`);
      process.exit(2);
    });

    return; // async — don't continue to sync mode
  }

  // --file mode: scan single file
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const filePath = resolve(process.cwd(), args[fileIdx + 1]);
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(2);
    }
    const content = readFileSync(filePath, "utf-8");
    const results = lintMigrationsContent(
      content,
      filePath
    );
    const count = printResults(results);
    process.exit(count > 0 ? 1 : 0);
  }

  // --dir mode: scan custom directory
  const dirIdx = args.indexOf("--dir");
  const migrationsDir =
    dirIdx !== -1 && args[dirIdx + 1]
      ? resolve(process.cwd(), args[dirIdx + 1])
      : resolveMigrationsDir();

  const files = findMigrationFiles(migrationsDir);
  const allResults: LintResult[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const results = lintMigrationsContent(content, file);
    allResults.push(...results);
  }

  const count = printResults(allResults);
  process.exit(count > 0 ? 1 : 0);
}

// Only run main when invoked directly (not imported by test)
if (require.main === module) {
  main();
}
