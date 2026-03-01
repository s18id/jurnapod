// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PostingMapper } from "@jurnapod/core";
import type { PostingRequest } from "@jurnapod/shared";
import type { JournalLine } from "@jurnapod/shared";

export class InventoryPostingMapper implements PostingMapper {
  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return [];
  }
}
