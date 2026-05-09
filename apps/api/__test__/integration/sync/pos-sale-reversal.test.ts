// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { KyselySchema } from '@jurnapod/db';
import type { JournalLine, PostingRequest } from '@jurnapod/shared';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { getSeedSyncContext, resetFixtureRegistry } from '../../fixtures';
import {
  PosSyncPushPostingRepository,
  createPosSaleReversalJournalsForCorrection,
  readJournalLinesByBatch,
} from '@jurnapod/modules-accounting/posting/sync-push';

describe('POS_SALE reversal — production functions only', { timeout: 30000 }, () => {
  let db: KyselySchema;
  let companyId: number;
  let outletId: number;
  let originalTxId: number;
  let correctionTxId: number;

  beforeAll(async () => {
    await acquireReadLock();
    db = getTestDb();
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
    outletId = ctx.outletId;
    originalTxId = Date.now() + 88888;
    correctionTxId = originalTxId + 1;
  });

  afterAll(async () => {
    try {
      await db.deleteFrom('journal_batches')
        .where('company_id', '=', companyId)
        .where('doc_type', 'in', ['POS_SALE', 'POS_SALE_REVERSAL'])
        .where('doc_id', 'in', [originalTxId, correctionTxId])
        .execute();
    } catch { /* best-effort */ }
    try { resetFixtureRegistry(); await closeTestDb(); } finally { await releaseReadLock(); }
  });

  it('reversal creates balanced journal lines via production functions', async () => {
    // === CREATE ORIGINAL ===
    const repo = new PosSyncPushPostingRepository(db, '2024-01-15 10:00:00');
    const request: PostingRequest = { doc_type: 'POS_SALE', doc_id: originalTxId, company_id: companyId, outlet_id: outletId };
    const lines = [
      { account_id: 1, debit: 15000, credit: 0, description: 'Cash' },
      { account_id: 2, debit: 0, credit: 12000, description: 'Revenue' },
      { account_id: 3, debit: 0, credit: 3000, description: 'Tax' },
    ] as JournalLine[];
    const batch = await repo.createJournalBatch(request);
    await repo.insertJournalLines(batch.journal_batch_id, request, lines);

    const origLines = await readJournalLinesByBatch(db, batch.journal_batch_id, companyId, outletId);

    // === REVERSE ===
    const result = await createPosSaleReversalJournalsForCorrection(db, {
      companyId, outletId, status: 'VOID',
      originalPosTransactionId: originalTxId, correctionPosTransactionId: correctionTxId,
      clientTxId: 'prod-demo-cafe-0000-0000-0001', correctionPostedAt: '2024-01-16 12:00:00',
    });
    expect(result).not.toBeNull();

    const revLines = await readJournalLinesByBatch(db, result!.reversalBatchId, companyId, outletId);

    // debit↔credit swapped
    expect(revLines.length).toBe(origLines.length);
    for (let i = 0; i < origLines.length; i++) {
      expect(revLines[i].debit).toBe(origLines[i].credit);
      expect(revLines[i].credit).toBe(origLines[i].debit);
    }

    // balanced
    const totalDebit = revLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = revLines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBeGreaterThan(0);

    // linkage
    for (const line of revLines) {
      expect(line.description).toContain('REV:VOID');
      expect(line.description).toContain(`OT:${originalTxId}`);
      expect(line.description).toContain(`CT:${correctionTxId}`);
    }
  });

  it('original journal unchanged after reversal', async () => {
    const repo = new PosSyncPushPostingRepository(db, '2024-01-15 10:00:00');
    const txId = Date.now() + 99998;
    const request: PostingRequest = { doc_type: 'POS_SALE', doc_id: txId, company_id: companyId, outlet_id: outletId };
    const lines = [
      { account_id: 1, debit: 5000, credit: 0, description: 'Cash' },
      { account_id: 2, debit: 0, credit: 5000, description: 'Revenue' },
    ] as JournalLine[];
    const batch = await repo.createJournalBatch(request);
    await repo.insertJournalLines(batch.journal_batch_id, request, lines);

    const origLines = await readJournalLinesByBatch(db, batch.journal_batch_id, companyId, outletId);

    await createPosSaleReversalJournalsForCorrection(db, {
      companyId, outletId, status: 'VOID',
      originalPosTransactionId: txId, correctionPosTransactionId: txId + 1,
      clientTxId: 'prod-demo-cafe-0000-0000-0002', correctionPostedAt: '2024-01-16 12:00:00',
    });

    const afterLines = await readJournalLinesByBatch(db, batch.journal_batch_id, companyId, outletId);

    expect(afterLines.length).toBe(origLines.length);
    for (let i = 0; i < origLines.length; i++) {
      expect(afterLines[i].debit).toBe(origLines[i].debit);
      expect(afterLines[i].credit).toBe(origLines[i].credit);
    }
  });

  it('returns null when no POS_SALE journal exists', async () => {
    const result = await createPosSaleReversalJournalsForCorrection(db, {
      companyId, outletId, status: 'VOID',
      originalPosTransactionId: 99999999, correctionPosTransactionId: 99999998,
      clientTxId: 'prod-demo-cafe-0000-0000-0003', correctionPostedAt: '2024-01-16 12:00:00',
    });
    expect(result).toBeNull();
  });
});
