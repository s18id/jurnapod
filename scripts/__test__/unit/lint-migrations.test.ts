/**
 * Unit Tests — lint-migrations.ts
 *
 * Tests the pure function `lintMigrationsContent()` against synthetic
 * migration fixtures to verify business-logic trigger detection.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lintMigrationsContent } from "../../lint-migrations";

const FIXTURES_DIR = resolve(__dirname, "..", "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf-8");
}

describe("lintMigrationsContent", () => {
  it("AC1: no-trigger migration returns zero violations", () => {
    const content = loadFixture("good-migration-no-trigger.sql");
    const results = lintMigrationsContent(content, "good-migration-no-trigger.sql");
    expect(results).toHaveLength(0);
  });

  it("AC2: unannotated business-logic trigger returns one violation", () => {
    const content = loadFixture("bad-migration-unannotated-trigger.sql");
    const results = lintMigrationsContent(content, "bad-migration-unannotated-trigger.sql");

    // The unannotated SIGNAL trigger should be a violation
    const signalViolations = results.filter(
      (r) => r.triggerName === "trg_my_table_before_update"
    );
    expect(signalViolations).toHaveLength(1);
    expect(signalViolations[0].message).toContain("without");
    expect(signalViolations[0].message).toContain("-- lint:allow-business-trigger");

    // The audit-only trigger (SET NEW.updated_at = NOW() without SIGNAL) should NOT be flagged
    const auditViolations = results.filter(
      (r) => r.triggerName === "trg_my_table_audit"
    );
    expect(auditViolations).toHaveLength(0);
  });

  it("AC3: annotated allowed trigger passes (zero violations)", () => {
    const content = loadFixture("good-migration-annotated-trigger.sql");
    const results = lintMigrationsContent(content, "good-migration-annotated-trigger.sql");
    expect(results).toHaveLength(0);
  });

  it("AC4: audit-only trigger (SET NEW.field without SIGNAL) passes", () => {
    const content = loadFixture("good-migration-audit-only-trigger.sql");
    const results = lintMigrationsContent(content, "good-migration-audit-only-trigger.sql");
    expect(results).toHaveLength(0);
  });

  it("AC6: existing grandfathered migration (0191) returns zero violations", () => {
    // Reads the real grandfathered migration file from the fixtures copy
    // This test assumes the real file has been annotated with
    // -- lint:allow-business-trigger before each CREATE TRIGGER
    const content = loadFixture("0191_ap_reconciliation_snapshot_audit_trail.sql");
    const results = lintMigrationsContent(content, "0191_ap_reconciliation_snapshot_audit_trail.sql");

    // All 4 triggers should be annotated → zero violations
    const violations = results.filter(
      (r) =>
        r.triggerName.includes("trg_ap_reconciliation_snapshots") ||
        r.triggerName.includes("trg_ap_reconciliation_audit_trail")
    );
    expect(violations).toHaveLength(0);
  });

  describe("edge cases", () => {
    it("empty content returns zero violations", () => {
      const results = lintMigrationsContent("", "empty.sql");
      expect(results).toHaveLength(0);
    });

    it("content with only comments returns zero violations", () => {
      const content = "-- This is a comment\n-- Another comment\n";
      const results = lintMigrationsContent(content, "comments.sql");
      expect(results).toHaveLength(0);
    });

    it("one-liner trigger (no BEGIN/END) is detected", () => {
      const content = `DROP TRIGGER IF EXISTS trg_test;
CREATE TRIGGER trg_test
BEFORE UPDATE ON test_table
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'Not allowed';`;
      const results = lintMigrationsContent(content, "oneliner.sql");
      expect(results).toHaveLength(1);
      expect(results[0].triggerName).toBe("trg_test");
    });

    it("file with only audit triggers passes", () => {
      const content = `DROP TRIGGER IF EXISTS trg_audit;
CREATE TRIGGER trg_audit
BEFORE UPDATE ON test_table
FOR EACH ROW
SET NEW.updated_at = NOW();`;
      const results = lintMigrationsContent(content, "audit.sql");
      expect(results).toHaveLength(0);
    });
  });
});
