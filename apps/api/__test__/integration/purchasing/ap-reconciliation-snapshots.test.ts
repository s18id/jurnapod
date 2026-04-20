// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { closeTestDb, getTestDb } from "../../helpers/db";
import { getTestBaseUrl } from "../../helpers/env";
import {
  assignUserGlobalRole,
  createTestAPReconciliationSettings,
  createTestCompanyMinimal,
  createTestFiscalYear,
  createTestPurchasingAccounts,
  createTestRole,
  createTestUser,
  getTestAccessToken,
  loginForTest,
  resetFixtureRegistry,
  setModulePermission,
} from "../../fixtures";

describe("purchasing.ap-reconciliation-snapshots", { timeout: 90000 }, () => {
  let baseUrl: string;
  let companyId: number;
  let ownerToken: string;
  let analyzeOnlyToken: string;
  let company2Token: string;
  let createdSnapshotId: number;

  const postJson = async (path: string, token: string, body?: unknown) => {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const getJson = async (path: string, token: string) => {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    const seedToken = await getTestAccessToken(baseUrl);

    const company = await createTestCompanyMinimal({
      code: `SNAP-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    companyId = company.id;

    const ownerRole = await createTestRole(baseUrl, seedToken, "AP Snapshot Owner");
    const ownerUser = await createTestUser(companyId, {
      email: `ap-snap-owner-${Date.now()}@example.com`,
      name: "AP Snapshot Owner",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(ownerUser.id, ownerRole.id);
    await setModulePermission(companyId, ownerRole.id, "purchasing", "reports", 63);
    await setModulePermission(companyId, ownerRole.id, "accounting", "fiscal_years", 63);

    ownerToken = await loginForTest(baseUrl, company.code, ownerUser.email, "TestPassword123!");

    const analyzeOnlyRole = await createTestRole(baseUrl, seedToken, "AP Snapshot Analyze");
    const analyzeOnlyUser = await createTestUser(companyId, {
      email: `ap-snap-analyze-${Date.now()}@example.com`,
      name: "AP Snapshot Analyze",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(analyzeOnlyUser.id, analyzeOnlyRole.id);
    await setModulePermission(companyId, analyzeOnlyRole.id, "purchasing", "reports", 16);
    analyzeOnlyToken = await loginForTest(baseUrl, company.code, analyzeOnlyUser.email, "TestPassword123!");

    // Setup AP reconciliation prerequisites
    const { ap_account_id } = await createTestPurchasingAccounts(companyId, {
      // Retained keyword helps fiscal-year close preview locate retained earnings account.
      apAccountName: `Retained Earnings AP ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(companyId, [ap_account_id]);

    // Company 2 for tenant-isolation assertions
    const company2 = await createTestCompanyMinimal({
      code: `SN2-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const company2Role = await createTestRole(baseUrl, seedToken, "AP Snapshot Company2 Analyze");
    const company2User = await createTestUser(company2.id, {
      email: `ap-snap-company2-${Date.now()}@example.com`,
      name: "AP Snapshot Company2",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(company2User.id, company2Role.id);
    await setModulePermission(company2.id, company2Role.id, "purchasing", "reports", 16);
    company2Token = await loginForTest(baseUrl, company2.code, company2User.email, "TestPassword123!");
  });

  afterAll(async () => {
    // Story 47.6 snapshot/audit tables are append-only by design.
    // This suite uses unique-per-run fixture identities and non-destructive teardown.
    resetFixtureRegistry();
    await closeTestDb();
  });

  it("creates snapshot manually and returns version 1", async () => {
    const res = await postJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots",
      ownerToken,
      { as_of_date: "2026-04-19", reason: "month-end checkpoint" }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.snapshot.as_of_date).toBe("2026-04-19");
    expect(body.data.snapshot.snapshot_version).toBe(1);
    expect(body.data.snapshot.auto_generated).toBe(false);
    expect(Array.isArray(body.data.snapshot.configured_account_ids)).toBe(true);
    createdSnapshotId = Number(body.data.snapshot.id);
  });

  it("increments snapshot version on manual rerun for same as_of_date", async () => {
    const res = await postJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots",
      ownerToken,
      { as_of_date: "2026-04-19", reason: "rerun" }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.snapshot.as_of_date).toBe("2026-04-19");
    expect(body.data.snapshot.snapshot_version).toBe(2);

    const db = getTestDb();
    const chainRows = await sql<{ id: number; snapshot_version: number; superseded_by_snapshot_id: number | null }>`
      SELECT id, snapshot_version, superseded_by_snapshot_id
      FROM ap_reconciliation_snapshots
      WHERE company_id = ${companyId}
        AND as_of_date = '2026-04-19'
      ORDER BY snapshot_version ASC
    `.execute(db);

    expect(chainRows.rows.length).toBeGreaterThanOrEqual(2);
    const version1 = chainRows.rows.find((row) => Number(row.snapshot_version) === 1);
    expect(version1).toBeDefined();
    expect(version1?.superseded_by_snapshot_id).not.toBeNull();
  });

  it("enforces ACL: analyze-only can read but cannot create", async () => {
    const createRes = await postJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots",
      analyzeOnlyToken,
      { as_of_date: "2026-04-20" }
    );
    expect(createRes.status).toBe(403);

    const listRes = await getJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots?start_date=2026-04-01&end_date=2026-04-30&limit=50",
      analyzeOnlyToken
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data.items.length).toBeGreaterThanOrEqual(2);
  });

  it("enforces tenant isolation for get by id", async () => {
    const crossTenantRes = await getJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${createdSnapshotId}`,
      company2Token
    );
    expect(crossTenantRes.status).toBe(404);
  });

  it("compares two snapshots and returns deterministic delta payload", async () => {
    const listRes = await getJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots?as_of_date=2026-04-19&limit=10",
      ownerToken
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const ids = listBody.data.items.map((item: { id: number }) => Number(item.id));
    expect(ids.length).toBeGreaterThanOrEqual(2);

    const compareRes = await getJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${ids[1]}/compare?with=${ids[0]}`,
      ownerToken
    );
    expect(compareRes.status).toBe(200);

    const compareBody = await compareRes.json();
    expect(compareBody.success).toBe(true);
    expect(compareBody.data.base_snapshot.id).toBe(ids[1]);
    expect(compareBody.data.other_snapshot.id).toBe(ids[0]);
    expect(compareBody.data.delta).toHaveProperty("ap_subledger_balance");
    expect(compareBody.data.delta).toHaveProperty("gl_control_balance");
    expect(compareBody.data.delta).toHaveProperty("variance");
    expect(Array.isArray(compareBody.data.changed_fields)).toBe(true);
  });

  it("exports snapshot in CSV format", async () => {
    const res = await getJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${createdSnapshotId}/export?format=csv`,
      ownerToken
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("snapshot_id");
    expect(csv).toContain(String(createdSnapshotId));
  });

  it("rejects DB-level UPDATE and DELETE on snapshots (append-only immutability)", async () => {
    const db = getTestDb();

    await expect(
      sql`
        UPDATE ap_reconciliation_snapshots
        SET variance = '999.0000'
        WHERE company_id = ${companyId}
          AND id = ${createdSnapshotId}
      `.execute(db)
    ).rejects.toThrow();

    await expect(
      sql`
        DELETE FROM ap_reconciliation_snapshots
        WHERE company_id = ${companyId}
          AND id = ${createdSnapshotId}
      `.execute(db)
    ).rejects.toThrow();
  });

  it("auto-creates snapshot on fiscal-year close approve", async () => {
    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2031,
      startDate: "2031-01-01",
      endDate: "2031-12-31",
      status: "OPEN",
    });

    const closeRequestId = `close-47-6-${Date.now()}`;
    const initiateRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "Story 47.6 auto snapshot test" }
    );

    expect(initiateRes.status).toBe(200);

    const approveRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
      ownerToken,
      { close_request_id: closeRequestId }
    );

    // Current fiscal-year flow can close in initiate step; approve may return 409
    // when the fiscal year is already closed.
    expect([200, 409]).toContain(approveRes.status);

    const snapshotsRes = await getJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots?as_of_date=2031-12-31&auto_generated=true&limit=10",
      ownerToken
    );

    expect(snapshotsRes.status).toBe(200);
    const snapshotsBody = await snapshotsRes.json();
    expect(snapshotsBody.success).toBe(true);
    expect(snapshotsBody.data.items.length).toBeGreaterThanOrEqual(1);
    expect(snapshotsBody.data.items.some((item: { auto_generated: boolean }) => item.auto_generated)).toBe(true);
  });
});
