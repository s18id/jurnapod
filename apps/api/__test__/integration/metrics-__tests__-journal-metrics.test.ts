// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it } from "node:test";
import assert from "node:assert";
import { journalMetrics, JOURNAL_DOMAINS, JOURNAL_FAILURE_REASONS } from "../journal-metrics";

describe("Journal Domains Constants", () => {
  it("should have all expected domains", () => {
    const expectedDomains = ["sales", "inventory", "accounting", "treasury", "fixed_assets"];
    assert.deepStrictEqual(JOURNAL_DOMAINS, expectedDomains);
  });
});

describe("Journal Failure Reasons Constants", () => {
  it("should have all expected failure reasons", () => {
    const expectedReasons = ["validation_error", "gl_imbalance", "posting_error", "missing_reference", "internal_error"];
    assert.deepStrictEqual(JOURNAL_FAILURE_REASONS, expectedReasons);
  });
});

describe("Global journalMetrics singleton", () => {
  it("should be defined", () => {
    assert.ok(journalMetrics, "journalMetrics should be defined");
  });

  it("should have recordPostSuccess method", () => {
    assert.ok(typeof journalMetrics.recordPostSuccess === "function", "recordPostSuccess should be a function");
  });

  it("should have recordPostFailure method", () => {
    assert.ok(typeof journalMetrics.recordPostFailure === "function", "recordPostFailure should be a function");
  });

  it("should have recordGlImbalance method", () => {
    assert.ok(typeof journalMetrics.recordGlImbalance === "function", "recordGlImbalance should be a function");
  });

  it("should have recordMissingJournal method", () => {
    assert.ok(typeof journalMetrics.recordMissingJournal === "function", "recordMissingJournal should be a function");
  });

  it("should have getRegistry method", () => {
    assert.ok(typeof journalMetrics.getRegistry === "function", "getRegistry should be a function");
  });

  it("should have a valid registry", () => {
    const registry = journalMetrics.getRegistry();
    assert.ok(registry, "getRegistry should return a registry");
  });

  it("should be able to record success for sales domain", () => {
    // Should not throw - companyId added for tenant isolation (Story 30.7)
    journalMetrics.recordPostSuccess(1, "sales");
  });

  it("should be able to record failure for sales domain with validation_error", () => {
    // Should not throw - companyId added for tenant isolation (Story 30.7)
    journalMetrics.recordPostFailure(1, "sales", "validation_error");
  });

  it("should be able to record gl imbalance", () => {
    // Should not throw - companyId is required for tenant isolation (Story 30.7)
    journalMetrics.recordGlImbalance(1);
  });

  it("should be able to record missing journal", () => {
    // Should not throw
    journalMetrics.recordMissingJournal();
  });

  it("should record gl imbalance for inventory domain", () => {
    // companyId added for tenant isolation (Story 30.7)
    journalMetrics.recordPostFailure(1, "inventory", "gl_imbalance");
  });

  it("should record posting error for treasury domain", () => {
    // companyId added for tenant isolation (Story 30.7)
    journalMetrics.recordPostFailure(1, "treasury", "posting_error");
  });

  it("should record internal error for fixed_assets domain", () => {
    // companyId added for tenant isolation (Story 30.7)
    journalMetrics.recordPostFailure(1, "fixed_assets", "internal_error");
  });
});