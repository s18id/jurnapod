import { describe, expect, it } from "vitest";

import { buildJournalLineReviewGroups, type FinancialReviewJournalLine } from "@/lib/financial-review-formatters";

const lines: FinancialReviewJournalLine[] = Array.from({ length: 21 }, (_, index) => ({
  id: index + 1,
  account_id: index % 2 === 0 ? 1000 : 2000,
  debit: index % 2 === 0 ? 10 : 0,
  credit: index % 2 === 0 ? 0 : 10,
  description: `Backend line ${index + 1}`,
}));

describe("financial review formatters", () => {
  it("collapses unchanged complex journal lines without recomputing accounting effects", () => {
    const result = buildJournalLineReviewGroups({
      beforeLines: lines,
      resolveAccountLabel: (accountId) => `Account ${accountId}`,
    });

    expect(result.isComplex).toBe(true);
    expect(result.totalLineCount).toBe(21);
    expect(result.totalChangedLineCount).toBe(0);
    expect(result.totalUnchangedLineCount).toBe(21);
    expect(result.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountLabel: "Account 1000", unchangedLineCount: 11, changedLines: [] }),
      expect.objectContaining({ accountLabel: "Account 2000", unchangedLineCount: 10, changedLines: [] }),
    ]));
  });

  it("shows only backend-returned changed lines for complex comparisons", () => {
    const afterLines = lines.map((line) => line.id === 2 ? { ...line, description: "Backend corrected line" } : line);
    const result = buildJournalLineReviewGroups({
      beforeLines: lines,
      afterLines,
      resolveAccountLabel: (accountId) => `Account ${accountId}`,
    });

    expect(result.totalChangedLineCount).toBe(1);
    expect(result.totalUnchangedLineCount).toBe(20);
    expect(result.groups.find((group) => group.accountLabel === "Account 2000")?.changedLines).toEqual([
      { id: 2, description: "Backend corrected line", debit: 0, credit: 10 },
    ]);
  });
});
