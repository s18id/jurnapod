#!/usr/bin/env tsx
/// <reference types="node" />

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const EPIC58_PREFIX = "__EPIC58_GATE__ ";
const SUITE_TIMEOUT_MS = 300_000; // 5 minutes

export interface SuiteSpec {
  name: string;
  workspace: string;
}

export interface SuiteRunResult {
  suite: SuiteSpec;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GateRecord {
  version: number;
  gate: string;
  [key: string]: unknown;
}

export interface GateValidationResult {
  pass: boolean;
  diagnostics: string[];
  gateRecords: Map<string, GateRecord>;
  suiteResults: SuiteRunResult[];
}

export type SuiteRunner = (suite: SuiteSpec) => Promise<SuiteRunResult>;

export const CRITICAL_SUITES: SuiteSpec[] = [
  { name: "test:unit:costing", workspace: "@jurnapod/modules-inventory-costing" },
  { name: "test:integration:inventory", workspace: "@jurnapod/api" },
  { name: "test:integration:inventory:posting", workspace: "@jurnapod/api" },
];

function toNumber(value: unknown, fallback = Number.NaN): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) return Number(value);
  return fallback;
}

export function parseGateLines(output: string): GateRecord[] {
  const records: GateRecord[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const match = line.match(/__EPIC58_GATE__\s+(\{.*\})\s*$/);
    if (!match) continue;

    const jsonPart = match[1]?.trim();
    if (!jsonPart) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonPart);
    } catch {
      throw new Error(`Malformed __EPIC58_GATE__ JSON line: ${line}`);
    }

    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(`Invalid __EPIC58_GATE__ payload (not object): ${line}`);
    }

    const record = parsed as GateRecord;
    records.push(record);
  }

  return records;
}

export async function runSuite(suite: SuiteSpec): Promise<SuiteRunResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("npm", ["run", suite.name, "-w", suite.workspace], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;

    let stdout = "";
    let stderr = "";

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      rejectRun(
        new Error(
          `Suite timed out after ${SUITE_TIMEOUT_MS}ms: ${suite.name} (-w ${suite.workspace})`,
        ),
      );
    }, SUITE_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      rejectRun(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolveRun({
        suite,
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

export async function validateEpic58Gates(options?: {
  suites?: SuiteSpec[];
  runner?: SuiteRunner;
}): Promise<GateValidationResult> {
  const suites = options?.suites ?? CRITICAL_SUITES;
  const runner = options?.runner ?? runSuite;

  const suiteResults: SuiteRunResult[] = [];
  const diagnostics: string[] = [];
  const gateRecords = new Map<string, GateRecord>();

  for (const suite of suites) {
    let result: SuiteRunResult;
    try {
      result = await runner(suite);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`Suite execution error: ${suite.name} (-w ${suite.workspace}) ${message}`);
      suiteResults.push({
        suite,
        stdout: "",
        stderr: message,
        exitCode: 1,
      });
      continue;
    }
    suiteResults.push(result);

    if (result.exitCode !== 0) {
      diagnostics.push(
        `Suite failed: ${suite.name} (-w ${suite.workspace}) exit=${result.exitCode}`,
      );
    }

    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    let parsed: GateRecord[] = [];
    try {
      parsed = parseGateLines(combinedOutput);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`Gate parse error (${suite.name}): ${message}`);
      continue;
    }

    for (const record of parsed) {
      if (gateRecords.has(String(record.gate))) {
        diagnostics.push(
          `Duplicate gate evidence detected for ${String(record.gate)}; using latest emission`,
        );
      }
      gateRecords.set(String(record.gate), record);
    }
  }

  for (const required of ["GATE1", "GATE2", "NFR2", "GATE3"]) {
    if (!gateRecords.has(required)) {
      diagnostics.push(`Missing required gate evidence line: ${required}`);
    }
  }

  for (const [gate, record] of gateRecords.entries()) {
    if (toNumber(record.version) !== 1) {
      diagnostics.push(`Version mismatch for ${gate}: expected 1, got ${String(record.version)}`);
    }
  }

  const gate1 = gateRecords.get("GATE1");
  if (gate1) {
    const variance = Math.abs(toNumber(gate1.variance));
    const threshold = toNumber(gate1.threshold);
    const pass = Number.isFinite(variance) && Number.isFinite(threshold) && variance <= threshold;
    if (!pass) {
      diagnostics.push(
        `GATE1 failed: variance=${String(gate1.variance)} threshold=${String(gate1.threshold)}`,
      );
    }
    console.log(
      `${EPIC58_PREFIX}${JSON.stringify({
        version: 1,
        gate: "GATE1",
        variance: String(gate1.variance ?? "NaN"),
        threshold: String(gate1.threshold ?? "NaN"),
        pass,
      })}`,
    );
  }

  const gate2 = gateRecords.get("GATE2");
  if (gate2) {
    const variance = Math.abs(toNumber(gate2.variance));
    const threshold = toNumber(gate2.threshold);
    const pass = Number.isFinite(variance) && Number.isFinite(threshold) && variance <= threshold;
    if (!pass) {
      diagnostics.push(
        `GATE2 failed: variance=${String(gate2.variance)} threshold=${String(gate2.threshold)}`,
      );
    }
    console.log(
      `${EPIC58_PREFIX}${JSON.stringify({
        version: 1,
        gate: "GATE2",
        variance: String(gate2.variance ?? "NaN"),
        threshold: String(gate2.threshold ?? "NaN"),
        pass,
      })}`,
    );
  }

  const nfr2 = gateRecords.get("NFR2");
  if (nfr2) {
    const crossModuleDiff = toNumber(nfr2.cross_module_diff);
    const pass = Number.isFinite(crossModuleDiff) && crossModuleDiff === 0;
    if (!pass) {
      diagnostics.push(`NFR2 failed: cross_module_diff=${String(nfr2.cross_module_diff)}`);
    }
    console.log(
      `${EPIC58_PREFIX}${JSON.stringify({
        version: 1,
        gate: "NFR2",
        cross_module_diff: Number.isFinite(crossModuleDiff)
          ? Number(crossModuleDiff.toFixed(4))
          : Number.NaN,
        pass,
      })}`,
    );
  }

  const gate3 = gateRecords.get("GATE3");
  const criticalSuitesGreen = suiteResults.every((s) => s.exitCode === 0);
  if (gate3) {
    const p0Count = toNumber(gate3.p0_count);
    const p1Count = toNumber(gate3.p1_count);
    const parsedCriticalGreen = gate3.critical_suites_green === true;
    const pass =
      Number.isFinite(p0Count) &&
      Number.isFinite(p1Count) &&
      p0Count === 0 &&
      p1Count === 0 &&
      parsedCriticalGreen &&
      criticalSuitesGreen;

    if (!pass) {
      diagnostics.push(
        `GATE3 failed: p0_count=${String(gate3.p0_count)} p1_count=${String(gate3.p1_count)} ` +
          `critical_suites_green=${String(gate3.critical_suites_green)} run_green=${String(criticalSuitesGreen)}`,
      );
    }

    const criticalSuiteNames = Array.isArray(gate3.critical_suite_names)
      ? gate3.critical_suite_names
      : CRITICAL_SUITES.map((s) => s.name);

    console.log(
      `${EPIC58_PREFIX}${JSON.stringify({
        version: 1,
        gate: "GATE3",
        p0_count: Number.isFinite(p0Count) ? p0Count : Number.NaN,
        p1_count: Number.isFinite(p1Count) ? p1Count : Number.NaN,
        critical_suites_green: criticalSuitesGreen,
        critical_suite_names: criticalSuiteNames,
        pass,
      })}`,
    );
  }

  const pass = diagnostics.length === 0;
  return { pass, diagnostics, gateRecords, suiteResults };
}

async function main(): Promise<void> {
  try {
    const result = await validateEpic58Gates();
    if (!result.pass) {
      for (const diagnostic of result.diagnostics) {
        console.error(`[EPIC58-GATE] ${diagnostic}`);
      }
      process.exit(1);
      return;
    }

    console.log("[EPIC58-GATE] PASS: all Sprint 58 exit gates validated");
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EPIC58-GATE] fatal error: ${message}`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const currentPath = fileURLToPath(import.meta.url);
if (invokedPath && currentPath === invokedPath) {
  void main();
}
