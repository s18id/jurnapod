// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit Tests for Quality Gate Script Logic
 * Story 11.1: Reliability Baseline and SLO Instrumentation
 * 
 * Tests that verify the quality gate script logic without actually running bash.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Hardcoded project root since relative path resolution is problematic with tsx
const PROJECT_ROOT = "/home/ahmad/jurnapod";
const scriptPath = resolve(PROJECT_ROOT, "scripts/telemetry-coverage-check.sh");

describe("Quality Gate Script", () => {
  it("should exist at scripts/telemetry-coverage-check.sh", () => {
    assert.ok(
      existsSync(scriptPath),
      `Quality gate script should exist at ${scriptPath}`
    );
  });

  it("should be executable", () => {
    const content = readFileSync(scriptPath, "utf-8");
    // Check shebang is present
    assert.ok(content.startsWith("#!/bin/bash"), "Script should have bash shebang");
  });

  it("should check for telemetry package", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("packages/telemetry"),
      "Script should check for telemetry package"
    );
  });

  it("should check for SLO configuration", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("slo-config.yaml"),
      "Script should check for SLO configuration"
    );
  });

  it("should check for alert rules", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("prometheus-alerts.yaml"),
      "Script should check for alert rules"
    );
  });

  it("should check for dashboard configurations", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("dashboards"),
      "Script should check for dashboard configurations"
    );
  });

  it("should check for API telemetry middleware", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("middleware/telemetry.ts"),
      "Script should check for telemetry middleware"
    );
  });

  it("should define all critical flows", () => {
    const content = readFileSync(scriptPath, "utf-8");
    const criticalFlows = [
      "payment_capture",
      "offline_local_commit",
      "sync_replay_idempotency",
      "pos_to_gl_posting",
      "trial_balance",
      "general_ledger",
    ];

    for (const flow of criticalFlows) {
      assert.ok(
        content.includes(flow),
        `Script should check for ${flow}`
      );
    }
  });

  it("should have telemetry requirements per flow", () => {
    const content = readFileSync(scriptPath, "utf-8");
    // Check that each flow has associated requirements
    assert.ok(
      content.includes("request_id_header"),
      "Script should check for request_id_header"
    );
    assert.ok(
      content.includes("latency_histogram"),
      "Script should check for latency_histogram"
    );
    assert.ok(
      content.includes("error_counter"),
      "Script should check for error_counter"
    );
    assert.ok(
      content.includes("company_id_label"),
      "Script should check for company_id_label"
    );
  });

  it("should exit with code 0 on success", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("exit 0") || content.includes("exit(0)"),
      "Script should exit 0 on success"
    );
  });

  it("should exit with code 1 on failure", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("exit 1") || content.includes("exit(1)"),
      "Script should exit 1 on failure"
    );
  });

  it("should support --fix flag for GitHub issue creation", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("--fix"),
      "Script should support --fix flag"
    );
  });

  it("should support --verbose flag", () => {
    const content = readFileSync(scriptPath, "utf-8");
    assert.ok(
      content.includes("--verbose"),
      "Script should support --verbose flag"
    );
  });
});
