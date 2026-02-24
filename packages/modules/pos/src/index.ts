import type { PostingMapper } from "@jurnapod/core";
import type { PostingRequest } from "@jurnapod/shared";
import type { JournalLine } from "@jurnapod/shared";

export class PosSalePostingMapper implements PostingMapper {
  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return [
      {
        account_id: 11100, // Cash account (placeholder)
        debit: 100,
        credit: 0,
        description: "Cash"
      },
      {
        account_id: 40100, // POS sales revenue account (placeholder)
        debit: 0,
        credit: 100,
        description: "POS sales revenue"
      }
    ];
  }
}
