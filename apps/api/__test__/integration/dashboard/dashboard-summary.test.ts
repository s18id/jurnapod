// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeTestDb } from "../../helpers/db";
import { getTestBaseUrl } from "../../helpers/env";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import {
  getOrCreateTestCashierForPermission,
  getSeedSyncContext,
  getTestAccessToken,
  resetFixtureRegistry,
} from "../../fixtures";

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let seedOutletId: number;

async function getDashboard(path: string, token = ownerToken): Promise<Response> {
  return fetch(`${baseUrl}/api/dashboard${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("dashboard.summary", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const seedCtx = await getSeedSyncContext();
    seedOutletId = seedCtx.outletId;
    const companyCode = process.env.JP_COMPANY_CODE;
    if (!companyCode) throw new Error("JP_COMPANY_CODE must be set");
    cashierToken = (await getOrCreateTestCashierForPermission(seedCtx.companyId, companyCode, baseUrl)).accessToken;
  });

  afterAll(async () => {
    try {
      resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  it("rejects dashboard summary requests without auth", async () => {
    const response = await fetch(`${baseUrl}/api/dashboard/inventory-summary`);
    expect(response.status).toBe(401);
  });

  it("returns DB-backed inventory summary counts", async () => {
    const response = await getDashboard(`/inventory-summary?outlet_id=${seedOutletId}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.totalItems).toBe("number");
    expect(typeof body.data.lowStockAlerts).toBe("number");
    expect(body.data.outletScoped).toBe(true);
    expect(body.data.recentStockMovements.apiGap).toBe(true);
  });

  it("requires outlet_id for inventory stock summary", async () => {
    const response = await getDashboard("/inventory-summary");
    expect(response.status).toBe(400);
  });

  it("returns DB-backed accounting summary counts", async () => {
    const response = await getDashboard("/accounting-summary");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.pendingReconciliations.apiGap).toBe(true);
    expect(typeof body.data.journalEntryCount).toBe("number");
  });

  it("returns DB-backed purchasing summary counts with approvals API gap", async () => {
    const response = await getDashboard("/purchasing-summary");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.overdueInvoices).toBe("number");
    expect(typeof body.data.openPurchaseOrders).toBe("number");
    expect(body.data.pendingApprovals.apiGap).toBe(true);
  });

  it("returns pending exceptions summary for accounting or purchasing analytical access", async () => {
    const response = await getDashboard("/pending-exceptions");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.total).toBe("number");
    expect(typeof body.data.apExceptions).toBe("number");
    expect(body.data.reconciliationMismatches.apiGap).toBe(true);
    expect(typeof body.data.syncErrors).toBe("number");
  });

  it("validates outlet_id for outlet-scoped inventory summaries", async () => {
    const response = await getDashboard("/inventory-summary?outlet_id=not-a-number");
    expect(response.status).toBe(400);
  });

  it("requires resource-level permission for protected summaries", async () => {
    const response = await getDashboard("/accounting-summary", cashierToken);
    expect(response.status).toBe(403);
  });

  it("shows deprecation notice for old built-in HTML dashboards", async () => {
    const response = await fetch(`${baseUrl}/admin/dashboard/financial`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Dashboard moved");
    expect(html).toContain("/#/dashboard");
  });
});
