import { describe, expect, it } from "vitest";

import {
  CRITICAL_SUITES,
  type SuiteRunResult,
  validateEpic58Gates,
} from "../../../../../scripts/validate-epic-58-gates";

function makeSuiteOutputLines(params?: Partial<{
  gate1Variance: string;
  gate1Threshold: string;
  gate2Variance: string;
  gate2Threshold: string;
  crossModuleDiff: number;
  p0Count: number;
  p1Count: number;
  criticalSuitesGreen: boolean;
  version: number;
}>): Record<string, string> {
  const version = params?.version ?? 1;
  return {
    [CRITICAL_SUITES[0].name]: `__EPIC58_GATE__ ${JSON.stringify({
      version,
      gate: "GATE3",
      p0_count: params?.p0Count ?? 0,
      p1_count: params?.p1Count ?? 0,
      critical_suites_green: params?.criticalSuitesGreen ?? true,
      critical_suite_names: CRITICAL_SUITES.map((s) => s.name),
      pass: true,
    })}`,
    [CRITICAL_SUITES[1].name]: `__EPIC58_GATE__ ${JSON.stringify({
      version,
      gate: "GATE1",
      variance: params?.gate1Variance ?? "0.0000",
      threshold: params?.gate1Threshold ?? "0.01",
      pass: true,
    })}`,
    [CRITICAL_SUITES[2].name]: [
      `__EPIC58_GATE__ ${JSON.stringify({
        version,
        gate: "GATE2",
        variance: params?.gate2Variance ?? "0.0000",
        threshold: params?.gate2Threshold ?? "0.01",
        pass: true,
      })}`,
      `__EPIC58_GATE__ ${JSON.stringify({
        version,
        gate: "NFR2",
        cross_module_diff: params?.crossModuleDiff ?? 0,
        pass: true,
      })}`,
    ].join("\n"),
  };
}

function makeRunner(options?: Partial<{
  outputs: Record<string, string>;
  failingSuite: string;
  failingExitCode: number;
}>): (suite: (typeof CRITICAL_SUITES)[number]) => Promise<SuiteRunResult> {
  const outputs = options?.outputs ?? makeSuiteOutputLines();

  return async (suite) => {
    const isFailingSuite = options?.failingSuite === suite.name;
    return {
      suite,
      stdout: outputs[suite.name] ?? "",
      stderr: "",
      exitCode: isFailingSuite ? options?.failingExitCode ?? 1 : 0,
    };
  };
}

describe("scripts.validate-epic-58-gates", () => {
  it("passes when all gates and critical suites are green", async () => {
    const result = await validateEpic58Gates({
      runner: makeRunner(),
    });

    expect(result.pass).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("fails when GATE1 variance exceeds threshold", async () => {
    const result = await validateEpic58Gates({
      runner: makeRunner({ outputs: makeSuiteOutputLines({ gate1Variance: "0.0200" }) }),
    });

    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("GATE1 failed"))).toBe(true);
  });

  it("fails when GATE2 variance exceeds threshold", async () => {
    const result = await validateEpic58Gates({
      runner: makeRunner({ outputs: makeSuiteOutputLines({ gate2Variance: "0.0500" }) }),
    });

    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("GATE2 failed"))).toBe(true);
  });

  it("fails when NFR2 cross_module_diff is non-zero", async () => {
    const result = await validateEpic58Gates({
      runner: makeRunner({ outputs: makeSuiteOutputLines({ crossModuleDiff: 0.0001 }) }),
    });

    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("NFR2 failed"))).toBe(true);
  });

  it("passes when variance equals threshold boundary", async () => {
    const result = await validateEpic58Gates({
      runner: makeRunner({
        outputs: makeSuiteOutputLines({ gate1Variance: "0.0100", gate2Variance: "0.01" }),
      }),
    });

    expect(result.pass).toBe(true);
  });

  it("fails when gate numeric fields are malformed", async () => {
    const outputs = makeSuiteOutputLines();
    outputs[CRITICAL_SUITES[1].name] = `__EPIC58_GATE__ ${JSON.stringify({
      version: 1,
      gate: "GATE1",
      variance: null,
      threshold: "0.01",
      pass: true,
    })}`;

    const result = await validateEpic58Gates({
      runner: makeRunner({ outputs }),
    });

    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("GATE1 failed"))).toBe(true);
  });

  it("fails when GATE3 includes unresolved P0/P1", async () => {
    const result = await validateEpic58Gates({
      runner: makeRunner({ outputs: makeSuiteOutputLines({ p0Count: 1 }) }),
    });

    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("GATE3 failed"))).toBe(true);
  });

  it("fails when a critical suite exits non-zero", async () => {
    const result = await validateEpic58Gates({
      runner: makeRunner({ failingSuite: "test:integration:inventory:posting", failingExitCode: 1 }),
    });

    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("Suite failed"))).toBe(true);
    expect(result.diagnostics.some((d) => d.includes("GATE3 failed"))).toBe(true);
  });

  it("fails on version mismatch", async () => {
    const result = await validateEpic58Gates({
      runner: makeRunner({ outputs: makeSuiteOutputLines({ version: 2 }) }),
    });

    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("Version mismatch"))).toBe(true);
  });

  it("fails when a required gate line is missing", async () => {
    const outputs = makeSuiteOutputLines();
    outputs[CRITICAL_SUITES[2].name] = outputs[CRITICAL_SUITES[2].name]
      .split("\n")
      .filter((line) => !line.includes('"gate":"NFR2"'))
      .join("\n");

    const result = await validateEpic58Gates({
      runner: makeRunner({ outputs }),
    });

    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("Missing required gate evidence line: NFR2"))).toBe(true);
  });
});
