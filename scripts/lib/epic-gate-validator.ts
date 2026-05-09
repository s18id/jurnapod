#!/usr/bin/env tsx
/// <reference types="node" />

/**
 * Reusable Epic Gate Validator.
 *
 * Validates epic close conditions: story completion, evidence presence,
 * critical test suites, and typecheck. Emits machine-readable gate lines.
 *
 * Usage:
 *   npx tsx scripts/validate-epic-gates.ts --epic 59
 *   npx tsx scripts/validate-epic-gates.ts --epic 60
 *
 * Thin wrappers (validate-epic-NN-gates.ts) can call validateEpicGates()
 * directly with epic-specific configuration.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────

export interface GateRecord {
  version: number;
  gate: string;
  description?: string;
  pass: boolean;
  detail: string;
}

export interface TestSuite {
  name: string;
  workspace: string;
  testFile: string;
}

export interface EpicGateConfig {
  epic: number;
  label: string;
  testSuites: TestSuite[];
  /** Optional: verify additional evidence files exist */
  evidenceFiles?: string[];
  /** Optional: custom gate logic functions returning GateRecord */
  customGates?: Array<() => GateRecord | Promise<GateRecord>>;
}

export interface EpicGateResult {
  epic: number;
  pass: boolean;
  gates: GateRecord[];
}

// ── YAML Parser (minimal, no dependencies) ────────────────────────────────

interface SprintStatus {
  development_status?: Record<string, string>;
}

function parseSprintStatus(path: string): SprintStatus {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf-8");
  const status: SprintStatus = { development_status: {} };
  let currentEpic: string | null = null;

  for (const line of content.split("\n")) {
    // Comment lines
    if (line.trim().startsWith("#")) continue;
    // Empty
    if (!line.trim()) continue;

    // Epic header: "  epic-NN: done"
    const epicMatch = line.match(/^\s+epic-(\d+):\s*(.+)$/);
    if (epicMatch) {
      currentEpic = epicMatch[1];
      status.development_status![`epic-${currentEpic}`] = epicMatch[2].trim();
      continue;
    }

    // Story line: "  NN-M-some-title: status"
    if (currentEpic) {
      const storyMatch = line.match(/^\s+(\d+-\d+\S*):\s*(.+)$/);
      if (storyMatch) {
        status.development_status![storyMatch[1]] = storyMatch[2].trim();
      }
    }
  }

  return status;
}

function getStoryKeysForEpic(status: SprintStatus, epic: number): string[] {
  const prefix = `${epic}-`;
  return Object.keys(status.development_status ?? {}).filter(
    (k) => k.startsWith(prefix) && !k.startsWith(`epic-`)
  );
}

// ── Gate Helpers ──────────────────────────────────────────────────────────

export function emitGate(prefix: string, record: GateRecord): void {
  console.log(`${prefix}${JSON.stringify(record)}`);
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, timeout: timeoutMs });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

async function runTestSuite(
  suite: TestSuite,
  root: string,
  timeoutMs: number,
  gateTag: string
): Promise<GateRecord> {
  const result = await runCommand(
    "npm",
    ["run", "test:single", "-w", `@jurnapod/${suite.workspace}`, "--", suite.testFile],
    root,
    timeoutMs
  );

  const pass = result.exitCode === 0;

  return {
    version: 1,
    gate: gateTag,
    description: `Test suite: ${suite.name}`,
    pass,
    detail: pass ? "passed" : result.stderr.slice(0, 200),
  };
}

async function runTypecheck(
  root: string,
  workspace: string,
  timeoutMs: number,
  gateTag: string
): Promise<GateRecord> {
  const result = await runCommand(
    "npm",
    ["run", "typecheck", "-w", `@jurnapod/${workspace}`],
    root,
    timeoutMs
  );

  const pass = result.exitCode === 0;

  return {
    version: 1,
    gate: gateTag,
    description: "Typecheck",
    pass,
    detail: pass ? "passed" : result.stderr.slice(0, 200),
  };
}

// ── Main Validator ────────────────────────────────────────────────────────

function computeRoot(): string {
  // Resolve from this file's location (scripts/lib/) to project root
  return resolve(import.meta.dirname ?? __dirname, "..", "..");
}

export async function validateEpicGates(
  config: EpicGateConfig
): Promise<EpicGateResult> {
  const root = computeRoot();
  const prefix = `__EPIC${config.epic}_GATE__ `;
  const gates: GateRecord[] = [];
  const sprintPath = resolve(
    root,
    "_bmad-output/implementation-artifacts/sprint-status.yaml"
  );

  // ── GATE: All stories done ──────────────────────────────────────────
  const status = parseSprintStatus(sprintPath);
  const storyKeys = getStoryKeysForEpic(status, config.epic);
  const notDone = storyKeys.filter(
    (k) => status.development_status?.[k] !== "done"
  );

  const storiesGate: GateRecord = {
    version: 1,
    gate: "ALL_STORIES_DONE",
    description: "All stories done",
    pass: notDone.length === 0,
    detail:
      notDone.length === 0
        ? `All ${storyKeys.length} stories done`
        : `${notDone.length}/${storyKeys.length} stories not done: ${notDone.join(", ")}`,
  };
  emitGate(prefix, storiesGate);
  gates.push(storiesGate);

  // ── GATE: Evidence files exist ──────────────────────────────────────
  if (config.evidenceFiles?.length) {
    for (const file of config.evidenceFiles) {
      const fullPath = resolve(root, file);
      const exists = existsSync(fullPath);
      const evidenceGate: GateRecord = {
        version: 1,
        gate: `EVIDENCE_${file.replace(/[^a-zA-Z0-9]/g, "_").slice(-60)}`,
        description: `Evidence: ${file}`,
        pass: exists,
        detail: exists ? "present" : "missing",
      };
      emitGate(prefix, evidenceGate);
      gates.push(evidenceGate);
    }
  }

  // ── GATE: Critical test suites ──────────────────────────────────────
  const timeoutMs = 300_000;
  for (let i = 0; i < config.testSuites.length; i++) {
    const suite = config.testSuites[i];
    const suiteGate = await runTestSuite(
      suite,
      root,
      timeoutMs,
      `TEST_SUITE_${i + 1}`
    );
    emitGate(prefix, suiteGate);
    gates.push(suiteGate);

    if (!suiteGate.pass) {
      // Don't short-circuit; collect all results
    }
  }

  // ── GATE: Typecheck ─────────────────────────────────────────────────
  const typecheckGate = await runTypecheck(
    root,
    "api",
    180_000,
    "TYPECHECK"
  );
  emitGate(prefix, typecheckGate);
  gates.push(typecheckGate);

  // ── GATE: Custom gates ──────────────────────────────────────────────
  if (config.customGates) {
    for (const gateFn of config.customGates) {
      const gate = await gateFn();
      emitGate(prefix, gate);
      gates.push(gate);
    }
  }

  // ── Final verdict ───────────────────────────────────────────────────
  const allPass = gates.every((g) => g.pass);
  if (allPass) {
    console.error(
      `[EPIC${config.epic}-GATE] PASS: all close gates validated`
    );
  } else {
    const failures = gates.filter((g) => !g.pass);
    console.error(
      `[EPIC${config.epic}-GATE] FAIL: ${failures.length} gate(s) failed: ${failures.map((g) => g.gate).join(", ")}`
    );
  }

  return { epic: config.epic, pass: allPass, gates };
}

// ── CLI Entry Point ───────────────────────────────────────────────────────

if (import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, "") ?? "")) {
  const epicArg = process.argv.find((a) => a.startsWith("--epic="));
  const epic = epicArg ? parseInt(epicArg.split("=")[1], 10) : null;

  if (!epic || isNaN(epic)) {
    console.error("Usage: npx tsx scripts/lib/epic-gate-validator.ts --epic=N");
    process.exit(2);
  }

  // Default config: just story completion + typecheck
  const config: EpicGateConfig = {
    epic,
    label: `Epic ${epic}`,
    testSuites: [],
  };

  validateEpicGates(config).then((result) => {
    process.exit(result.pass ? 0 : 1);
  });
}
