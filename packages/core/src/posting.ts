import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";

export interface PostingMapper {
  mapToJournal(request: PostingRequest): Promise<JournalLine[]>;
}

export interface PostingRepository {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: string }>;
  insertJournalLines(journalBatchId: string, lines: JournalLine[]): Promise<void>;
}

export class PostingService {
  constructor(
    private readonly repository: PostingRepository,
    private readonly mapperByDocType: Record<string, PostingMapper>
  ) {}

  async post(request: PostingRequest): Promise<PostingResult> {
    const mapper = this.mapperByDocType[request.doc_type];
    if (!mapper) {
      throw new Error(`No posting mapper for doc_type=${request.doc_type}`);
    }

    await this.repository.begin();
    try {
      const lines = await mapper.mapToJournal(request);
      const batch = await this.repository.createJournalBatch(request);
      await this.repository.insertJournalLines(batch.journal_batch_id, lines);
      await this.repository.commit();
      return {
        journal_batch_id: batch.journal_batch_id,
        lines
      };
    } catch (error) {
      await this.repository.rollback();
      throw error;
    }
  }
}
