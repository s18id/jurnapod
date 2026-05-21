// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JournalsService } from "@jurnapod/modules-accounting";
import { acquireReadLock, releaseReadLock, getTestBaseUrl } from "../../helpers/setup";
import { closeTestDb, getTestDb } from "../../helpers/db";
import {
  createTestAccount,
  createTestCompanyMinimal,
  createTestFiscalYear,
  getOrCreateTestCashierForPermission,
  getSeedSyncContext as loadSeedSyncContext,
  getTestAccessToken,
  resetFixtureRegistry,
} from "../../fixtures";

let baseUrl: string;
let ownerToken: string;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
let debitAccountId: number;
let creditAccountId: number;

const getSeedSyncContext = async () => seedCtx;

describe("journals.void-reversal", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();

    await createTestFiscalYear(seedCtx.companyId, {
      year: 2099,
      startDate: "2099-01-01",
      endDate: "2099-12-31",
      status: "OPEN",
    });

    const debit = await createTestAccount({
      companyId: seedCtx.companyId,
      code: "J693DDRV",
      name: "Story 69-3-d Void Debit",
      typeName: "ASSET",
    });
    const credit = await createTestAccount({
      companyId: seedCtx.companyId,
      code: "J693DCRV",
      name: "Story 69-3-d Void Credit",
      typeName: "LIABILITY",
    });
    debitAccountId = debit.id;
    creditAccountId = credit.id;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  function authHeaders(token = ownerToken) {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function balancedPayload(overrides: Record<string, unknown> = {}) {
    const ctx = await getSeedSyncContext();
    return {
      company_id: ctx.companyId,
      outlet_id: ctx.outletId,
      entry_date: "2099-06-15",
      reference: "JRN-69-3-D",
      description: "Story 69-3-d void journal",
      lines: [
        { account_id: debitAccountId, debit: 40, credit: 0, description: "Debit line" },
        { account_id: creditAccountId, debit: 0, credit: 40, description: "Credit line" },
      ],
      ...overrides,
    };
  }

  async function createAndPostJournal(reference: string) {
    const createRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ reference })),
    });
    expect(createRes.status).toBe(201);
    const draftId = (await createRes.json()).data.id as number;

    const postRes = await fetch(`${baseUrl}/api/journals/${draftId}/post`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(postRes.status).toBe(200);
    const posted = await postRes.json();
    expect(posted.data.status).toBe("POSTED");
    return { draftId, postedId: posted.data.id as number };
  }

  it("voids a posted manual journal, creates a balanced reversal, and exposes links in get/list", async () => {
    const { postedId } = await createAndPostJournal("JRN-69-3-D-SUCCESS");

    const voidRes = await fetch(`${baseUrl}/api/journals/${postedId}/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "  Incorrect manual journal  " }),
    });
    expect(voidRes.status, await voidRes.clone().text()).toBe(200);
    const voided = await voidRes.json();
    expect(voided.success).toBe(true);
    expect(voided.data.id).toBe(postedId);
    expect(voided.data.status).toBe("VOIDED");
    expect(voided.data.void_reason).toBe("Incorrect manual journal");
    expect(voided.data.reversal_journal_id).toBeGreaterThan(0);
    expect(voided.data.original_journal_id).toBeNull();

    const reversalId = voided.data.reversal_journal_id as number;
    const reversalGetRes = await fetch(`${baseUrl}/api/journals/${reversalId}`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(reversalGetRes.status).toBe(200);
    const reversal = await reversalGetRes.json();
    expect(reversal.data.status).toBe("REVERSAL");
    expect(reversal.data.original_journal_id).toBe(postedId);
    expect(reversal.data.reversal_journal_id).toBeNull();
    expect(reversal.data.lines[0].credit).toBe(40);
    expect(reversal.data.lines[1].debit).toBe(40);

    const originalGetRes = await fetch(`${baseUrl}/api/journals/${postedId}`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(originalGetRes.status).toBe(200);
    const original = await originalGetRes.json();
    expect(original.data.status).toBe("VOIDED");
    expect(original.data.reversal_journal_id).toBe(reversalId);

    const listRes = await fetch(`${baseUrl}/api/journals?doc_type=MANUAL&limit=1000`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    const listedOriginal = listed.data.find((entry: { id: number }) => entry.id === postedId);
    expect(listedOriginal.status).toBe("VOIDED");
    expect(listedOriginal.reversal_journal_id).toBe(reversalId);

    const reversalCount = await getTestDb()
      .selectFrom("journal_reversals")
      .select(({ fn }) => fn.count<number>("id").as("reversal_count"))
      .where("company_id", "=", seedCtx.companyId)
      .where("original_journal_batch_id", "=", postedId)
      .executeTakeFirstOrThrow();
    expect(Number(reversalCount.reversal_count)).toBe(1);
  });

  it("returns deterministic conflict on duplicate void and does not create duplicate effects", async () => {
    const { postedId } = await createAndPostJournal("JRN-69-3-D-DUP");
    const firstVoidRes = await fetch(`${baseUrl}/api/journals/${postedId}/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "Duplicate guard" }),
    });
    expect(firstVoidRes.status).toBe(200);

    const duplicateVoidRes = await fetch(`${baseUrl}/api/journals/${postedId}/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "Duplicate guard retry" }),
    });
    expect(duplicateVoidRes.status).toBe(409);
    expect((await duplicateVoidRes.json()).error.code).toBe("JOURNAL_ALREADY_VOIDED");

    const counts = await getTestDb()
      .selectFrom("journal_batches")
      .select(({ fn }) => fn.count<number>("id").as("batch_count"))
      .where("company_id", "=", seedCtx.companyId)
      .where("doc_type", "=", "MANUAL_REVERSAL")
      .where("doc_id", "=", postedId)
      .executeTakeFirstOrThrow();
    expect(Number(counts.batch_count)).toBe(1);
  });

  it("serializes concurrent duplicate void requests and creates exactly one reversal effect", async () => {
    const { postedId } = await createAndPostJournal("JRN-69-3-D-CONCURRENT");

    const [left, right] = await Promise.all([
      fetch(`${baseUrl}/api/journals/${postedId}/void`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reason: "Concurrent duplicate guard A" }),
      }),
      fetch(`${baseUrl}/api/journals/${postedId}/void`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reason: "Concurrent duplicate guard B" }),
      }),
    ]);

    const responses = [
      { status: left.status, body: await left.json() },
      { status: right.status, body: await right.json() },
    ];

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const success = responses.find((response) => response.status === 200);
    const conflict = responses.find((response) => response.status === 409);
    expect(success?.body.success).toBe(true);
    expect(success?.body.data.status).toBe("VOIDED");
    expect(conflict?.body.error.code).toBe("JOURNAL_ALREADY_VOIDED");

    const reversalLinks = await getTestDb()
      .selectFrom("journal_reversals")
      .select(({ fn }) => fn.count<number>("id").as("reversal_count"))
      .where("company_id", "=", seedCtx.companyId)
      .where("original_journal_batch_id", "=", postedId)
      .executeTakeFirstOrThrow();
    expect(Number(reversalLinks.reversal_count)).toBe(1);

    const reversalBatches = await getTestDb()
      .selectFrom("journal_batches")
      .select(({ fn }) => fn.count<number>("id").as("batch_count"))
      .where("company_id", "=", seedCtx.companyId)
      .where("doc_type", "=", "MANUAL_REVERSAL")
      .where("doc_id", "=", postedId)
      .executeTakeFirstOrThrow();
    expect(Number(reversalBatches.batch_count)).toBe(1);
  });

  it("rejects missing or empty reason deterministically", async () => {
    const { postedId } = await createAndPostJournal("JRN-69-3-D-REASON");

    const missingReasonRes = await fetch(`${baseUrl}/api/journals/${postedId}/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(missingReasonRes.status).toBe(400);
    expect((await missingReasonRes.json()).error.code).toBe("INVALID_REQUEST");

    const emptyReasonRes = await fetch(`${baseUrl}/api/journals/${postedId}/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "   " }),
    });
    expect(emptyReasonRes.status).toBe(400);
    expect((await emptyReasonRes.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("requires accounting.journals DELETE permission", async () => {
    const { postedId } = await createAndPostJournal("JRN-69-3-D-AUTH");
    const companyCode = process.env.JP_COMPANY_CODE;
    expect(companyCode).toBeDefined();
    const cashier = await getOrCreateTestCashierForPermission(seedCtx.companyId, companyCode as string, baseUrl);

    const forbiddenRes = await fetch(`${baseUrl}/api/journals/${postedId}/void`, {
      method: "POST",
      headers: authHeaders(cashier.accessToken),
      body: JSON.stringify({ reason: "Cashier cannot void journals" }),
    });
    expect(forbiddenRes.status).toBe(403);
  });

  it("returns not found for missing or out-of-company journals", async () => {
    const missingRes = await fetch(`${baseUrl}/api/journals/899999999997/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "Missing journal" }),
    });
    expect(missingRes.status).toBe(404);
    expect((await missingRes.json()).error.code).toBe("NOT_FOUND");

    const otherCompany = await createTestCompanyMinimal();
    await createTestFiscalYear(otherCompany.id, {
      year: 2099,
      startDate: "2099-01-01",
      endDate: "2099-12-31",
      status: "OPEN",
    });
    const otherDebit = await createTestAccount({
      companyId: otherCompany.id,
      code: "J693DODR",
      name: "Story 69-3-d Other Debit",
      typeName: "ASSET",
    });
    const otherCredit = await createTestAccount({
      companyId: otherCompany.id,
      code: "J693DOCR",
      name: "Story 69-3-d Other Credit",
      typeName: "LIABILITY",
    });
    const service = new JournalsService(getTestDb());
    const otherDraft = await service.createJournalDraft({
      company_id: otherCompany.id,
      outlet_id: null,
      entry_date: "2099-06-15",
      reference: "JRN-69-3-D-OTHER",
      description: "Other tenant journal",
      lines: [
        { account_id: otherDebit.id, debit: 10, credit: 0, description: "Other debit" },
        { account_id: otherCredit.id, debit: 0, credit: 10, description: "Other credit" },
      ],
    });
    const otherPosted = await service.postJournalDraft(otherDraft.id, otherCompany.id);

    const crossTenantRes = await fetch(`${baseUrl}/api/journals/${otherPosted.id}/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "Wrong tenant" }),
    });
    expect(crossTenantRes.status).toBe(404);
    expect((await crossTenantRes.json()).error.code).toBe("NOT_FOUND");
  });

  it("rejects draft journal void and invalid IDs deterministically", async () => {
    const createRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ reference: "JRN-69-3-D-DRAFT" })),
    });
    expect(createRes.status).toBe(201);
    const draftId = (await createRes.json()).data.id as number;

    const draftVoidRes = await fetch(`${baseUrl}/api/journals/${draftId}/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "Draft cannot be voided" }),
    });
    expect(draftVoidRes.status).toBe(409);
    expect((await draftVoidRes.json()).error.code).toBe("JOURNAL_CANNOT_VOID_DRAFT");

    const invalidIdRes = await fetch(`${baseUrl}/api/journals/not-a-number/void`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "Invalid" }),
    });
    expect(invalidIdRes.status).toBe(400);
    expect((await invalidIdRes.json()).error.code).toBe("INVALID_REQUEST");
  });
});
