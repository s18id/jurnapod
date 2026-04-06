// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test, it, expect } from "vitest";
import {
  PostingService,
  PostingRepository,
  PostingMapper,
  UnbalancedJournalError
} from "../../src/posting";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";

// Minimal request for testing
const makeRequest = (docType = "TEST", overrides: Partial<PostingRequest> = {}): PostingRequest => ({
  doc_type: docType,
  doc_id: 1,
  company_id: 1,
  outlet_id: 1,
  ...overrides
});

// Minimal balanced lines
const balancedLines: JournalLine[] = [
  { account_id: 1, debit: 100, credit: 0, description: "Dr" },
  { account_id: 2, debit: 0, credit: 100, description: "Cr" }
];

// Unbalanced lines (debits != credits)
const unbalancedLines: JournalLine[] = [
  { account_id: 1, debit: 100, credit: 0, description: "Dr" },
  { account_id: 2, debit: 0, credit: 50, description: "Cr" }
];

describe("PostingService", () => {
  describe("assertBalancedLines (via post)", () => {
    test("throws UnbalancedJournalError on unbalanced lines", async () => {
      const mapper: PostingMapper = {
        mapToJournal: async () => unbalancedLines
      };

      const repository: PostingRepository = {
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });

      // Use transactionOwner='external' so we bypass begin/commit/rollback
      // and reach the assertion directly
      await assert.rejects(
        async () => service.post(makeRequest(), { transactionOwner: "external" }),
        UnbalancedJournalError
      );
    });

    test("throws UnbalancedJournalError on empty lines", async () => {
      const mapper: PostingMapper = {
        mapToJournal: async () => []
      };

      const repository: PostingRepository = {
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });

      // Use transactionOwner='external' so we bypass begin/commit/rollback
      // and reach the assertion directly
      await assert.rejects(
        async () => service.post(makeRequest(), { transactionOwner: "external" }),
        UnbalancedJournalError
      );
    });
  });

  describe("mapper resolution", () => {
    test("throws when mapper missing for doc_type", async () => {
      const repository: PostingRepository = {
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, {});

      await assert.rejects(
        async () => service.post(makeRequest("UNKNOWN_DOC_TYPE")),
        /No posting mapper for doc_type=UNKNOWN_DOC_TYPE/
      );
    });
  });

  describe("transactionOwner='service'", () => {
    test("requires begin/commit/rollback on repository", async () => {
      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      // Repository missing begin
      const repositoryWithoutBegin: PostingRepository = {
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repositoryWithoutBegin, { TEST: mapper });

      await assert.rejects(
        async () => service.post(makeRequest(), { transactionOwner: "service" }),
        /Posting repository missing required method: begin/
      );
    });

    test("calls begin+commit on success", async () => {
      const callOrder: string[] = [];

      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      const repository: PostingRepository = {
        begin: async () => { callOrder.push("begin"); },
        commit: async () => { callOrder.push("commit"); },
        rollback: async () => { callOrder.push("rollback"); },
        createJournalBatch: async () => {
          callOrder.push("createJournalBatch");
          return { journal_batch_id: 42 };
        },
        insertJournalLines: async () => {
          callOrder.push("insertJournalLines");
        }
      };

      const service = new PostingService(repository, { TEST: mapper });
      const result = await service.post(makeRequest(), { transactionOwner: "service" });

      assert.deepEqual(callOrder, ["begin", "createJournalBatch", "insertJournalLines", "commit"]);
      assert.equal(result.journal_batch_id, 42);
    });

    test("does NOT call rollback on success", async () => {
      let rollbackCalled = false;

      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      const repository: PostingRepository = {
        begin: async () => {},
        commit: async () => {},
        rollback: async () => { rollbackCalled = true; },
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });
      await service.post(makeRequest(), { transactionOwner: "service" });

      assert.equal(rollbackCalled, false);
    });
  });

  describe("transactionOwner='external'", () => {
    test("does NOT require begin/commit/rollback", async () => {
      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      // Repository WITHOUT begin/commit/rollback should work
      const minimalRepository: PostingRepository = {
        createJournalBatch: async () => ({ journal_batch_id: 99 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(minimalRepository, { TEST: mapper });
      const result = await service.post(makeRequest(), { transactionOwner: "external" });

      assert.equal(result.journal_batch_id, 99);
    });

    test("does not call begin/commit/rollback even if present", async () => {
      const callOrder: string[] = [];

      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      const repository: PostingRepository = {
        begin: async () => { callOrder.push("begin"); },
        commit: async () => { callOrder.push("commit"); },
        rollback: async () => { callOrder.push("rollback"); },
        createJournalBatch: async () => {
          callOrder.push("createJournalBatch");
          return { journal_batch_id: 1 };
        },
        insertJournalLines: async () => {
          callOrder.push("insertJournalLines");
        }
      };

      const service = new PostingService(repository, { TEST: mapper });
      await service.post(makeRequest(), { transactionOwner: "external" });

      // Only repo operations should be called, no begin/commit/rollback
      assert.deepEqual(callOrder, ["createJournalBatch", "insertJournalLines"]);
      assert.ok(!callOrder.includes("begin"));
      assert.ok(!callOrder.includes("commit"));
      assert.ok(!callOrder.includes("rollback"));
    });
  });

  describe("rollback behavior", () => {
    test("rollback invoked on mapper error when service owns transaction", async () => {
      let rollbackCalled = false;

      const mapper: PostingMapper = {
        mapToJournal: async () => {
          throw new Error("Mapper failed");
        }
      };

      const repository: PostingRepository = {
        begin: async () => {},
        commit: async () => {},
        rollback: async () => { rollbackCalled = true; },
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });

      await assert.rejects(
        async () => service.post(makeRequest(), { transactionOwner: "service" }),
        /Mapper failed/
      );

      assert.equal(rollbackCalled, true);
    });

    test("rollback invoked on repository error (createJournalBatch) when service owns transaction", async () => {
      let rollbackCalled = false;

      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      const repository: PostingRepository = {
        begin: async () => {},
        commit: async () => {},
        rollback: async () => { rollbackCalled = true; },
        createJournalBatch: async () => {
          throw new Error("DB write failed");
        },
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });

      await assert.rejects(
        async () => service.post(makeRequest(), { transactionOwner: "service" }),
        /DB write failed/
      );

      assert.equal(rollbackCalled, true);
    });

    test("rollback invoked on repository error (insertJournalLines) when service owns transaction", async () => {
      let rollbackCalled = false;

      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      const repository: PostingRepository = {
        begin: async () => {},
        commit: async () => {},
        rollback: async () => { rollbackCalled = true; },
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {
          throw new Error("Lines insert failed");
        }
      };

      const service = new PostingService(repository, { TEST: mapper });

      await assert.rejects(
        async () => service.post(makeRequest(), { transactionOwner: "service" }),
        /Lines insert failed/
      );

      assert.equal(rollbackCalled, true);
    });

    test("rollback NOT invoked on error when service does NOT own transaction", async () => {
      let rollbackCalled = false;

      const mapper: PostingMapper = {
        mapToJournal: async () => {
          throw new Error("Mapper failed");
        }
      };

      const repository: PostingRepository = {
        begin: async () => { throw new Error("begin should not be called"); },
        commit: async () => { throw new Error("commit should not be called"); },
        rollback: async () => { rollbackCalled = true; },
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });

      await assert.rejects(
        async () => service.post(makeRequest(), { transactionOwner: "external" }),
        /Mapper failed/
      );

      // rollback should NOT be called when external owns the transaction
      assert.equal(rollbackCalled, false);
    });

    test("commit NOT called when rollback is invoked", async () => {
      let commitCalled = false;

      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      const repository: PostingRepository = {
        begin: async () => {},
        commit: async () => { commitCalled = true; },
        rollback: async () => {},
        createJournalBatch: async () => {
          throw new Error("Force rollback");
        },
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });

      await assert.rejects(
        async () => service.post(makeRequest(), { transactionOwner: "service" }),
        /Force rollback/
      );

      assert.equal(commitCalled, false);
    });
  });

  describe("result shape", () => {
    test("returns journal_batch_id and lines on success", async () => {
      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      const repository: PostingRepository = {
        begin: async () => {},
        commit: async () => {},
        rollback: async () => {},
        createJournalBatch: async () => ({ journal_batch_id: 77 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });
      const result = await service.post(makeRequest());

      assert.equal(result.journal_batch_id, 77);
      assert.deepEqual(result.lines, balancedLines);
    });
  });

  describe("default transactionOwner", () => {
    test("defaults to 'service' when not specified", async () => {
      const callOrder: string[] = [];

      const mapper: PostingMapper = {
        mapToJournal: async () => balancedLines
      };

      const repository: PostingRepository = {
        begin: async () => { callOrder.push("begin"); },
        commit: async () => { callOrder.push("commit"); },
        rollback: async () => {},
        createJournalBatch: async () => ({ journal_batch_id: 1 }),
        insertJournalLines: async () => {}
      };

      const service = new PostingService(repository, { TEST: mapper });
      // No options passed - should default to service
      await service.post(makeRequest());

      assert.ok(callOrder.includes("begin"), "begin should be called by default");
      assert.ok(callOrder.includes("commit"), "commit should be called by default");
    });
  });
});
