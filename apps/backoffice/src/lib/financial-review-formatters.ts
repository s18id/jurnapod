export interface FinancialReviewJournalLine {
  id: number;
  account_id: number;
  debit: number;
  credit: number;
  description?: string | null;
}

export interface JournalLineReviewGroupLine {
  id: number;
  description: string;
  debit: number;
  credit: number;
}

export interface JournalLineReviewGroup {
  accountKey: string;
  accountLabel: string;
  changedLines: JournalLineReviewGroupLine[];
  unchangedLineCount: number;
}

export interface JournalLineReviewGroupsResult {
  isComplex: boolean;
  totalLineCount: number;
  totalChangedLineCount: number;
  totalUnchangedLineCount: number;
  groups: JournalLineReviewGroup[];
}

function lineSignature(line: FinancialReviewJournalLine): string {
  return [
    line.account_id,
    Number(line.debit) || 0,
    Number(line.credit) || 0,
    line.description?.trim() ?? "",
  ].join("|");
}

function toReviewGroupLine(line: FinancialReviewJournalLine): JournalLineReviewGroupLine {
  return {
    id: line.id,
    description: line.description?.trim() || "—",
    debit: Number(line.debit) || 0,
    credit: Number(line.credit) || 0,
  };
}

export function buildJournalLineReviewGroups(params: {
  beforeLines: readonly FinancialReviewJournalLine[];
  afterLines?: readonly FinancialReviewJournalLine[];
  resolveAccountLabel: (accountId: number) => string;
  complexLineThreshold?: number;
}): JournalLineReviewGroupsResult {
  const threshold = params.complexLineThreshold ?? 20;
  const afterLines = params.afterLines ?? params.beforeLines;
  const beforeById = new Map(params.beforeLines.map((line) => [line.id, lineSignature(line)]));
  const groupsByAccount = new Map<string, JournalLineReviewGroup>();

  let totalChangedLineCount = 0;
  let totalUnchangedLineCount = 0;

  for (const line of afterLines) {
    const accountLabel = params.resolveAccountLabel(line.account_id);
    const accountKey = `${line.account_id}:${accountLabel}`;
    const group = groupsByAccount.get(accountKey) ?? {
      accountKey,
      accountLabel,
      changedLines: [],
      unchangedLineCount: 0,
    };

    if (beforeById.get(line.id) === lineSignature(line)) {
      group.unchangedLineCount += 1;
      totalUnchangedLineCount += 1;
    } else {
      group.changedLines.push(toReviewGroupLine(line));
      totalChangedLineCount += 1;
    }

    groupsByAccount.set(accountKey, group);
  }

  return {
    isComplex: Math.max(params.beforeLines.length, afterLines.length) >= threshold,
    totalLineCount: afterLines.length,
    totalChangedLineCount,
    totalUnchangedLineCount,
    groups: Array.from(groupsByAccount.values()).sort((left, right) => left.accountLabel.localeCompare(right.accountLabel)),
  };
}
