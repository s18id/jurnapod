import { describe, expect, it } from "vitest";

import { DiffEngineError, diffValues, formatDiffValue, hasHighValueMoneyDelta } from "@/lib/diff-engine";

describe("diff-engine", () => {
  it("detects added, deleted, changed, and omits unchanged fields", () => {
    const changes = diffValues(
      { supplier: "A", memo: "same", oldOnly: true, amount: "10.00" },
      { supplier: "B", memo: "same", newOnly: true, amount: "10.00" },
      { moneyFields: ["amount"] },
    );

    expect(changes.map((change) => [change.path, change.kind])).toEqual([
      ["newOnly", "added"],
      ["oldOnly", "deleted"],
      ["supplier", "changed"],
    ]);
  });

  it("reports nested changes at 3+ levels", () => {
    const changes = diffValues(
      { header: { supplier: { terms: { days: 30 } } } },
      { header: { supplier: { terms: { days: 45 } } } },
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "header.supplier.terms.days", kind: "changed" });
  });

  it("distinguishes array reorder from add/remove style changes", () => {
    expect(diffValues({ lines: ["a", "b"] }, { lines: ["b", "a"] })[0]).toMatchObject({ path: "lines", kind: "reordered" });
    expect(diffValues({ lines: ["a"] }, { lines: ["a", "b"] })[0]).toMatchObject({ path: "lines", kind: "changed" });
    expect(diffValues({ lines: [] }, { lines: null })[0]).toMatchObject({ path: "lines", kind: "changed" });
    expect(diffValues({ lines: undefined }, { lines: [] })[0]).toMatchObject({ path: "lines", kind: "added" });
  });

  it("handles circular references deterministically", () => {
    const cyclic: Record<string, unknown> = { name: "cycle" };
    cyclic.self = cyclic;

    expect(() => diffValues(cyclic, { name: "cycle" })).toThrow(DiffEngineError);
    expect(() => diffValues(cyclic, { name: "cycle" })).toThrow("Cannot diff circular references");
  });

  it("formats money with configured precision without truncating cents", () => {
    const changes = diffValues(
      { total_amount: "100.50", tax: "0" },
      { total_amount: "100.57", tax: "0.1234" },
      { moneyFields: ["total_amount", "tax"], moneyPrecision: 2 },
    );

    expect(changes.find((change) => change.path === "total_amount")?.oldFormatted).toBe("100.50");
    expect(changes.find((change) => change.path === "total_amount")?.newFormatted).toBe("100.57");
    expect(formatDiffValue("tax", "0.1234", { moneyFields: ["tax"], moneyPrecision: 2 })).toBe("0.1234");
    expect(formatDiffValue("tax", 0.1234, { moneyFields: ["tax"], moneyPrecision: 2 })).toBe("0.1234");
    expect(formatDiffValue("tax", 0, { moneyFields: ["tax"], moneyPrecision: 2 })).toBe("0.00");
  });

  it("formats date strings and detects high-value monetary deltas", () => {
    expect(formatDiffValue("posted_at", "2026-05-19T10:11:12.000Z", { dateFields: ["posted_at"] })).toBe("2026-05-19 10:11:12 UTC");
    const changes = diffValues({ amount: "1.00" }, { amount: "10001.00" }, { moneyFields: ["amount"] });

    expect(hasHighValueMoneyDelta(changes, 10000)).toBe(true);
  });
});
