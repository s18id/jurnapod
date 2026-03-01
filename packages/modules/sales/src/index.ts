// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PostingMapper } from "@jurnapod/core";
import type { PostingRequest } from "@jurnapod/shared";
import type { JournalLine } from "@jurnapod/shared";

export class SalesInvoicePostingMapper implements PostingMapper {
  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return [
      {
        account_id: 40000, // Service revenue account (placeholder)
        debit: 0,
        credit: 100,
        description: "Service revenue"
      },
      {
        account_id: 11200, // Accounts receivable account (placeholder)
        debit: 100,
        credit: 0,
        description: "Accounts receivable"
      }
    ];
  }
}
