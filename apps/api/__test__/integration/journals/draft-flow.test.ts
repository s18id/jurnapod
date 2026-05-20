// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { acquireReadLock, releaseReadLock, getTestBaseUrl } from "../../helpers/setup";
import { closeTestDb, getTestDb } from "../../helpers/db";
import {
  createTestAccount,
  createTestCompanyMinimal,
  createTestFiscalYear,
  createTestOutletMinimal,
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

describe("journals.draft-flow", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();

    await createTestFiscalYear(seedCtx.companyId, {
      year: 2097,
      startDate: "2097-01-01",
      endDate: "2097-12-31",
      status: "OPEN",
    });

    const debit = await createTestAccount({
      companyId: seedCtx.companyId,
      code: "J693CDR",
      name: "Story 69-3-c Draft Debit",
      typeName: "ASSET",
    });
    const credit = await createTestAccount({
      companyId: seedCtx.companyId,
      code: "J693CCR",
      name: "Story 69-3-c Draft Credit",
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

  function clientRefForDraft(draftId: number): string {
    return `00000000-0000-4000-8000-${String(draftId).padStart(12, "0")}`;
  }

  async function balancedPayload(overrides: Record<string, unknown> = {}) {
    const ctx = await getSeedSyncContext();
    return {
      company_id: ctx.companyId,
      outlet_id: ctx.outletId,
      entry_date: "2097-06-15",
      reference: "JRN-69-3-C",
      description: "Story 69-3-c draft journal",
      lines: [
        { account_id: debitAccountId, debit: 25, credit: 0, description: "Debit line" },
        { account_id: creditAccountId, debit: 0, credit: 25, description: "Credit line" },
      ],
      ...overrides,
    };
  }

  it("creates, updates, gets, posts, and idempotently reposts a draft", async () => {
    const createRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload()),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    expect(created.data.status).toBe("DRAFT");
    expect(created.data.reference).toBe("JRN-69-3-C");
    expect(created.data.total_debits).toBe(25);
    expect(created.data.total_credits).toBe(25);

    const draftId = created.data.id;
    expect(draftId).toBeGreaterThanOrEqual(900000000000);

    const clientRef = clientRefForDraft(draftId);
    const updateRes = await fetch(`${baseUrl}/api/journals/${draftId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ reference: "JRN-69-3-C-UPD", client_ref: clientRef })),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.data.status).toBe("DRAFT");
    expect(updated.data.reference).toBe("JRN-69-3-C-UPD");
    expect(updated.data.client_ref).toBe(clientRef);

    const duplicateCreateRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ reference: "JRN-69-3-C-DUP", client_ref: clientRef })),
    });
    expect(duplicateCreateRes.status).toBe(201);
    const duplicateCreate = await duplicateCreateRes.json();
    expect(duplicateCreate.data.id).toBe(draftId);
    expect(duplicateCreate.data.status).toBe("DRAFT");

    const getDraftRes = await fetch(`${baseUrl}/api/journals/${draftId}`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(getDraftRes.status).toBe(200);
    const getDraft = await getDraftRes.json();
    expect(getDraft.data.id).toBe(draftId);
    expect(getDraft.data.status).toBe("DRAFT");

    const postRes = await fetch(`${baseUrl}/api/journals/${draftId}/post`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(postRes.status).toBe(200);
    const posted = await postRes.json();
    expect(posted.data.status).toBe("POSTED");
    expect(posted.data.reference).toBe("JRN-69-3-C-UPD");
    expect(posted.data.client_ref).toBe(clientRef);
    expect(posted.data.total_debits).toBe(25);
    expect(posted.data.total_credits).toBe(25);

    const repostRes = await fetch(`${baseUrl}/api/journals/${draftId}/post`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(repostRes.status).toBe(200);
    const reposted = await repostRes.json();
    expect(reposted.data.status).toBe("POSTED");
    expect(reposted.data.id).toBe(posted.data.id);
    expect(reposted.data.reference).toBe("JRN-69-3-C-UPD");

    const batchCount = await getTestDb()
      .selectFrom("journal_batches")
      .select(({ fn }) => fn.count<number>("id").as("batch_count"))
      .where("company_id", "=", seedCtx.companyId)
      .where("doc_type", "=", "MANUAL")
      .where("client_ref", "=", clientRef)
      .executeTakeFirstOrThrow();
    expect(Number(batchCount.batch_count)).toBe(1);

    const getPostedByDraftIdRes = await fetch(`${baseUrl}/api/journals/${draftId}`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(getPostedByDraftIdRes.status).toBe(200);
    const getPostedByDraftId = await getPostedByDraftIdRes.json();
    expect(getPostedByDraftId.data.status).toBe("POSTED");
    expect(getPostedByDraftId.data.id).toBe(posted.data.id);
    expect(getPostedByDraftId.data.reference).toBe("JRN-69-3-C-UPD");

    const listRes = await fetch(`${baseUrl}/api/journals?doc_type=MANUAL&limit=1000`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    const listedPosted = listed.data.find((entry: { id: number; status: string }) => (
      entry.id === posted.data.id && entry.status === "POSTED"
    ));
    expect(listedPosted?.reference).toBe("JRN-69-3-C-UPD");

    const duplicatePostedCreateRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ reference: "JRN-69-3-C-DUP-POSTED", client_ref: clientRef })),
    });
    expect(duplicatePostedCreateRes.status).toBe(409);
    expect((await duplicatePostedCreateRes.json()).error.code).toBe("JOURNAL_ALREADY_POSTED");
  });

  it("returns stable invalid request errors for invalid IDs and date fields", async () => {
    const invalidIdRes = await fetch(`${baseUrl}/api/journals/not-a-number`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(invalidIdRes.status).toBe(400);
    expect((await invalidIdRes.json()).error.code).toBe("INVALID_REQUEST");

    const invalidDateRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ entry_date: "2097-6-15" })),
    });
    expect(invalidDateRes.status).toBe(400);
    expect((await invalidDateRes.json()).error.code).toBe("INVALID_REQUEST");

    const invalidListDateRes = await fetch(`${baseUrl}/api/journals?start_date=2097-6-15`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(invalidListDateRes.status).toBe(400);
    expect((await invalidListDateRes.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("does not include draft journals when filtering non-manual document types", async () => {
    const createRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ reference: "JRN-69-3-C-DOC-FILTER" })),
    });
    expect(createRes.status).toBe(201);

    const listRes = await fetch(`${baseUrl}/api/journals?doc_type=POS_SALE&limit=1000`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    expect(listed.data.some((entry: { status: string; reference: string | null }) => (
      entry.status === "DRAFT" || entry.reference === "JRN-69-3-C-DOC-FILTER"
    ))).toBe(false);
  });

  it("returns deterministic errors for missing and posted PATCH targets", async () => {
    const missingRes = await fetch(`${baseUrl}/api/journals/899999999998`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload()),
    });
    expect(missingRes.status).toBe(404);
    expect((await missingRes.json()).error.code).toBe("NOT_FOUND");

    const createRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ reference: "JRN-69-3-C-CONFLICT" })),
    });
    const draftId = (await createRes.json()).data.id;
    await fetch(`${baseUrl}/api/journals/${draftId}/post`, { method: "POST", headers: authHeaders() });

    const conflictRes = await fetch(`${baseUrl}/api/journals/${draftId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ reference: "JRN-69-3-C-CONFLICT-2" })),
    });
    expect(conflictRes.status).toBe(409);
    expect((await conflictRes.json()).error.code).toBe("JOURNAL_ALREADY_POSTED");
  });

  it("rejects invalid account and outlet tenant references deterministically", async () => {
    const otherCompany = await createTestCompanyMinimal();
    const otherOutlet = await createTestOutletMinimal(otherCompany.id);
    const otherAccount = await createTestAccount({
      companyId: otherCompany.id,
      code: "J693COTH",
      name: "Story 69-3-c Other Company Account",
      typeName: "ASSET",
    });

    const invalidAccountRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({
        lines: [
          { account_id: otherAccount.id, debit: 25, credit: 0, description: "Wrong tenant debit" },
          { account_id: creditAccountId, debit: 0, credit: 25, description: "Credit line" },
        ],
      })),
    });
    expect(invalidAccountRes.status).toBe(400);
    expect((await invalidAccountRes.json()).error.code).toBe("INVALID_ACCOUNT");

    const invalidOutletRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ outlet_id: otherOutlet.id })),
    });
    expect(invalidOutletRes.status).toBe(404);
    expect((await invalidOutletRes.json()).error.code).toBe("INVALID_OUTLET");
  });

  it("maps unbalanced, closed fiscal year, outside fiscal year, and low-privilege access errors", async () => {
    const unbalancedRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({
        lines: [
          { account_id: debitAccountId, debit: 30, credit: 0, description: "Debit line" },
          { account_id: creditAccountId, debit: 0, credit: 25, description: "Credit line" },
        ],
      })),
    });
    expect(unbalancedRes.status).toBe(400);
    expect((await unbalancedRes.json()).error.code).toBe("INVALID_REQUEST");

    const ctx = await getSeedSyncContext();
    await createTestFiscalYear(ctx.companyId, {
      year: 2098,
      startDate: "2098-01-01",
      endDate: "2098-12-31",
      status: "CLOSED",
    });
    const closedCreateRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ entry_date: "2098-06-15" })),
    });
    const closedDraftId = (await closedCreateRes.json()).data.id;
    const closedPostRes = await fetch(`${baseUrl}/api/journals/${closedDraftId}/post`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(closedPostRes.status).toBe(400);
    expect((await closedPostRes.json()).error.code).toBe("FISCAL_YEAR_CLOSED");

    const outsideCreateRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(await balancedPayload({ entry_date: "2297-06-15" })),
    });
    expect(outsideCreateRes.status).toBe(201);
    const outsideDraftId = (await outsideCreateRes.json()).data.id;
    const outsidePostRes = await fetch(`${baseUrl}/api/journals/${outsideDraftId}/post`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(outsidePostRes.status).toBe(400);
    expect((await outsidePostRes.json()).error.code).toBe("JOURNAL_OUTSIDE_FISCAL_YEAR");

    const companyCode = process.env.JP_COMPANY_CODE;
    expect(companyCode).toBeDefined();
    const cashier = await getOrCreateTestCashierForPermission(ctx.companyId, companyCode as string, baseUrl);
    const forbiddenRes = await fetch(`${baseUrl}/api/journals`, {
      method: "POST",
      headers: authHeaders(cashier.accessToken),
      body: JSON.stringify(await balancedPayload()),
    });
    expect(forbiddenRes.status).toBe(403);
  });
});
