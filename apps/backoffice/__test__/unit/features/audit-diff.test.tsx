import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AuditDiff,
  formatDiffValue,
  parseAuditChanges,
} from "@/features/audit/audit-diff";

describe("parseAuditChanges", () => {
  it("parses valid changes_json with old/new structure", () => {
    const changes = parseAuditChanges(JSON.stringify({
      name: { old: "Alice", new: "Bob" },
      age: { old: 30, new: 31 },
    }));

    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual({ field: "name", oldValue: "Alice", newValue: "Bob" });
    expect(changes[1]).toEqual({ field: "age", oldValue: 30, newValue: 31 });
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseAuditChanges("not json")).toEqual([]);
  });

  it("returns empty array for non-object JSON", () => {
    expect(parseAuditChanges("[1,2,3]")).toEqual([]);
  });

  it("handles flat values without old/new wrapper", () => {
    const changes = parseAuditChanges(JSON.stringify({ status: "active" }));
    expect(changes).toEqual([{ field: "status", oldValue: "active", newValue: "active" }]);
  });
});

describe("formatDiffValue", () => {
  it("formats null/undefined as em-dash", () => {
    expect(formatDiffValue(null)).toBe("—");
    expect(formatDiffValue(undefined)).toBe("—");
  });

  it("formats booleans as Yes/No", () => {
    expect(formatDiffValue(true)).toBe("Yes");
    expect(formatDiffValue(false)).toBe("No");
  });

  it("formats numbers as strings", () => {
    expect(formatDiffValue(42)).toBe("42");
    expect(formatDiffValue(3.14)).toBe("3.14");
  });

  it("formats strings directly", () => {
    expect(formatDiffValue("hello")).toBe("hello");
  });

  it("formats objects as JSON", () => {
    expect(formatDiffValue({ a: 1 })).toBe('{"a":1}');
  });
});

function renderDiff(changesJson: string, maxFields = 50): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, {},
      createElement(AuditDiff, { changesJson, maxFields }),
    ),
  );
}

describe("AuditDiff rendering", () => {
  it("renders empty state for empty changes", () => {
    const html = renderDiff("{}");
    expect(html).toContain("No detailed changes available");
  });

  it("renders a table with before/after columns for changes", () => {
    const html = renderDiff(JSON.stringify({
      name: { old: "Alice", new: "Bob" },
      age: { old: 30, new: 31 },
    }));
    expect(html).toContain("name");
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("age");
    expect(html).toContain("30");
    expect(html).toContain("31");
  });

  it("respects maxFields limit and shows overflow message", () => {
    const changes: Record<string, { old: string; new: string }> = {};
    for (let i = 0; i < 5; i++) {
      changes[`field_${i}`] = { old: "a", new: "b" };
    }

    const html = renderDiff(JSON.stringify(changes), 3);
    expect(html).toContain("field_0");
    expect(html).toContain("field_1");
    expect(html).toContain("field_2");
    expect(html).not.toContain("field_3");
    expect(html).not.toContain("field_4");
    expect(html).toContain("+2 more fields");
  });
});
