#!/usr/bin/env tsx
/// <reference types="node" />

/**
 * Epic 59 Gate Validator — thin wrapper around the reusable gate validator.
 *
 * Usage: npx tsx scripts/validate-epic-59-gates.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateEpicGates,
  type EpicGateConfig,
  type GateRecord,
} from "./lib/epic-gate-validator.js";

const ROOT = resolve(import.meta.dirname ?? __dirname, "..");

// Epic-specific evidence files
const DECISION_NOTE = resolve(
  ROOT,
  "_bmad-output/planning-artifacts/epic-59-concurrent-posting-deadlock-decision-note.md"
);
const SPIKE = resolve(
  ROOT,
  "_bmad-output/planning-artifacts/epic-59-concurrent-posting-deadlock-spike.md"
);
const STORY_59_3_COMPLETION = resolve(
  ROOT,
  "_bmad-output/implementation-artifacts/stories/epic-59/story-59.3.completion.md"
);

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

// Custom gate: E58-A2 Option A evidence
function e58a2Gate(): GateRecord {
  const decisionNote = readIfExists(DECISION_NOTE);
  const storyEvidence = readIfExists(STORY_59_3_COMPLETION);
  const spikeContent = readIfExists(SPIKE);

  const optionASelected = /option\s*a\s+selected|selected\s*:\s*option\s*a|option_a/i.test(
    decisionNote.toLowerCase()
  );
  const evidencePresent =
    storyEvidence.includes("epic-59-concurrent-posting-deadlock-spike.md") &&
    storyEvidence.includes("epic-59-concurrent-posting-deadlock-decision-note.md");
  const spikeComplete =
    spikeContent.includes("[x] Reproduction scenario") ||
    spikeContent.includes("[X] Reproduction scenario");

  return {
    version: 1,
    gate: "E58_A2_OPTION_A",
    description: "E58-A2 Option A evidence",
    pass: optionASelected && evidencePresent && spikeComplete,
    detail: optionASelected
      ? `Option A selected; evidence=${evidencePresent}; spike=${spikeComplete}`
      : "Option A not selected",
  };
}

const config: EpicGateConfig = {
  epic: 59,
  label: "Epic 59: POS Core Correctness Consolidation",
  testSuites: [
    {
      name: "push-idempotency (59.2)",
      workspace: "api",
      testFile: "__test__/integration/sync/push-idempotency.test.ts",
    },
    {
      name: "tenant-scoping (59.4)",
      workspace: "api",
      testFile: "__test__/integration/sync/tenant-scoping.test.ts",
    },
    {
      name: "fiscal-year-close (59.3)",
      workspace: "api",
      testFile: "__test__/integration/accounting/fiscal-year-close.test.ts",
    },
  ],
  evidenceFiles: [
    "_bmad-output/implementation-artifacts/stories/epic-59/story-59.3.completion.md",
  ],
  customGates: [e58a2Gate],
};

validateEpicGates(config).then((result) => {
  process.exit(result.pass ? 0 : 1);
});
