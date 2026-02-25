import type { PostingMapper } from "@jurnapod/core";
import type { PostingRequest } from "@jurnapod/shared";
import type { JournalLine } from "@jurnapod/shared";

export class AccountingImportMapper implements PostingMapper {
  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return [];
  }
}

export * from "./accounts-service";
export * from "./account-types-service";
export * from "./journals-service";
