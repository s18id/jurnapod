// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PostingRequest } from "@jurnapod/shared";
import type { JournalLine } from "@jurnapod/shared";
import type { PostingMapper } from "./posting";

export * from "./posting";
export * from "./accounts-service";
export * from "./account-types-service";
export * from "./journals-service";

export class AccountingImportMapper implements PostingMapper {
  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return [];
  }
}
