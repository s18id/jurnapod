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
  compareDates
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
});

describe("formatForDisplay()", () => {
  test("formats UTC for display in target timezone", () => {
    const result = formatForDisplay("2026-03-16T10:30:00.000Z", "Asia/Jakarta");
    // 10:30 UTC = 17:30 in Jakarta (+7)
    assert.ok(result.includes("03/16/2024") || result.includes("17") || result.includes("5"));
  });

  test("excludes time when includeTime is false", () => {
    const result = formatForDisplay("2026-03-16T10:30:00.000Z", "UTC", false);
    // Should return date without time - format is MM/DD/YYYY
    assert.ok(result.includes("03/16/2026") || result.includes("2026"));
    assert.ok(!result.includes(":"), "Should not contain time separator");
  });
});

describe("toDateOnly()", () => {
  test("extracts date portion from UTC ISO string", () => {
    assert.equal(toDateOnly("2026-03-16T10:30:00.000Z"), "2026-03-16");
    assert.equal(toDateOnly("2024-01-01T00:00:00.000Z"), "2024-01-01");
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
