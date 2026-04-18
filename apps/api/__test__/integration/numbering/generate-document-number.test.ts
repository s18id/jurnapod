// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { createTestCompany, resetFixtureRegistry } from '../../fixtures';
import {
  DOCUMENT_TYPES,
  RESET_PERIODS,
  generateDocumentNumber,
  initializeDefaultTemplates,
} from '@/lib/numbering';

describe('numbering.generateDocumentNumber reset periods', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('resets sequence to 0001 when WEEKLY boundary changes', async () => {
    const company = await createTestCompany();
    await initializeDefaultTemplates(company.id);

    const db = getTestDb();
    await db
      .updateTable('numbering_templates')
      .set({
        reset_period: RESET_PERIODS.WEEKLY,
        current_value: 42,
        last_reset: new Date('2026-01-06T10:00:00Z'), // ISO week 2
      })
      .where('company_id', '=', company.id)
      .where('outlet_id', 'is', null)
      .where('doc_type', '=', DOCUMENT_TYPES.SALES_INVOICE)
      .execute();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-13T10:00:00Z')); // ISO week 3

    const number = await generateDocumentNumber(company.id, null, DOCUMENT_TYPES.SALES_INVOICE);
    expect(number.endsWith('/0001')).toBe(true);
  });

  it('resets sequence to 0001 when DAILY boundary changes', async () => {
    const company = await createTestCompany();
    await initializeDefaultTemplates(company.id);

    const db = getTestDb();
    // Use noon UTC to ensure last_reset and now are unambiguously different calendar days
    // regardless of server timezone (getFullYear/getMonth/getDate are local-time methods)
    await db
      .updateTable('numbering_templates')
      .set({
        reset_period: RESET_PERIODS.DAILY,
        current_value: 9,
        last_reset: new Date('2026-04-15T12:00:00Z'),
      })
      .where('company_id', '=', company.id)
      .where('outlet_id', 'is', null)
      .where('doc_type', '=', DOCUMENT_TYPES.SALES_INVOICE)
      .execute();

    vi.useFakeTimers();
    // Advance by a full day to guarantee a different calendar day from last_reset
    vi.setSystemTime(new Date('2026-04-16T12:00:00Z'));

    const number = await generateDocumentNumber(company.id, null, DOCUMENT_TYPES.SALES_INVOICE);
    expect(number.endsWith('/0001')).toBe(true);
  });
});
