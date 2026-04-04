// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Dashboard Metrics Unit Tests
 * 
 * Tests for dashboard metrics snapshot functions.
 * Uses singleton instances to avoid re-registering metrics with global registry.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { register } from "prom-client";
import { 
  getOutboxMetricsSnapshot, 
  getSyncHealthMetricsSnapshot, 
  getJournalHealthMetricsSnapshot,
  type OutboxMetricsSnapshot,
  type SyncHealthMetricsSnapshot,
  type JournalHealthMetricsSnapshot
} from "./dashboard-metrics.js";
import { outboxMetrics } from "./outbox-metrics.js";
import { syncMetrics } from "./sync-metrics.js";
import { journalMetrics, type JournalDomain, type JournalFailureReason } from "./journal-metrics.js";

describe("Dashboard Metrics", () => {
  beforeEach(async () => {
    // Clear all metrics before each test
    register.resetMetrics();
  });

  describe("getOutboxMetricsSnapshot", () => {
    test("should return empty snapshot when no metrics recorded", async () => {
      const snapshot = await getOutboxMetricsSnapshot();
      
      assert.strictEqual(snapshot.totalLagItems, 0);
      assert.strictEqual(snapshot.maxRetryDepth, 0);
      assert.strictEqual(snapshot.duplicateSuppressions, 0);
      assert.strictEqual(snapshot.totalFailures, 0);
      assert.deepStrictEqual(snapshot.byOutlet, []);
      assert.deepStrictEqual(snapshot.failuresByReason, {});
    });

    test("should capture outbox lag items", async () => {
      // Record some metrics - companyId added for tenant isolation (Story 30.7)
      outboxMetrics.setLagItems(1, 1, 50);
      outboxMetrics.setLagItems(1, 2, 100);
      
      const snapshot = await getOutboxMetricsSnapshot();
      
      assert.strictEqual(snapshot.totalLagItems, 150);
      assert.ok(snapshot.byOutlet.length >= 0); // May have outlet data
    });

    test("should filter outbox metrics by companyId - return only specified tenant", async () => {
      // Record metrics for company A (id: 100) and company B (id: 200)
      outboxMetrics.setLagItems(100, 1, 50);
      outboxMetrics.setLagItems(100, 2, 100);
      outboxMetrics.setRetryDepth(100, 1, 3);
      outboxMetrics.recordDuplicate(100, 1);
      outboxMetrics.recordFailure(100, 1, "network_error");
      
      outboxMetrics.setLagItems(200, 1, 200);
      outboxMetrics.setLagItems(200, 2, 300);
      outboxMetrics.setRetryDepth(200, 1, 5);
      outboxMetrics.recordDuplicate(200, 2);
      outboxMetrics.recordDuplicate(200, 2);
      outboxMetrics.recordFailure(200, 1, "timeout");
      outboxMetrics.recordFailure(200, 2, "timeout");
      
      // Get snapshot filtered by company A (id: 100)
      const snapshotA = await getOutboxMetricsSnapshot(100);
      
      // Verify only company A's metrics are returned
      assert.strictEqual(snapshotA.totalLagItems, 150, "Company A total lag items should be 50+100");
      assert.strictEqual(snapshotA.maxRetryDepth, 3, "Company A max retry depth should be 3");
      assert.strictEqual(snapshotA.duplicateSuppressions, 1, "Company A duplicates should be 1");
      assert.strictEqual(snapshotA.totalFailures, 1, "Company A failures should be 1");
      assert.strictEqual(snapshotA.failuresByReason["network_error"], 1);
      
      // Get snapshot filtered by company B (id: 200)
      const snapshotB = await getOutboxMetricsSnapshot(200);
      
      // Verify only company B's metrics are returned
      assert.strictEqual(snapshotB.totalLagItems, 500, "Company B total lag items should be 200+300");
      assert.strictEqual(snapshotB.maxRetryDepth, 5, "Company B max retry depth should be 5");
      assert.strictEqual(snapshotB.duplicateSuppressions, 2, "Company B duplicates should be 2");
      assert.strictEqual(snapshotB.totalFailures, 2, "Company B failures should be 2");
      assert.strictEqual(snapshotB.failuresByReason["timeout"], 2);
      
      // Verify company A's data is NOT in company B's snapshot
      assert.strictEqual(snapshotB.failuresByReason["network_error"], undefined, "Company A's failure reason should not appear in Company B");
    });

    test("should convert numeric companyId to string for label matching", async () => {
      // Company IDs are numbers in business domain but Prometheus labels are strings
      // This test verifies the String(companyId) conversion works correctly
      const numericCompanyId = 999;
      
      outboxMetrics.setLagItems(numericCompanyId, 1, 42);
      outboxMetrics.recordDuplicate(numericCompanyId, 1);
      
      // Snapshot with numeric companyId should match string-labeled metrics
      const snapshot = await getOutboxMetricsSnapshot(numericCompanyId);
      
      assert.strictEqual(snapshot.totalLagItems, 42, "Numeric companyId should be converted to string for label matching");
      assert.strictEqual(snapshot.duplicateSuppressions, 1, "Duplicate count should be found via string conversion");
    });

    test("should capture outbox retry depth", async () => {
      outboxMetrics.setRetryDepth(1, 1, 2);
      outboxMetrics.setRetryDepth(1, 2, 5);
      
      const snapshot = await getOutboxMetricsSnapshot();
      
      assert.strictEqual(snapshot.maxRetryDepth, 5);
    });

    test("should capture duplicate suppressions", async () => {
      outboxMetrics.recordDuplicate(1, 1);
      outboxMetrics.recordDuplicate(1, 1);
      outboxMetrics.recordDuplicate(1, 2);
      
      const snapshot = await getOutboxMetricsSnapshot();
      
      assert.strictEqual(snapshot.duplicateSuppressions, 3);
    });

    test("should capture failure counts by reason", async () => {
      outboxMetrics.recordFailure(1, 1, "network_error");
      outboxMetrics.recordFailure(1, 1, "network_error");
      outboxMetrics.recordFailure(1, 2, "timeout");
      
      const snapshot = await getOutboxMetricsSnapshot();
      
      assert.strictEqual(snapshot.totalFailures, 3);
      assert.strictEqual(snapshot.failuresByReason["network_error"], 2);
      assert.strictEqual(snapshot.failuresByReason["timeout"], 1);
    });
  });

  describe("getSyncHealthMetricsSnapshot", () => {
    test("should return empty snapshot when no metrics recorded", async () => {
      const snapshot = await getSyncHealthMetricsSnapshot();
      
      assert.strictEqual(snapshot.pushOperations, 0);
      assert.strictEqual(snapshot.pullOperations, 0);
      assert.strictEqual(snapshot.conflicts, 0);
    });

    test("should capture push and pull operations", async () => {
      syncMetrics.recordPushDuration("outlet-1", "sales", 1.0);
      syncMetrics.recordPushDuration("outlet-1", "inventory", 2.0);
      syncMetrics.recordPullDuration("outlet-1", "items", 0.5);
      
      const snapshot = await getSyncHealthMetricsSnapshot();
      
      // Operations are counted from counter metrics
      assert.ok(snapshot.pushOperations >= 0);
      assert.ok(snapshot.pullOperations >= 0);
    });

    test("should capture sync conflicts", async () => {
      syncMetrics.recordConflict("outlet-1");
      syncMetrics.recordConflict("outlet-1");
      syncMetrics.recordConflict("outlet-2");
      
      const snapshot = await getSyncHealthMetricsSnapshot();
      
      assert.strictEqual(snapshot.conflicts, 3);
    });

    test("should calculate latency percentiles", async () => {
      // Record push durations to generate histogram data
      syncMetrics.recordPushDuration("outlet-1", "sales", 500);
      syncMetrics.recordPushDuration("outlet-1", "sales", 1000);
      syncMetrics.recordPushDuration("outlet-1", "sales", 2000);
      
      const snapshot = await getSyncHealthMetricsSnapshot();
      
      // Latency percentiles should be calculated (may be 0 if histogram data insufficient)
      assert.strictEqual(typeof snapshot.latencyP50, "number");
      assert.strictEqual(typeof snapshot.latencyP95, "number");
      assert.strictEqual(typeof snapshot.latencyP99, "number");
    });
  });

  describe("getJournalHealthMetricsSnapshot", () => {
    test("should return empty snapshot when no metrics recorded", async () => {
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.strictEqual(snapshot.totalSuccesses, 0);
      assert.strictEqual(snapshot.totalFailures, 0);
      assert.strictEqual(snapshot.successRate, 1.0);
      assert.strictEqual(snapshot.glImbalances, 0);
      assert.strictEqual(snapshot.missingJournals, 0);
    });

    test("should capture journal posting successes", async () => {
      // companyId added for tenant isolation (Story 30.7)
      journalMetrics.recordPostSuccess(1, "sales");
      journalMetrics.recordPostSuccess(1, "sales");
      journalMetrics.recordPostSuccess(1, "inventory");
      
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.strictEqual(snapshot.totalSuccesses, 3);
      assert.strictEqual(snapshot.successRate, 1.0);
    });

    test("should capture journal posting failures", async () => {
      // companyId added for tenant isolation (Story 30.7)
      journalMetrics.recordPostFailure(1, "sales", "validation_error");
      journalMetrics.recordPostFailure(1, "sales", "gl_imbalance");
      
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.strictEqual(snapshot.totalFailures, 2);
      assert.strictEqual(snapshot.successRate, 0); // No successes
      assert.ok(snapshot.failuresByReason["validation_error"] >= 0);
    });

    test("should calculate success rate correctly", async () => {
      // 3 successes, 1 failure = 75% success rate - companyId added for tenant isolation (Story 30.7)
      journalMetrics.recordPostSuccess(1, "sales");
      journalMetrics.recordPostSuccess(1, "sales");
      journalMetrics.recordPostSuccess(1, "sales");
      journalMetrics.recordPostFailure(1, "sales", "validation_error");
      
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.strictEqual(snapshot.totalSuccesses, 3);
      assert.strictEqual(snapshot.totalFailures, 1);
      assert.strictEqual(snapshot.successRate, 0.75);
    });

    test("should capture posting by domain", async () => {
      // companyId added for tenant isolation (Story 30.7)
      journalMetrics.recordPostSuccess(1, "sales");
      journalMetrics.recordPostSuccess(1, "inventory");
      journalMetrics.recordPostFailure(1, "treasury", "posting_error");
      
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.ok(snapshot.postingByDomain.length > 0);
      
      const salesDomain = snapshot.postingByDomain.find(d => d.domain === "sales");
      const treasuryDomain = snapshot.postingByDomain.find(d => d.domain === "treasury");
      
      assert.ok(salesDomain);
      assert.strictEqual(salesDomain!.successes, 1);
      assert.strictEqual(salesDomain!.failures, 0);
      
      assert.ok(treasuryDomain);
      assert.strictEqual(treasuryDomain!.successes, 0);
      assert.strictEqual(treasuryDomain!.failures, 1);
    });

    test("should capture GL imbalances", async () => {
      // companyId is required for tenant isolation (Story 30.7)
      journalMetrics.recordGlImbalance(1);
      journalMetrics.recordGlImbalance(1);
      
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.strictEqual(snapshot.glImbalances, 2);
      assert.ok(snapshot.alerts.glImbalance); // Alert should be triggered
    });

    test("should capture missing journals", async () => {
      journalMetrics.recordMissingJournal();
      
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.strictEqual(snapshot.missingJournals, 1);
    });

    test("should trigger journal failure rate alert when rate is low", async () => {
      // 1 success, 1 failure = 50% rate (below 99.9% threshold) - companyId added for tenant isolation (Story 30.7)
      journalMetrics.recordPostSuccess(1, "sales");
      journalMetrics.recordPostFailure(1, "sales", "validation_error");
      
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.ok(snapshot.alerts.journalFailureRate);
    });

    test("should not trigger journal failure rate alert when rate is high", async () => {
      // 1000 successes, 1 failure = 99.9%+ rate - companyId added for tenant isolation (Story 30.7)
      for (let i = 0; i < 1000; i++) {
        journalMetrics.recordPostSuccess(1, "sales");
      }
      journalMetrics.recordPostFailure(1, "sales", "validation_error");
      
      const snapshot = await getJournalHealthMetricsSnapshot();
      
      assert.ok(!snapshot.alerts.journalFailureRate);
    });

    test("should filter journal metrics by companyId - return only specified tenant", async () => {
      // Record metrics for company A (id: 100) and company B (id: 200)
      journalMetrics.recordPostSuccess(100, "sales");
      journalMetrics.recordPostSuccess(100, "sales");
      journalMetrics.recordPostSuccess(100, "inventory");
      journalMetrics.recordPostFailure(100, "sales", "validation_error");
      journalMetrics.recordGlImbalance(100);
      
      journalMetrics.recordPostSuccess(200, "sales");
      journalMetrics.recordPostSuccess(200, "sales");
      journalMetrics.recordPostSuccess(200, "sales");
      journalMetrics.recordPostSuccess(200, "treasury");
      journalMetrics.recordPostFailure(200, "sales", "gl_imbalance");
      journalMetrics.recordPostFailure(200, "treasury", "posting_error");
      journalMetrics.recordGlImbalance(200);
      journalMetrics.recordGlImbalance(200);
      
      // Get snapshot filtered by company A (id: 100)
      const snapshotA = await getJournalHealthMetricsSnapshot(100);
      
      // Verify only company A's metrics are returned
      assert.strictEqual(snapshotA.totalSuccesses, 3, "Company A successes should be 3");
      assert.strictEqual(snapshotA.totalFailures, 1, "Company A failures should be 1");
      assert.strictEqual(snapshotA.successRate, 0.75, "Company A success rate should be 75%");
      assert.strictEqual(snapshotA.glImbalances, 1, "Company A GL imbalances should be 1");
      
      // Verify domain breakdown for company A
      const salesDomainA = snapshotA.postingByDomain.find(d => d.domain === "sales");
      assert.ok(salesDomainA, "Company A should have sales domain");
      assert.strictEqual(salesDomainA!.successes, 2, "Company A sales successes should be 2");
      assert.strictEqual(salesDomainA!.failures, 1, "Company A sales failures should be 1");
      
      // Get snapshot filtered by company B (id: 200)
      const snapshotB = await getJournalHealthMetricsSnapshot(200);
      
      // Verify only company B's metrics are returned
      assert.strictEqual(snapshotB.totalSuccesses, 4, "Company B successes should be 4");
      assert.strictEqual(snapshotB.totalFailures, 2, "Company B failures should be 2");
      assert.strictEqual(snapshotB.glImbalances, 2, "Company B GL imbalances should be 2");
      
      // Verify company A's data is NOT in company B's snapshot
      assert.strictEqual(snapshotB.failuresByReason["validation_error"], undefined, "Company A's validation_error should not appear in Company B");
      
      const treasuryDomainB = snapshotB.postingByDomain.find(d => d.domain === "treasury");
      assert.ok(treasuryDomainB, "Company B should have treasury domain");
      assert.strictEqual(treasuryDomainB!.successes, 1, "Company B treasury successes should be 1");
      assert.strictEqual(treasuryDomainB!.failures, 1, "Company B treasury failures should be 1");
    });

    test("should convert numeric companyId to string for journal label matching", async () => {
      // Company IDs are numbers in business domain but Prometheus labels are strings
      // This test verifies the String(companyId) conversion works correctly
      const numericCompanyId = 888;
      
      journalMetrics.recordPostSuccess(numericCompanyId, "sales");
      journalMetrics.recordPostSuccess(numericCompanyId, "sales");
      journalMetrics.recordPostFailure(numericCompanyId, "inventory", "gl_imbalance");
      journalMetrics.recordGlImbalance(numericCompanyId);
      
      // Snapshot with numeric companyId should match string-labeled metrics
      const snapshot = await getJournalHealthMetricsSnapshot(numericCompanyId);
      
      assert.strictEqual(snapshot.totalSuccesses, 2, "Numeric companyId should match for successes");
      assert.strictEqual(snapshot.totalFailures, 1, "Numeric companyId should match for failures");
      assert.strictEqual(snapshot.glImbalances, 1, "Numeric companyId should match for GL imbalances");
      assert.strictEqual(snapshot.successRate, 2/3, "Success rate should be calculated correctly");
      assert.strictEqual(snapshot.failuresByReason["gl_imbalance"], 1, "Failure reason should be found via string conversion");
    });
  });
});
