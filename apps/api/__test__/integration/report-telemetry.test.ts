// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test, describe, mock } from "node:test";
import assert from "node:assert";
import {
  getDatasetSizeBucket,
  classifyReportError,
  QueryTimeoutError,
  ValidationError,
  AuthError,
  withQueryTimeout,
  DATASET_SIZE_THRESHOLDS,
  REPORT_SLO_LATENCY_MS,
} from "./report-telemetry";

describe("Report Telemetry", () => {

  describe("getDatasetSizeBucket", () => {
    test("returns small for 0 rows", () => {
      assert.strictEqual(getDatasetSizeBucket(0), "small");
    });

    test("returns small for 100 rows", () => {
      assert.strictEqual(getDatasetSizeBucket(100), "small");
    });

    test("returns medium for 101 rows", () => {
      assert.strictEqual(getDatasetSizeBucket(101), "medium");
    });

    test("returns medium for 500 rows", () => {
      assert.strictEqual(getDatasetSizeBucket(500), "medium");
    });

    test("returns large for 501 rows", () => {
      assert.strictEqual(getDatasetSizeBucket(501), "large");
    });

    test("returns large for 2000 rows", () => {
      assert.strictEqual(getDatasetSizeBucket(2000), "large");
    });

    test("returns xlarge for 2001 rows", () => {
      assert.strictEqual(getDatasetSizeBucket(2001), "xlarge");
    });

    test("returns xlarge for very large datasets", () => {
      assert.strictEqual(getDatasetSizeBucket(100000), "xlarge");
    });
  });

  describe("classifyReportError", () => {
    test("returns timeout for QueryTimeoutError", () => {
      const error = new QueryTimeoutError();
      assert.strictEqual(classifyReportError(error), "timeout");
    });

    test("returns validation for ValidationError", () => {
      const error = new ValidationError("Invalid date range");
      assert.strictEqual(classifyReportError(error), "validation");
    });

    test("returns auth for AuthError", () => {
      const error = new AuthError();
      assert.strictEqual(classifyReportError(error), "auth");
    });

    test("returns system for generic errors", () => {
      const error = new Error("Database connection failed");
      assert.strictEqual(classifyReportError(error), "system");
    });

    test("returns system for non-Error values", () => {
      assert.strictEqual(classifyReportError("string error"), "system");
      assert.strictEqual(classifyReportError(null), "system");
      assert.strictEqual(classifyReportError(undefined), "system");
    });
  });

  describe("withQueryTimeout", () => {
    test("resolves when promise completes before timeout", async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve("success"), 10);
      });
      const result = await withQueryTimeout(promise, 1000);
      assert.strictEqual(result, "success");
    });

    test("rejects with QueryTimeoutError when timeout exceeded", async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve("success"), 2000);
      });

      await assert.rejects(withQueryTimeout(promise, 50), {
        name: "QueryTimeoutError"
      });
    });

    test("uses custom timeout value", async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve("success"), 100);
      });

      await assert.rejects(withQueryTimeout(promise, 50), {
        name: "QueryTimeoutError"
      });
    });

    test("rejects immediately when timeout is 0", async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve("success"), 1000);
      });

      await assert.rejects(withQueryTimeout(promise, 0), {
        name: "QueryTimeoutError"
      });
    });

    test("propagates promise rejection errors", async () => {
      const promise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error("Promise rejected")), 10);
      });

      await assert.rejects(withQueryTimeout(promise, 1000), /Promise rejected/);
    });
  });

  describe("constants", () => {
    test("DATASET_SIZE_THRESHOLDS are correct", () => {
      assert.strictEqual(DATASET_SIZE_THRESHOLDS.small, 100);
      assert.strictEqual(DATASET_SIZE_THRESHOLDS.medium, 500);
      assert.strictEqual(DATASET_SIZE_THRESHOLDS.large, 2000);
      assert.strictEqual(DATASET_SIZE_THRESHOLDS.xlarge, Infinity);
    });

    test("REPORT_SLO_LATENCY_MS is 5 seconds", () => {
      assert.strictEqual(REPORT_SLO_LATENCY_MS, 5000);
    });
  });

  describe("QueryTimeoutError", () => {
    test("has correct name", () => {
      const error = new QueryTimeoutError();
      assert.strictEqual(error.name, "QueryTimeoutError");
    });

    test("has default message", () => {
      const error = new QueryTimeoutError();
      assert.strictEqual(error.message, "Query execution exceeded timeout threshold");
    });

    test("accepts custom message", () => {
      const error = new QueryTimeoutError("Custom timeout message");
      assert.strictEqual(error.message, "Custom timeout message");
    });
  });

  describe("ValidationError", () => {
    test("has correct name", () => {
      const error = new ValidationError("test");
      assert.strictEqual(error.name, "ValidationError");
    });
  });

  describe("AuthError", () => {
    test("has correct name", () => {
      const error = new AuthError();
      assert.strictEqual(error.name, "AuthError");
    });

    test("has default message", () => {
      const error = new AuthError();
      assert.strictEqual(error.message, "Authentication required");
    });
  });
});

// Note: This test file doesn't use database connections, but adding cleanup hook for consistency
test.after(async () => {
  // No database pool to close in this test file
});
