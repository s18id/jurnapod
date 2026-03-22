// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BackpressureManager, BackoffCalculator, DEFAULT_QUEUE_LIMITS } from "../backpressure-manager.js";

describe("BackpressureManager", () => {
  describe("constructor", () => {
    it("should use default limits when not provided", () => {
      const manager = new BackpressureManager();
      assert.ok(manager, "Should create instance");
    });

    it("should accept custom limits", () => {
      const customLimits = {
        maxPendingTransactions: 500,
        warnAtPercent: 70,
        alertAtPercent: 90,
        storageWarnPercent: 70,
        storageAlertPercent: 90
      };
      const manager = new BackpressureManager(customLimits);
      assert.ok(manager, "Should create instance with custom limits");
    });
  });

  describe("BackoffCalculator", () => {
    it("should return base delay for attempt 0 without jitter", () => {
      const calculator = new BackoffCalculator(2000, 60000, 2);
      const delay = calculator.getDelay(0);
      // Attempt 0 returns baseMs without jitter
      assert.strictEqual(delay, 2000, "Should return base delay");
    });

    it("should return base delay with jitter for attempt 1", () => {
      const calculator = new BackoffCalculator(2000, 60000, 2);
      const delay = calculator.getDelay(1);
      // Attempt 1 returns baseMs * 1 with 10% jitter
      assert.ok(delay >= 2000 && delay <= 2200, "Should return base delay with jitter");
    });

    it("should double delay for subsequent attempts with jitter", () => {
      const calculator = new BackoffCalculator(2000, 60000, 2);
      const delay2 = calculator.getDelay(2);
      // Attempt 2 returns baseMs * 2 = 4000 with 10% jitter
      assert.ok(delay2 >= 4000 && delay2 <= 4400, "Should double for second attempt");

      const delay3 = calculator.getDelay(3);
      // Attempt 3 returns baseMs * 4 = 8000 with 10% jitter
      assert.ok(delay3 >= 8000 && delay3 <= 8800, "Should double again for third attempt");
    });

    it("should not exceed max delay", () => {
      const calculator = new BackoffCalculator(1000, 60000, 2);
      const delay10 = calculator.getDelay(10);
      assert.ok(delay10 <= 60000, "Should not exceed max delay");
    });

    it("should add jitter to delay", () => {
      const calculator = new BackoffCalculator(2000, 60000, 2);
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(calculator.getDelay(5));
      }
      // With jitter, delays should vary slightly
      const uniqueDelays = new Set(delays);
      assert.ok(uniqueDelays.size > 1, "Should have some variation due to jitter");
    });

    it("should return sequence of delays", () => {
      const calculator = new BackoffCalculator(2000, 60000, 2);
      const sequence = calculator.getSequence(5);
      assert.strictEqual(sequence.length, 5, "Should return requested number of delays");
      // First two should be close to 2000 and 4000 (with jitter)
      assert.ok(sequence[0] >= 2000 && sequence[0] <= 2200, "First should be near base delay");
      assert.ok(sequence[1] >= 4000 && sequence[1] <= 4400, "Second should be near double");
    });

    it("should return empty array for 0 maxAttempts", () => {
      const calculator = new BackoffCalculator(2000, 60000, 2);
      const sequence = calculator.getSequence(0);
      assert.strictEqual(sequence.length, 0, "Should return empty array");
    });

    it("should be a no-op for reset", () => {
      const calculator = new BackoffCalculator(2000, 60000, 2);
      calculator.reset();
      assert.ok(true, "Should not throw");
    });
  });

  describe("getRecommendedAction", () => {
    it("should return 'none' when no data available", () => {
      const manager = new BackpressureManager();
      const recommendation = manager.getRecommendedAction();
      assert.strictEqual(recommendation.action, "none", "Should return 'none' action");
    });
  });
});

describe("BackoffCalculator edge cases", () => {
  it("should handle negative attempt numbers", () => {
    const calculator = new BackoffCalculator();
    const delay = calculator.getDelay(-1);
    assert.strictEqual(delay, 2000, "Should return base delay for negative attempt");
  });

  it("should handle very large attempt numbers", () => {
    const calculator = new BackoffCalculator(1000, 60000, 2);
    const delay = calculator.getDelay(100);
    assert.ok(delay <= 60000, "Should cap at max delay");
  });

  it("should use custom base delay", () => {
    const calculator = new BackoffCalculator(1000, 30000, 3);
    const delay = calculator.getDelay(1);
    // Due to jitter, delay will be close to 1000 but not exactly
    assert.ok(delay >= 1000 && delay <= 1100, "Should use custom base delay with jitter");
  });
});
