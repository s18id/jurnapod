// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Regression tests for RFC3339 timezone validation in timestamp module
 * @module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { Temporal } from "@js-temporal/polyfill";
import { toUnixMs } from "./timestamp.js";

describe("toUnixMs timezone validation", () => {
  it("accepts RFC3339/ISO instant with Z suffix", () => {
    const result = toUnixMs("2026-04-06T10:00:00Z");
    const expected = Temporal.Instant.from("2026-04-06T10:00:00Z").epochMilliseconds;
    assert.strictEqual(result, expected);
  });

  it("accepts RFC3339/ISO instant with positive timezone offset", () => {
    const result = toUnixMs("2026-04-06T10:00:00+05:30");
    const expected = Temporal.Instant.from("2026-04-06T10:00:00+05:30").epochMilliseconds;
    assert.strictEqual(result, expected);
  });

  it("accepts RFC3339/ISO instant with negative timezone offset", () => {
    const result = toUnixMs("2026-04-06T10:00:00-08:00");
    const expected = Temporal.Instant.from("2026-04-06T10:00:00-08:00").epochMilliseconds;
    assert.strictEqual(result, expected);
  });

  it("throws descriptive error for MySQL DATETIME format (no timezone)", () => {
    // MySQL DATETIME format lacks timezone - this is the regression for the bug
    // where reservation-groups.test.ts was using toDbDateTime() instead of toISOString()
    const mysqlFormat = "2026-04-06 10:00:00";
    assert.throws(
      () => toUnixMs(mysqlFormat),
      /reservationAt must be RFC3339 with timezone offset/
    );
  });

  it("throws descriptive error for bare date format", () => {
    const bareDate = "2026-04-06";
    assert.throws(
      () => toUnixMs(bareDate),
      /reservationAt must be RFC3339 with timezone offset/
    );
  });

  it("throws descriptive error for invalid string", () => {
    const invalid = "not-a-timestamp";
    assert.throws(
      () => toUnixMs(invalid),
      /reservationAt must be RFC3339 with timezone offset/
    );
  });
});
