// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it } from "vitest";
import assert from "node:assert";
import {
  resolveTimezone,
  resolveTimezoneFromOutletAndCompany,
  TimezoneResolutionError,
} from "../../src/time/timezone.js";

describe("resolveTimezone policy", () => {
  it("prefers outlet timezone over company timezone", () => {
    const resolved = resolveTimezone({
      outletTimezone: "Asia/Jakarta",
      companyTimezone: "Asia/Singapore",
    });

    assert.strictEqual(resolved, "Asia/Jakarta");
  });

  it("falls back to company timezone when outlet timezone is missing", () => {
    const resolved = resolveTimezone({
      outletTimezone: null,
      companyTimezone: "America/New_York",
    });

    assert.strictEqual(resolved, "America/New_York");
  });

  it("throws when outlet and company timezones are both missing (no UTC fallback)", () => {
    assert.throws(
      () =>
        resolveTimezone({
          outletTimezone: null,
          companyTimezone: null,
        }),
      (error) => {
        assert.ok(error instanceof TimezoneResolutionError);
        assert.match((error as Error).message, /No UTC fallback is permitted/i);
        return true;
      }
    );
  });
});

describe("resolveTimezoneFromOutletAndCompany", () => {
  it("normalizes undefined and still applies outlet->company resolution order", () => {
    const resolved = resolveTimezoneFromOutletAndCompany(undefined, "Europe/London");
    assert.strictEqual(resolved, "Europe/London");
  });
});
