// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Unit tests for date-helpers timezone boundary conversion functionality.
// Run with: node --test --import tsx apps/api/src/lib/date-helpers.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  normalizeDate,
  normalizeDateTime,
  toDateTimeRangeWithTimezone,
  isValidDate,
  isValidDateTime,
  formatForDisplay,
  toDateOnly,
  isInFiscalYear,
  nowUTC,
  addDays,
  compareDates,
  isValidTimeZone,
  toUtcInstant,
  fromUtcInstant,
  toEpochMs,
  fromEpochMs,
  toBusinessDate,
  resolveEventTime
} from "./date-helpers";

describe("normalizeDate()", () => {
  describe("start boundary", () => {
    test("Asia/Jakarta (+7) - midnight local converts to previous day UTC", () => {
      const result = normalizeDate("2024-01-01", "Asia/Jakarta", "start");
      // midnight Jakarta (UTC+7) = 17:00 UTC previous day
      assert.equal(result, "2023-12-31T17:00:00.000Z");
    });

    test("America/New_York (EDT -4) - midnight local converts to same day UTC", () => {
      const result = normalizeDate("2024-06-15", "America/New_York", "start");
      // midnight EDT (UTC-4) = 04:00 UTC same day
      assert.equal(result, "2024-06-15T04:00:00.000Z");
    });

    test("America/New_York (EST -5) - midnight local converts to same day UTC", () => {
      const result = normalizeDate("2024-01-15", "America/New_York", "start");
      // midnight EST (UTC-5) = 05:00 UTC same day
      assert.equal(result, "2024-01-15T05:00:00.000Z");
    });

    test("UTC timezone - midnight local stays as midnight UTC", () => {
      const result = normalizeDate("2024-01-01", "UTC", "start");
      assert.equal(result, "2024-01-01T00:00:00.000Z");
    });

    test("Pacific/Auckland (+13 NZDT) - midnight local converts to previous day UTC", () => {
      const result = normalizeDate("2024-01-15", "Pacific/Auckland", "start");
      // midnight NZDT (UTC+13) = 11:00 UTC previous day
      assert.equal(result, "2024-01-14T11:00:00.000Z");
    });

    test("Pacific/Midway (-11) - midnight local converts to same day UTC", () => {
      const result = normalizeDate("2024-06-15", "Pacific/Midway", "start");
      // midnight -11 = 11:00 UTC same day
      assert.equal(result, "2024-06-15T11:00:00.000Z");
    });
  });

  describe("end boundary", () => {
    test("Asia/Jakarta (+7) - end of day converts to same day UTC", () => {
      const result = normalizeDate("2024-01-01", "Asia/Jakarta", "end");
      // 23:59:59 Jakarta (UTC+7) = 16:59:59 UTC same day
      assert.equal(result, "2024-01-01T16:59:59.999Z");
    });

    test("America/New_York (EST -5) - end of day converts to next day UTC", () => {
      const result = normalizeDate("2024-01-15", "America/New_York", "end");
      // 23:59:59 EST (UTC-5) = 04:59:59 UTC next day
      assert.equal(result, "2024-01-16T04:59:59.999Z");
    });

    test("America/New_York (EDT -4) - end of day converts to next day UTC", () => {
      const result = normalizeDate("2024-06-15", "America/New_York", "end");
      // 23:59:59 EDT (UTC-4) = 03:59:59 UTC next day
      assert.equal(result, "2024-06-16T03:59:59.999Z");
    });

    test("UTC - end of day stays as end of day UTC", () => {
      const result = normalizeDate("2024-01-01", "UTC", "end");
      assert.equal(result, "2024-01-01T23:59:59.999Z");
    });
  });

  describe("error handling", () => {
    test("throws on invalid date format", () => {
      assert.throws(
        () => normalizeDate("2024/01/01", "UTC", "start"),
        /Invalid date format/
      );
    });

    test("throws on invalid date components", () => {
      assert.throws(
        () => normalizeDate("2024-13-01", "UTC", "start"),
        /Invalid date format/
      );
    });

    test("throws on invalid timezone", () => {
      // This will throw because the timezone cannot be parsed
      assert.throws(
        () => normalizeDate("2024-01-01", "Invalid/Timezone", "start")
      );
    });
  });
});

describe("toDateTimeRangeWithTimezone()", () => {
  test("single date range for Asia/Jakarta", () => {
    const result = toDateTimeRangeWithTimezone(
      "2024-01-01",
      "2024-01-01",
      "Asia/Jakarta"
    );

    assert.equal(result.fromStartUTC, "2023-12-31T17:00:00.000Z");
    assert.equal(result.toEndUTC, "2024-01-01T16:59:59.999Z");
  });

  test("single date range for America/New_York (EDT)", () => {
    const result = toDateTimeRangeWithTimezone(
      "2024-06-15",
      "2024-06-15",
      "America/New_York"
    );

    assert.equal(result.fromStartUTC, "2024-06-15T04:00:00.000Z");
    assert.equal(result.toEndUTC, "2024-06-16T03:59:59.999Z");
  });

  test("single date range for UTC", () => {
    const result = toDateTimeRangeWithTimezone(
      "2024-01-01",
      "2024-01-01",
      "UTC"
    );

    assert.equal(result.fromStartUTC, "2024-01-01T00:00:00.000Z");
    assert.equal(result.toEndUTC, "2024-01-01T23:59:59.999Z");
  });

  test("multi-day range for Asia/Jakarta", () => {
    const result = toDateTimeRangeWithTimezone(
      "2024-01-01",
      "2024-01-31",
      "Asia/Jakarta"
    );

    assert.equal(result.fromStartUTC, "2023-12-31T17:00:00.000Z");
    assert.equal(result.toEndUTC, "2024-01-31T16:59:59.999Z");
  });

  test("year-end range crossing UTC midnight for Tokyo", () => {
    const result = toDateTimeRangeWithTimezone(
      "2024-12-31",
      "2024-12-31",
      "Asia/Tokyo"
    );

    // Tokyo is +9, so midnight Dec 31 = 15:00 UTC Dec 30
    assert.equal(result.fromStartUTC, "2024-12-30T15:00:00.000Z");
  });

  test("Pacific/Auckland extreme positive offset", () => {
    const result = toDateTimeRangeWithTimezone(
      "2024-01-15",
      "2024-01-15",
      "Pacific/Auckland"
    );

    // NZDT is +13 in January, midnight = 11:00 UTC previous day
    assert.equal(result.fromStartUTC, "2024-01-14T11:00:00.000Z");
  });

  test("Pacific/Midway extreme negative offset", () => {
    const result = toDateTimeRangeWithTimezone(
      "2024-06-15",
      "2024-06-15",
      "Pacific/Midway"
    );

    // Midway is -11, midnight = 11:00 UTC same day
    assert.equal(result.fromStartUTC, "2024-06-15T11:00:00.000Z");
  });
});

describe("DST transitions", () => {
  test("spring forward America/New_York - EST to EDT transition", () => {
    // DST starts March 10, 2024 at 2:00 AM
    const beforeTransition = toDateTimeRangeWithTimezone(
      "2024-03-09",
      "2024-03-09",
      "America/New_York"
    );
    const onTransition = toDateTimeRangeWithTimezone(
      "2024-03-10",
      "2024-03-10",
      "America/New_York"
    );
    const afterTransition = toDateTimeRangeWithTimezone(
      "2024-03-11",
      "2024-03-11",
      "America/New_York"
    );

    // March 9 is EST (UTC-5), midnight = 05:00 UTC
    assert.equal(beforeTransition.fromStartUTC, "2024-03-09T05:00:00.000Z");
    // March 10 starts as EST but ends as EDT, midnight = 05:00 UTC
    assert.equal(onTransition.fromStartUTC, "2024-03-10T05:00:00.000Z");
    // March 11 is EDT (UTC-4), midnight = 04:00 UTC
    assert.equal(afterTransition.fromStartUTC, "2024-03-11T04:00:00.000Z");
  });

  test("fall back America/New_York - EDT to EST transition", () => {
    // DST ends November 3, 2024 at 2:00 AM
    const beforeTransition = toDateTimeRangeWithTimezone(
      "2024-11-02",
      "2024-11-02",
      "America/New_York"
    );

    // November 2 is EDT (UTC-4), midnight = 04:00 UTC
    assert.equal(beforeTransition.fromStartUTC, "2024-11-02T04:00:00.000Z");
  });

  test("Europe/London DST transition - GMT to BST", () => {
    // BST starts March 31, 2024
    const winter = toDateTimeRangeWithTimezone(
      "2024-03-30",
      "2024-03-30",
      "Europe/London"
    );

    // March 30 is GMT (UTC+0), midnight = 00:00 UTC
    assert.equal(winter.fromStartUTC, "2024-03-30T00:00:00.000Z");
  });
});

describe("normalizeDateTime()", () => {
  test("converts RFC 3339 with positive offset to UTC", () => {
    const result = normalizeDateTime("2026-03-16T17:30:00+07:00");
    assert.equal(result, "2026-03-16T10:30:00.000Z");
  });

  test("converts RFC 3339 with negative offset to UTC", () => {
    const result = normalizeDateTime("2026-03-16T10:30:00-05:00");
    assert.equal(result, "2026-03-16T15:30:00.000Z");
  });

  test("converts RFC 3339 with Z suffix to UTC", () => {
    const result = normalizeDateTime("2026-03-16T10:30:00Z");
    assert.equal(result, "2026-03-16T10:30:00.000Z");
  });

  test("preserves fractional seconds", () => {
    const result = normalizeDateTime("2026-03-16T17:30:00.123+07:00");
    assert.equal(result, "2026-03-16T10:30:00.123Z");
  });

  test("throws on invalid datetime", () => {
    assert.throws(
      () => normalizeDateTime("invalid-datetime"),
      /Invalid RFC 3339 datetime/
    );
  });

  test("throws on rolled date (Feb 30) via isValidDateTime guard", () => {
    // new Date("2026-02-30T10:30:00Z") silently rolls to March 2 — normalizeDateTime now rejects.
    assert.throws(
      () => normalizeDateTime("2026-02-30T10:30:00Z"),
      /Invalid RFC 3339 datetime/
    );
  });

  test("throws on invalid time component (hour 25) via isValidDateTime guard", () => {
    assert.throws(
      () => normalizeDateTime("2026-01-01T25:00:00Z"),
      /Invalid RFC 3339 datetime/
    );
  });
});

describe("isValidDate()", () => {
  test("returns true for valid YYYY-MM-DD", () => {
    assert.equal(isValidDate("2024-01-01"), true);
    assert.equal(isValidDate("2024-12-31"), true);
    assert.equal(isValidDate("2020-02-29"), true); // leap year
  });

  test("returns false for invalid format", () => {
    assert.equal(isValidDate("2024/01/01"), false);
    assert.equal(isValidDate("01-01-2024"), false);
    assert.equal(isValidDate("2024-1-01"), false);
    assert.equal(isValidDate("2024-01-1"), false);
  });

  test("returns false for invalid date values", () => {
    assert.equal(isValidDate("2024-13-01"), false);
    assert.equal(isValidDate("2024-00-01"), false);
    assert.equal(isValidDate("2024-01-32"), false);
    assert.equal(isValidDate("2023-02-29"), false); // not a leap year
  });
});

describe("isValidDateTime()", () => {
  test("returns true for valid RFC 3339", () => {
    assert.equal(isValidDateTime("2026-03-16T17:30:00+07:00"), true);
    assert.equal(isValidDateTime("2026-03-16T10:30:00Z"), true);
    assert.equal(isValidDateTime("2026-03-16T10:30:00.123-05:00"), true);
  });

  test("returns false for invalid format", () => {
    assert.equal(isValidDateTime("2026-03-16"), false);
    assert.equal(isValidDateTime("2026/03/16T10:30:00Z"), false);
    assert.equal(isValidDateTime("invalid"), false);
  });

  test("returns false for invalid date values", () => {
    assert.equal(isValidDateTime("2026-13-16T10:30:00Z"), false);
  });

  test("returns false for rolled dates (Feb 30, March 32) that Date accepts silently", () => {
    // new Date("2026-02-30T10:30:00Z") silently rolls to March 2 — must reject.
    assert.equal(isValidDateTime("2026-02-30T10:30:00Z"), false);
    // March 32 does not exist — must reject.
    assert.equal(isValidDateTime("2026-03-32T10:30:00Z"), false);
  });

  test("returns false for invalid time components (hour 25, minute 61, second 61)", () => {
    assert.equal(isValidDateTime("2026-01-01T25:00:00Z"), false);
    assert.equal(isValidDateTime("2026-01-01T12:61:00Z"), false);
    assert.equal(isValidDateTime("2026-01-01T12:30:61Z"), false);
  });

  test("returns false for invalid offset hours (e.g. +25:00)", () => {
    assert.equal(isValidDateTime("2026-01-01T10:30:00+25:00"), false);
    assert.equal(isValidDateTime("2026-01-01T10:30:00+00:99"), false);
  });

  test("returns false for leap seconds (ss=60) — not supported by this system", () => {
    // Leap seconds are silently rolled back to ss=59 by Temporal, which could cause
    // off-by-one-second audit discrepancies in financial systems. We reject them.
    assert.equal(isValidDateTime("2026-01-01T23:59:60Z"), false);
  });
});

describe("formatForDisplay()", () => {
  test("formats UTC for display in target timezone", () => {
    const result = formatForDisplay("2026-03-16T10:30:00.000Z", "Asia/Jakarta");
    // 10:30 UTC = 17:30 in Jakarta (+7)
    assert.equal(result, "2026-03-16 17:30:00");
  });

  test("excludes time when includeTime is false", () => {
    const result = formatForDisplay("2026-03-16T10:30:00.000Z", "UTC", false);
    assert.equal(result, "2026-03-16");
  });

  test("throws on invalid UTC instant", () => {
    assert.throws(() => formatForDisplay("not-a-date", "UTC"), /Invalid UTC instant/);
  });

  test("throws on invalid timezone", () => {
    assert.throws(() => formatForDisplay("2026-03-16T10:30:00.000Z", "Not/A_Timezone"), /Invalid timezone/);
  });
});

describe("toDateOnly()", () => {
  test("extracts date portion from UTC ISO string", () => {
    assert.equal(toDateOnly("2026-03-16T10:30:00.000Z"), "2026-03-16");
    assert.equal(toDateOnly("2024-01-01T00:00:00.000Z"), "2024-01-01");
  });

  test("normalizes offset timestamps before extracting UTC date", () => {
    assert.equal(toDateOnly("2026-03-16T01:30:00+07:00"), "2026-03-15");
  });

  test("throws on invalid input", () => {
    assert.throws(() => toDateOnly("not-a-date"), /Cannot convert to UTC instant/);
  });
});

describe("isInFiscalYear()", () => {
  test("returns true when transaction is within fiscal year", () => {
    const result = isInFiscalYear(
      "2024-06-15T10:00:00.000Z",
      "2024-01-01T00:00:00.000Z",
      "2024-12-31T23:59:59.999Z"
    );
    assert.equal(result, true);
  });

  test("returns false when transaction is before fiscal year", () => {
    const result = isInFiscalYear(
      "2023-12-31T23:59:59.000Z",
      "2024-01-01T00:00:00.000Z",
      "2024-12-31T23:59:59.999Z"
    );
    assert.equal(result, false);
  });

  test("returns false when transaction is after fiscal year", () => {
    const result = isInFiscalYear(
      "2025-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z",
      "2024-12-31T23:59:59.999Z"
    );
    assert.equal(result, false);
  });

  test("returns true for boundary values", () => {
    assert.equal(
      isInFiscalYear(
        "2024-01-01T00:00:00.000Z",
        "2024-01-01T00:00:00.000Z",
        "2024-12-31T23:59:59.999Z"
      ),
      true
    );
    assert.equal(
      isInFiscalYear(
        "2024-12-31T23:59:59.999Z",
        "2024-01-01T00:00:00.000Z",
        "2024-12-31T23:59:59.999Z"
      ),
      true
    );
  });
});

describe("nowUTC()", () => {
  test("returns valid UTC ISO string", () => {
    const result = nowUTC();
    assert.ok(isValidDateTime(result));
    assert.ok(result.endsWith("Z"));
  });
});

describe("addDays()", () => {
  test("adds days correctly", () => {
    assert.equal(
      addDays("2024-01-01T00:00:00.000Z", 1),
      "2024-01-02T00:00:00.000Z"
    );
    assert.equal(
      addDays("2024-01-01T00:00:00.000Z", 31),
      "2024-02-01T00:00:00.000Z"
    );
  });

  test("subtracts days correctly", () => {
    assert.equal(
      addDays("2024-01-02T00:00:00.000Z", -1),
      "2024-01-01T00:00:00.000Z"
    );
  });

  test("handles leap year correctly", () => {
    assert.equal(
      addDays("2024-02-28T00:00:00.000Z", 1),
      "2024-02-29T00:00:00.000Z"
    );
    assert.equal(
      addDays("2024-02-29T00:00:00.000Z", 1),
      "2024-03-01T00:00:00.000Z"
    );
  });

  test("handles year boundary", () => {
    assert.equal(
      addDays("2024-12-31T00:00:00.000Z", 1),
      "2025-01-01T00:00:00.000Z"
    );
  });
});

describe("compareDates()", () => {
  test("returns -1 when first date is earlier", () => {
    assert.equal(compareDates("2024-01-01T00:00:00.000Z", "2024-01-02T00:00:00.000Z"), -1);
  });

  test("returns 1 when first date is later", () => {
    assert.equal(compareDates("2024-01-02T00:00:00.000Z", "2024-01-01T00:00:00.000Z"), 1);
  });

  test("returns 0 when dates are equal", () => {
    assert.equal(compareDates("2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"), 0);
  });
});

// ---------------------------------------------------------------------------
// New public contract tests
// ---------------------------------------------------------------------------

describe("isValidTimeZone()", () => {
  test("returns true for valid IANA timezones", () => {
    assert.equal(isValidTimeZone("Asia/Jakarta"), true);
    assert.equal(isValidTimeZone("America/New_York"), true);
    assert.equal(isValidTimeZone("UTC"), true);
    assert.equal(isValidTimeZone("Pacific/Auckland"), true);
  });

  test("returns false for invalid timezone strings", () => {
    assert.equal(isValidTimeZone("Not/A_Timezone"), false);
    assert.equal(isValidTimeZone("GMT+8"), false);
    assert.equal(isValidTimeZone(""), false);
  });

  test("returns false for UTC+offset legacy forms", () => {
    assert.equal(isValidTimeZone("UTC+8"), false);
    assert.equal(isValidTimeZone("UTC-05:00"), false);
    assert.equal(isValidTimeZone("UTC+07:30"), false);
  });

  test("accepts bare UTC (valid IANA timezone)", () => {
    assert.equal(isValidTimeZone("UTC"), true);
  });

  test("accepts bare GMT; rejects GMT+offset forms", () => {
    assert.equal(isValidTimeZone("GMT"), true);
    assert.equal(isValidTimeZone("gmt"), true); // case-insensitive
    assert.equal(isValidTimeZone("GMT+8"), false);
    assert.equal(isValidTimeZone("GMT-05:00"), false);
  });

  test("rejects non-IANA US timezone abbreviations with offsets (AST, HST, AKST)", () => {
    assert.equal(isValidTimeZone("AST-4"), false);
    assert.equal(isValidTimeZone("HST+0"), false);
    assert.equal(isValidTimeZone("AKST-9"), false);
  });

  test("returns false for garbage input", () => {
    assert.equal(isValidTimeZone("something"), false);
  });
});

describe("toUtcInstant()", () => {
  test("converts RFC 3339 with positive offset to UTC", () => {
    const result = toUtcInstant("2026-03-16T17:30:00+07:00");
    assert.equal(result, "2026-03-16T10:30:00.000Z");
  });

  test("converts RFC 3339 with negative offset to UTC", () => {
    const result = toUtcInstant("2026-03-16T10:30:00-05:00");
    assert.equal(result, "2026-03-16T15:30:00.000Z");
  });

  test("accepts bare UTC ISO string unchanged", () => {
    const result = toUtcInstant("2026-03-16T10:30:00.000Z");
    assert.equal(result, "2026-03-16T10:30:00.000Z");
  });

  test("throws on unparseable input", () => {
    assert.throws(() => toUtcInstant("not-a-date"), /Cannot convert to UTC instant/);
  });

  test("returns primitives only (string)", () => {
    const result = toUtcInstant("2026-03-16T10:30:00.000Z");
    assert.equal(typeof result, "string");
  });
});

describe("fromUtcInstant()", () => {
  test("formats UTC instant in target timezone with offset", () => {
    // 10:30 UTC = 17:30 Jakarta (+07:00)
    const result = fromUtcInstant("2026-03-16T10:30:00.000Z", "Asia/Jakarta");
    assert.equal(result, "2026-03-16T17:30:00.000+07:00");
  });

  test("formats UTC instant in negative offset timezone", () => {
    // 10:30 UTC = 05:30 New York (EST, UTC-5) in January
    const result = fromUtcInstant("2026-01-15T10:30:00.000Z", "America/New_York");
    assert.equal(result, "2026-01-15T05:30:00.000-05:00");
  });

  test("formats UTC instant in UTC timezone", () => {
    const result = fromUtcInstant("2026-03-16T10:30:00.000Z", "UTC");
    assert.equal(result, "2026-03-16T10:30:00.000+00:00");
  });

  test("throws on invalid UTC instant", () => {
    assert.throws(() => fromUtcInstant("not-a-date", "Asia/Jakarta"), /Invalid UTC instant/);
  });

  test("returns primitives only (string)", () => {
    const result = fromUtcInstant("2026-03-16T10:30:00.000Z", "UTC");
    assert.equal(typeof result, "string");
  });
});

describe("toEpochMs()", () => {
  test("converts UTC ISO to epoch milliseconds", () => {
    // Use a value we derive from the ISO string so the pair is self-consistent
    const iso = "2026-03-16T10:30:00.000Z";
    const expected = new Date(iso).getTime();
    const result = toEpochMs(iso);
    assert.equal(result, expected);
  });

  test("throws on invalid UTC instant", () => {
    assert.throws(() => toEpochMs("not-a-date"), /Invalid UTC instant/);
  });

  test("returns primitives only (number)", () => {
    const iso = "2026-03-16T10:30:00.000Z";
    const result = toEpochMs(iso);
    assert.equal(typeof result, "number");
    assert.equal(result, new Date(iso).getTime());
  });
});

describe("fromEpochMs()", () => {
  test("converts epoch milliseconds to UTC ISO string", () => {
    // Self-consistent: round-trip through Date to avoid hardcoding
    const ts = 1773657000000; // pick a known epoch
    const expected = new Date(ts).toISOString();
    assert.equal(fromEpochMs(ts), expected);
  });

  test("returns primitives only (string)", () => {
    const result = fromEpochMs(1710587400000);
    assert.equal(typeof result, "string");
  });
});

describe("toBusinessDate()", () => {
  test("derives business-local date from UTC instant in Jakarta", () => {
    // 2026-03-15T17:00:00Z = 2026-03-16T00:00:00+07:00
    const result = toBusinessDate("2026-03-15T17:00:00.000Z", "Asia/Jakarta");
    assert.equal(result, "2026-03-16");
  });

  test("derives business-local date from UTC instant in New York (EST)", () => {
    // 2026-01-15T05:00:00Z = 2026-01-15T00:00:00-05:00
    const result = toBusinessDate("2026-01-15T05:00:00.000Z", "America/New_York");
    assert.equal(result, "2026-01-15");
  });

  test("throws on invalid UTC instant", () => {
    assert.throws(() => toBusinessDate("not-a-date", "Asia/Jakarta"), /Invalid UTC instant/);
  });

  test("throws on invalid timezone", () => {
    assert.throws(() => toBusinessDate("2026-03-15T17:00:00.000Z", "Not/A_Timezone"), /Invalid timezone/);
  });

  test("returns primitives only (string)", () => {
    const result = toBusinessDate("2026-03-15T17:00:00.000Z", "Asia/Jakarta");
    assert.equal(typeof result, "string");
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result));
  });
});

describe("resolveEventTime()", () => {
  test("resolves from UTC instant (at)", () => {
    const result = resolveEventTime({ at: "2026-03-16T10:30:00.000Z" });
    assert.equal(result, "2026-03-16T10:30:00.000Z");
  });

  test("resolves from epoch ms (ts)", () => {
    // Self-consistent: use the Date object to derive expected value
    const ts = 1773657000000;
    const expected = new Date(ts).toISOString();
    const result = resolveEventTime({ ts });
    assert.equal(result, expected);
  });

  test("resolves from business-local date (date+timezone)", () => {
    // midnight March 16 in Jakarta = 2026-03-15T17:00:00Z
    const result = resolveEventTime({
      date: "2026-03-16",
      timezone: "Asia/Jakarta"
    });
    assert.equal(result, "2026-03-15T17:00:00.000Z");
  });

  test("resolves from business-local date with hour/minute", () => {
    // 09:00 March 16 in Jakarta = 2026-03-16T02:00:00Z
    const result = resolveEventTime({
      date: "2026-03-16",
      timezone: "Asia/Jakarta",
      hour: 9,
      minute: 0
    });
    assert.equal(result, "2026-03-16T02:00:00.000Z");
  });

  test("throws when given no valid input", () => {
    assert.throws(
      () => resolveEventTime({}),
      /resolveEventTime requires/
    );
  });

  test("throws on non-finite epoch ms (NaN)", () => {
    assert.throws(
      () => resolveEventTime({ ts: NaN }),
      /Invalid epoch ms/
    );
  });

  test("throws on non-finite epoch ms (Infinity)", () => {
    assert.throws(
      () => resolveEventTime({ ts: Infinity }),
      /Invalid epoch ms/
    );
  });

  test("throws on invalid timezone for date+timezone input", () => {
    assert.throws(
      () => resolveEventTime({ date: "2026-03-16", timezone: "Not/A_Timezone" }),
      /Invalid timezone/
    );
  });

  test("returns primitives only (string)", () => {
    const result = resolveEventTime({ at: "2026-03-16T10:30:00.000Z" });
    assert.equal(typeof result, "string");
  });
});

describe("local time range validation", () => {
  test("throws on invalid hour (> 23)", () => {
    assert.throws(
      () => resolveEventTime({ date: "2026-03-16", timezone: "UTC", hour: 24 }),
      /Invalid hour/
    );
  });

  test("throws on invalid hour (< 0)", () => {
    assert.throws(
      () => resolveEventTime({ date: "2026-03-16", timezone: "UTC", hour: -1 }),
      /Invalid hour/
    );
  });

  test("throws on invalid minute (> 59)", () => {
    assert.throws(
      () => resolveEventTime({ date: "2026-03-16", timezone: "UTC", minute: 60 }),
      /Invalid minute/
    );
  });

  test("throws on invalid minute (< 0)", () => {
    assert.throws(
      () => resolveEventTime({ date: "2026-03-16", timezone: "UTC", minute: -1 }),
      /Invalid minute/
    );
  });

  test("throws on non-integer float values for hour and minute", () => {
    assert.throws(
      () => resolveEventTime({ date: "2026-03-16", timezone: "UTC", hour: 2.5 }),
      /Invalid hour.*Must be an integer/s
    );
    assert.throws(
      () => resolveEventTime({ date: "2026-03-16", timezone: "UTC", minute: 30.5 }),
      /Invalid minute.*Must be an integer/s
    );
  });
});

describe("DST gap and overlap handling", () => {
  test("throws when local time falls in a DST spring-forward gap (America/New_York)", () => {
    // March 10, 2024: clocks spring forward from 2:00 AM to 3:00 AM.
    // 02:30 local time does not exist on this day.
    assert.throws(
      () => resolveEventTime({ date: "2024-03-10", timezone: "America/New_York", hour: 2, minute: 30 }),
      /Invalid date-time/
    );
  });

  test("throws when local time falls in a DST overlap (America/New_York fall-back)", () => {
    // November 3, 2024: clocks fall back from 2:00 AM to 1:00 AM.
    // 01:30 occurs twice (before and after the fall-back); disambiguation: 'reject' throws.
    assert.throws(
      () => resolveEventTime({ date: "2024-11-03", timezone: "America/New_York", hour: 1, minute: 30 }),
      /Invalid date-time/
    );
  });

  test("DST gap error message contains timezone and DST keyword (not raw Temporal error)", () => {
    try {
      resolveEventTime({ date: "2024-03-10", timezone: "America/New_York", hour: 2, minute: 30 });
      assert.fail("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      assert.ok(msg.includes("Invalid date-time"), `Expected "Invalid date-time" in message, got: ${msg}`);
      assert.ok(msg.includes("America/New_York"), `Expected timezone in message, got: ${msg}`);
      assert.ok(msg.includes("DST"), `Expected "DST" keyword in message, got: ${msg}`);
    }
  });

  test("valid local time on a DST transition day resolves without error", () => {
    // 03:00 on March 10, 2024 exists (after spring-forward).
    const result = resolveEventTime({ date: "2024-03-10", timezone: "America/New_York", hour: 3, minute: 0 });
    assert.equal(typeof result, "string");
    assert.ok(result.endsWith("Z"));
  });

  test("valid local time before DST transition resolves without error", () => {
    // 01:00 on March 10, 2024 exists (before spring-forward).
    const result = resolveEventTime({ date: "2024-03-10", timezone: "America/New_York", hour: 1, minute: 0 });
    assert.equal(typeof result, "string");
    assert.ok(result.endsWith("Z"));
  });
});
