// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";

export interface PostingMapper {
  mapToJournal(request: PostingRequest): Promise<JournalLine[]>;
}

export interface PostingRepository {
  begin?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
  createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }>;
  insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void>;
}

export type PostingTransactionOwner = "service" | "external";

export interface PostingOptions {
  transactionOwner?: PostingTransactionOwner;
}

export class UnbalancedJournalError extends Error {
  constructor() {
    super("UNBALANCED_JOURNAL");
    this.name = "UnbalancedJournalError";
  }
}

const MINOR_UNITS_SCALE = 100;

function toMinorUnits(value: number): number {
  return Math.round(value * MINOR_UNITS_SCALE);
}

function assertBalancedLines(lines: JournalLine[]): void {
  if (lines.length === 0) {
    throw new UnbalancedJournalError();
  }

  let totalDebitMinor = 0;
  let totalCreditMinor = 0;
  for (const line of lines) {
    totalDebitMinor += toMinorUnits(line.debit);
    totalCreditMinor += toMinorUnits(line.credit);
  }

  if (totalDebitMinor !== totalCreditMinor) {
    throw new UnbalancedJournalError();
  }
}

function requireTransactionMethod(
  repository: PostingRepository,
  methodName: "begin" | "commit" | "rollback"
): () => Promise<void> {
  const method = repository[methodName];
  if (!method) {
    throw new Error(`Posting repository missing required method: ${methodName}`);
  }

  return method.bind(repository);
}

export class PostingService {
  constructor(
    private readonly repository: PostingRepository,
    private readonly mapperByDocType: Record<string, PostingMapper>
  ) {}

  async post(request: PostingRequest, options: PostingOptions = {}): Promise<PostingResult> {
    const mapper = this.mapperByDocType[request.doc_type];
    if (!mapper) {
      throw new Error(`No posting mapper for doc_type=${request.doc_type}`);
    }

    const transactionOwner = options.transactionOwner ?? "service";
    const ownsTransaction = transactionOwner === "service";
    const begin = ownsTransaction ? requireTransactionMethod(this.repository, "begin") : null;
    const commit = ownsTransaction ? requireTransactionMethod(this.repository, "commit") : null;
    const rollback = ownsTransaction ? requireTransactionMethod(this.repository, "rollback") : null;

    if (begin) {
      await begin();
    }

    try {
      const lines = await mapper.mapToJournal(request);
      assertBalancedLines(lines);
      const batch = await this.repository.createJournalBatch(request);
      await this.repository.insertJournalLines(batch.journal_batch_id, request, lines);
      if (commit) {
        await commit();
      }

      return {
        journal_batch_id: batch.journal_batch_id as unknown as PostingResult["journal_batch_id"],
        lines
      };
    } catch (error) {
      if (rollback) {
        await rollback();
      }

      throw error;
    }
  }
}
