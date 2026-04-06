// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Unit tests for retry utility with exponential backoff
// Run with: npm run test:unit:single -w @jurnapod/api src/lib/retry.test.ts

import assert from "node:assert/strict";
import { describe, test } from 'vitest';
import { withRetry, sleep } from "@/lib/retry";

describe("sleep()", () => {
  test("sleeps for the specified duration", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    // Allow some tolerance for timing variations
    assert.ok(elapsed >= 45, `Expected >= 45ms, got ${elapsed}ms`);
    assert.ok(elapsed < 150, `Expected < 150ms, got ${elapsed}ms`);
  });
});

describe("withRetry()", () => {
  test("succeeds on first attempt when function succeeds", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return "success";
    };

    const result = await withRetry(fn);

    assert.equal(result, "success");
    assert.equal(callCount, 1);
  });

  test("succeeds after retry when function initially fails", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error(`Attempt ${callCount} failed`);
      }
      return "success";
    };

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });

    assert.equal(result, "success");
    assert.equal(callCount, 3);
  });

  test("throws when all retries are exhausted", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error(`Attempt ${callCount} failed`);
    };

    await assert.rejects(
      async () => {
        await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
      },
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Attempt 3 failed");
        return true;
      }
    );

    assert.equal(callCount, 3);
  });

  test("respects maxRetries option", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error(`Attempt ${callCount} failed`);
    };

    await assert.rejects(
      async () => {
        await withRetry(fn, { maxRetries: 5, baseDelay: 10 });
      },
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Attempt 5 failed");
        return true;
      }
    );

    assert.equal(callCount, 5);
  });

  test("calculates exponential backoff delays correctly", async () => {
    const delays: number[] = [];
    let attempt = 0;
    const baseDelay = 100;

    const fn = async () => {
      attempt++;
      if (attempt < 3) {
        throw new Error(`Attempt ${attempt} failed`);
      }
      return "success";
    };

    const onRetry = (_attempt: number, _error: Error, nextDelayMs: number) => {
      delays.push(nextDelayMs);
    };

    await withRetry(fn, { maxRetries: 3, baseDelay, onRetry });

    // onRetry is called before each retry with the calculated delay
    // Delays should follow exponential pattern: 100ms, 200ms, 400ms
    assert.equal(delays.length, 2); // 2 retry attempts before success on 3rd
    assert.equal(delays[0], 100); // baseDelay * 2^0 = 100
    assert.equal(delays[1], 200); // baseDelay * 2^1 = 200
  });

  test("caps delay at maxDelay", async () => {
    const delays: number[] = [];
    let attempt = 0;
    const baseDelay = 1000;
    const maxDelay = 1500;

    const fn = async () => {
      attempt++;
      if (attempt < 3) {
        throw new Error(`Attempt ${attempt} failed`);
      }
      return "success";
    };

    const onRetry = (_attempt: number, _error: Error, nextDelayMs: number) => {
      delays.push(nextDelayMs);
    };

    await withRetry(fn, { maxRetries: 3, baseDelay, maxDelay, onRetry });

    // First delay: baseDelay * 2^0 = 1000 (not capped)
    // Second delay: baseDelay * 2^1 = 2000 (capped to 1500)
    assert.equal(delays.length, 2); // 2 retry attempts before success on 3rd
    assert.equal(delays[0], 1000);
    assert.equal(delays[1], 1500); // capped
  });

  test("calls onRetry callback on each retry attempt", async () => {
    const retryInfo: { attempt: number; error: Error; delay: number }[] = [];
    let attempt = 0;

    const fn = async () => {
      attempt++;
      if (attempt < 3) {
        throw new Error(`Attempt ${attempt} failed`);
      }
      return "success";
    };

    const onRetry = (attemptNum: number, error: Error, nextDelayMs: number) => {
      retryInfo.push({ attempt: attemptNum, error, delay: nextDelayMs });
    };

    await withRetry(fn, { maxRetries: 3, baseDelay: 10, onRetry });

    assert.equal(retryInfo.length, 2); // 2 retries before success on 3rd attempt
    assert.equal(retryInfo[0].attempt, 1);
    assert.equal(retryInfo[0].error.message, "Attempt 1 failed");
    assert.equal(retryInfo[1].attempt, 2);
    assert.equal(retryInfo[1].error.message, "Attempt 2 failed");
  });

  test("works with synchronous errors captured properly", async () => {
    let callCount = 0;

    const fn = () => {
      callCount++;
      if (callCount < 2) {
        throw new Error("Sync error");
      }
      return "success";
    };

    const result = await withRetry(
      async () => fn(),
      { maxRetries: 3, baseDelay: 10 }
    );

    assert.equal(result, "success");
    assert.equal(callCount, 2);
  });

  test("uses default options when none provided", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount < 2) {
        throw new Error("Failed");
      }
      return "result";
    };

    const result = await withRetry(fn);

    assert.equal(result, "result");
    assert.equal(callCount, 2);
  });
});
