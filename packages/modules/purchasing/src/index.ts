import type { PostingMapper } from "@jurnapod/core";
import type { PostingRequest } from "@jurnapod/shared";
import type { JournalLine } from "@jurnapod/shared";

export class PurchasingPostingMapper implements PostingMapper {
  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return [];
  }
}
