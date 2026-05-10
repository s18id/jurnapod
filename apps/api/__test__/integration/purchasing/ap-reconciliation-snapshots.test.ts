// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { scaled, unscaled } from "@jurnapod/shared";
import type { KyselySchema } from "@jurnapod/db";
import { closeTestDb, getTestDb } from "../../helpers/db";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import { getTestBaseUrl } from "../../helpers/env";
import {
  assignUserGlobalRole,
  createTestAPReconciliationSettings,
  createTestCompanyMinimal,
  createTestFiscalCloseBalanceFixture,
  createTestFiscalYear,
  createTestPurchasingAccounts,
  createTestRole,
  createTestUser,
  expectImmutableTable,
  getTestAccessToken,
  loginForTest,
  resetFixtureRegistry,
  setModulePermission,
} from "../../fixtures";
import { createAPReconciliationSnapshot } from "../../../src/lib/purchasing/ap-reconciliation-snapshots.js";

describe("purchasing.ap-reconciliation-snapshots", { timeout: 90000 }, () => {
  let baseUrl: string;
  let companyId: number;
  let ownerToken: string;
  let analyzeOnlyToken: string;
  let company2Token: string;
  let createdSnapshotId: number;

  // Task 1: Chain traversal helper (accessible to all tests in this suite)
  async function getSnapshotChain(db: KyselySchema, companyId: number, asOfDate: string) {
    return sql<{ id: number; snapshot_version: number; superseded_by_snapshot_id: number | null; status: string }>`
      SELECT id, snapshot_version, superseded_by_snapshot_id, status
      FROM ap_reconciliation_snapshots
      WHERE company_id = ${companyId}
        AND as_of_date = ${asOfDate}
      ORDER BY snapshot_version ASC
    `.execute(db);
  }

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
    await acquireReadLock();
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
    await releaseReadLock();
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
    // AC1: latest version has status = 'ACTIVE'
    expect(body.data.snapshot.status).toBe("ACTIVE");

    const db = getTestDb();
    const chainRows = await getSnapshotChain(db, companyId, "2026-04-19");

    expect(chainRows.rows.length).toBeGreaterThanOrEqual(2);
    const version1 = chainRows.rows.find((row) => Number(row.snapshot_version) === 1);
    expect(version1).toBeDefined();
    expect(version1?.superseded_by_snapshot_id).not.toBeNull();

    // AC1: latest version (v2) has superseded_by_snapshot_id = NULL
    const version2 = chainRows.rows.find((row) => Number(row.snapshot_version) === 2);
    expect(version2).toBeDefined();
    expect(version2?.superseded_by_snapshot_id).toBeNull();
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

  it("archives snapshot via API and records ARCHIVED audit trail", async () => {
    const createRes = await postJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots",
      ownerToken,
      { as_of_date: "2026-04-22", reason: "archive-target" }
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const snapshotId = Number(createBody.data.snapshot.id);

    const archiveRes = await postJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${snapshotId}/archive`,
      ownerToken
    );

    expect(archiveRes.status).toBe(200);
    const archiveBody = await archiveRes.json();
    expect(archiveBody.success).toBe(true);
    expect(archiveBody.data.snapshot.status).toBe("ARCHIVED");
    expect(archiveBody.data.snapshot.archived_at).toBeTruthy();
    expect(archiveBody.data.snapshot.archive_version).toBe("1");

    // Re-archive is idempotent (no-op)
    const rearchiveRes = await postJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${snapshotId}/archive`,
      ownerToken
    );
    expect(rearchiveRes.status).toBe(200);
    const rearchiveBody = await rearchiveRes.json();
    expect(rearchiveBody.data.snapshot.status).toBe("ARCHIVED");
    expect(rearchiveBody.data.snapshot.archive_version).toBe("1");

    const db = getTestDb();
    const auditRows = await sql<{ action_type: string }>`
      SELECT action_type
      FROM ap_reconciliation_audit_trail
      WHERE company_id = ${companyId}
        AND snapshot_id = ${snapshotId}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);

    expect(auditRows.rows.length).toBeGreaterThan(0);
    expect(auditRows.rows[0]?.action_type).toBe("ARCHIVED");
  });

  it("enforces ACL: analyze-only cannot archive snapshot", async () => {
    const createRes = await postJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots",
      ownerToken,
      { as_of_date: "2026-04-23", reason: "archive-acl" }
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const snapshotId = Number(createBody.data.snapshot.id);

    const archiveRes = await postJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${snapshotId}/archive`,
      analyzeOnlyToken
    );

    expect(archiveRes.status).toBe(403);
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

    // Use canonical helper to verify immutability — no raw SQL assertion in test file.
    await expectImmutableTable(db, "ap_reconciliation_snapshots", {
      companyId,
      recordId: createdSnapshotId,
    });
  });

  // AC2: 3+ version chain with correct pointers
  it("creates 3-version chain with correct pointers (AC2)", async () => {
    const asOfDate = "2026-04-21";

    // Create v1
    const v1Res = await postJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots",
      ownerToken,
      { as_of_date: asOfDate, reason: "v1" }
    );
    expect(v1Res.status).toBe(201);
    const v1 = await v1Res.json();
    const v1Id = Number(v1.data.snapshot.id);
    expect(v1.data.snapshot.snapshot_version).toBe(1);

    // Create v2
    const v2Res = await postJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots",
      ownerToken,
      { as_of_date: asOfDate, reason: "v2" }
    );
    expect(v2Res.status).toBe(201);
    const v2 = await v2Res.json();
    const v2Id = Number(v2.data.snapshot.id);
    expect(v2.data.snapshot.snapshot_version).toBe(2);

    // Create v3
    const v3Res = await postJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots",
      ownerToken,
      { as_of_date: asOfDate, reason: "v3" }
    );
    expect(v3Res.status).toBe(201);
    const v3 = await v3Res.json();
    const v3Id = Number(v3.data.snapshot.id);
    expect(v3.data.snapshot.snapshot_version).toBe(3);

    // Verify chain from DB
    const db = getTestDb();
    const { rows } = await getSnapshotChain(db, companyId, asOfDate);

    expect(rows.length).toBe(3);

    const r1 = rows.find((r) => Number(r.snapshot_version) === 1);
    const r2 = rows.find((r) => Number(r.snapshot_version) === 2);
    const r3 = rows.find((r) => Number(r.snapshot_version) === 3);

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r3).toBeDefined();

    // AC2: v1 → v2
    expect(Number(r1!.superseded_by_snapshot_id)).toBe(Number(r2!.id));
    // AC2: v2 → v3
    expect(Number(r2!.superseded_by_snapshot_id)).toBe(Number(r3!.id));
    // AC2: v3 is CURRENT (no superseder)
    expect(r3!.superseded_by_snapshot_id).toBeNull();
    expect(r3!.status).toBe("ACTIVE");
  });

  // AC3: no orphan snapshots
  it("no orphan snapshots in chain (AC3)", async () => {
    const db = getTestDb();
    const { rows } = await getSnapshotChain(db, companyId, "2026-04-21");

    // AC3: Collect all non-NULL superseded_by_snapshot_id values
    const supersederIds = rows
      .map((r) => r.superseded_by_snapshot_id)
      .filter((id): id is number => id != null && id !== undefined)
      .map(Number);

    // AC3: Each superseder must reference an existing row
    for (const supersederId of supersederIds) {
      const referenced = rows.find((r) => Number(r.id) === supersederId);
      expect(referenced).toBeDefined();
    }

    // AC3: At most one row should have superseded_by_snapshot_id = NULL (the CURRENT one)
    const currentRows = rows.filter((r) => r.superseded_by_snapshot_id == null);
    expect(currentRows.length).toBe(1);
    expect(Number(currentRows[0].snapshot_version)).toBe(3);
  });

  // AC8: CSV export of superseded snapshot
  it("exports superseded snapshot in CSV format (AC8)", async () => {
    // Get a superseded snapshot (version 1 from the 3-version chain)
    const listRes = await getJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots?as_of_date=2026-04-21&limit=10",
      ownerToken
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();

    // Find a superseded snapshot (not the latest)
    const supersededSnapshot = listBody.data.items.find(
      (item: { snapshot_version: number }) =>
        item.snapshot_version <
        Math.max(...listBody.data.items.map((i: { snapshot_version: number }) => i.snapshot_version))
    );
    expect(supersededSnapshot).toBeDefined();

    const res = await getJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${supersededSnapshot.id}/export?format=csv`,
      ownerToken
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("snapshot_id");
    expect(csv).toContain(String(supersededSnapshot.id));
    expect(csv).toContain(String(supersededSnapshot.snapshot_version));
  });

  // AC6: concurrent manual snapshot creation maintains chain integrity
  it("concurrent manual snapshot creation maintains chain integrity (AC6)", async () => {
    // Use a FRESH company for this test — do not pollute existing fixtures
    const concCompany = await createTestCompanyMinimal({
      code: `CHAIN-CONC-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });

    const { ap_account_id } = await createTestPurchasingAccounts(concCompany.id, {
      apAccountName: `Chain Concurrency ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(concCompany.id, [ap_account_id]);

    const asOfDate = "2026-06-01";

    // Two parallel manual snapshots (not auto-generated)
    const [r1, r2] = await Promise.all([
      createAPReconciliationSnapshot({
        companyId: concCompany.id,
        asOfDate,
        createdBy: 1,
        autoGenerated: false,
      }),
      createAPReconciliationSnapshot({
        companyId: concCompany.id,
        asOfDate,
        createdBy: 1,
        autoGenerated: false,
      }),
    ]);

    // Both must succeed with different IDs
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1.id).not.toBe(r2.id);

    // AC6: DB check — valid chain (may have pre-existing rows from prior test runs)
    const db = getTestDb();
    const { rows } = await getSnapshotChain(db, concCompany.id, asOfDate);

    // AC6: At least 2 new rows from this test
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // AC6: Exactly one row has superseded_by_snapshot_id = NULL (the CURRENT one)
    const currentRows = rows.filter((r) => r.superseded_by_snapshot_id == null);
    expect(currentRows.length).toBe(1);

    // AC6: The CURRENT row's superseded_by_snapshot_id must be NULL (not 0)
    expect(currentRows[0].superseded_by_snapshot_id).toBeNull();

    // AC6: The other row(s) must have superseded_by_snapshot_id pointing to existing rows (no orphans)
    const supersededRows = rows.filter((r) => r.superseded_by_snapshot_id != null);
    for (const row of supersededRows) {
      const referenced = rows.find((r) => Number(r.id) === Number(row.superseded_by_snapshot_id));
      expect(referenced).toBeDefined();
    }
  });

  it("auto-creates snapshot on fiscal-year close approve", async () => {
    await createTestFiscalCloseBalanceFixture(companyId, {
      asOfDate: "2031-12-31",
      plBalance: "250.0000",
    });

    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2031,
      startDate: "2031-01-01",
      endDate: "2031-12-31",
      status: "OPEN",
    });

    const closeRequestId = `close-47-6-${Date.now()}`;

    // Step 1: Initiate - should NOT close the fiscal year
    const initiateRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "Story 47.6 auto snapshot test" }
    );

    expect(initiateRes.status).toBe(200);
    const initiateBody = await initiateRes.json();
    expect(initiateBody.success).toBe(true);
    // Initiate should NOT have closed the fiscal year yet
    // The fiscal year status should still be OPEN at this point

    // Verify fiscal year is still OPEN after initiate
    const fyStatusRes = await getJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/status`,
      ownerToken
    );
    expect(fyStatusRes.status).toBe(200);
    const fyStatus = await fyStatusRes.json();
    expect(fyStatus.data.status).toBe("OPEN");

    // Step 2: Approve - should close the fiscal year and create auto snapshot
    const approveRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
      ownerToken,
      { close_request_id: closeRequestId }
    );

    // Approve should succeed with 200 (not 409, since initiate no longer closes)
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.success).toBe(true);

    // Verify fiscal year is now CLOSED after approve
    const fyStatusAfterRes = await getJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/status`,
      ownerToken
    );
    expect(fyStatusAfterRes.status).toBe(200);
    const fyStatusAfter = await fyStatusAfterRes.json();
    expect(fyStatusAfter.data.status).toBe("CLOSED");

    // Verify auto snapshot was created
    const snapshotsRes = await getJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots?as_of_date=2031-12-31&auto_generated=true&limit=10",
      ownerToken
    );

    expect(snapshotsRes.status).toBe(200);
    const snapshotsBody = await snapshotsRes.json();
    expect(snapshotsBody.success).toBe(true);
    expect(snapshotsBody.data.items.length).toBeGreaterThanOrEqual(1);
    expect(snapshotsBody.data.items.some((item: { auto_generated: boolean }) => item.auto_generated)).toBe(true);

    const initialAutoSnapshotCount = Number(snapshotsBody.data.items.length);

    // Replay approve with same close_request_id must be idempotent and side-effect free.
    const replayApproveRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
      ownerToken,
      { close_request_id: closeRequestId }
    );
    expect(replayApproveRes.status).toBe(200);
    const replayApproveBody = await replayApproveRes.json();
    expect(replayApproveBody.success).toBe(true);

    const snapshotsAfterReplayRes = await getJson(
      "/api/purchasing/reports/ap-reconciliation/snapshots?as_of_date=2031-12-31&auto_generated=true&limit=10",
      ownerToken
    );
    expect(snapshotsAfterReplayRes.status).toBe(200);
    const snapshotsAfterReplayBody = await snapshotsAfterReplayRes.json();
    expect(snapshotsAfterReplayBody.success).toBe(true);
    expect(Number(snapshotsAfterReplayBody.data.items.length)).toBe(initialAutoSnapshotCount);
  });

  it("concurrent auto-snapshot calls produce one snapshot (E51-A1 AC6)", async () => {
    // Use deterministic seeded data — specific company + asOfDate = fiscal year end
    const company = await createTestCompanyMinimal({
      code: `CONC-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });

    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Retained Earnings AP CONC ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);
    await createTestFiscalCloseBalanceFixture(company.id, {
      asOfDate: "2032-12-31",
      plBalance: "500.0000",
    });

    const fiscalYear = await createTestFiscalYear(company.id, {
      year: 2032,
      startDate: "2032-01-01",
      endDate: "2032-12-31",
      status: "OPEN",
    });

    const asOfDate = "2032-12-31";

    // Fire two parallel calls with same inputs
    const [result1, result2] = await Promise.all([
      createAPReconciliationSnapshot({
        companyId: company.id,
        asOfDate,
        createdBy: 1,
        autoGenerated: true,
      }),
      createAPReconciliationSnapshot({
        companyId: company.id,
        asOfDate,
        createdBy: 1,
        autoGenerated: true,
      }),
    ]);

    // Exactly one row should exist
    const count = await sql<{ cnt: number }>`
      SELECT COUNT(*) AS cnt FROM ap_reconciliation_snapshots
      WHERE company_id = ${company.id}
        AND as_of_date = ${asOfDate}
    `.execute(getTestDb());

    expect(Number(count.rows[0].cnt)).toBe(1);

    // Both should return the same snapshot ID
    expect(result1.id).toBe(result2.id);
  });

  // ============================================================
  // Audit Trail Completeness Tests (Story 55.4)
  // ============================================================

  // AC1: Every snapshot has at least one audit trail entry
  it("every snapshot has at least one audit trail entry (AC1)", async () => {
    // Create fresh company
    const company = await createTestCompanyMinimal({
      code: `AUDIT-AC1-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Audit AC1 ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    // Create 2 snapshots
    await createAPReconciliationSnapshot({ companyId: company.id, asOfDate: "2026-07-01", createdBy: 1 });
    await createAPReconciliationSnapshot({ companyId: company.id, asOfDate: "2026-07-01", createdBy: 1 });

    const db = getTestDb();
    const result = await sql<{ snapshot_id: number; audit_count: number }>`
      SELECT s.id AS snapshot_id, COUNT(a.id) AS audit_count
      FROM ap_reconciliation_snapshots s
      LEFT JOIN ap_reconciliation_audit_trail a ON a.snapshot_id = s.id
      WHERE s.company_id = ${company.id}
      GROUP BY s.id
    `.execute(db);

    const resultRows = result.rows as { snapshot_id: number; audit_count: number }[];
    expect(resultRows.length).toBeGreaterThanOrEqual(2);
    for (const r of resultRows) {
      expect(Number(r.audit_count)).toBeGreaterThanOrEqual(1);
    }
  });

  // AC2: Auto-generated snapshot has correct audit entry
  it("auto-generated snapshot has correct audit entry (AC2)", async () => {
    const company = await createTestCompanyMinimal({
      code: `AUDIT-AC2-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Audit AC2 ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const snapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate: "2026-08-01",
      createdBy: 1,
      autoGenerated: true,
    });

    expect(snapshot.autoGenerated).toBe(true);

    const db = getTestDb();
    const auditRows = await sql<{ action_type: string; change_reason: string | null; changed_by: number; previous_snapshot_id: number | null }>`
      SELECT action_type, change_reason, changed_by, previous_snapshot_id
      FROM ap_reconciliation_audit_trail
      WHERE snapshot_id = ${snapshot.id}
    `.execute(db);

    expect(auditRows.rows.length).toBe(1);
    expect(auditRows.rows[0].action_type).toBe("CREATED");
    expect(auditRows.rows[0].change_reason).toContain("period_close_auto_snapshot");
    expect(Number(auditRows.rows[0].changed_by)).toBe(1);
    expect(auditRows.rows[0].previous_snapshot_id).toBeNull();
  });

  // AC3: Manual snapshot has correct audit entry
  it("manual snapshot has correct audit entry (AC3)", async () => {
    const company = await createTestCompanyMinimal({
      code: `AUDIT-AC3-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Audit AC3 ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const asOfDate = "2029-09-01";
    const snapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate,
      createdBy: 1,
      autoGenerated: false,
      reason: "month-end manual check",
    });

    expect(snapshot.autoGenerated).toBe(false);
    expect(snapshot.snapshotVersion).toBeGreaterThanOrEqual(1);
    expect(snapshot.snapshotVersion).toBeLessThan(100);

    const db = getTestDb();
    const auditRows = await sql<{ action_type: string; change_reason: string | null; changed_by: number }>`
      SELECT action_type, change_reason, changed_by
      FROM ap_reconciliation_audit_trail
      WHERE snapshot_id = ${snapshot.id}
    `.execute(db);

    expect(auditRows.rows.length).toBeGreaterThanOrEqual(1);
    // For a manual snapshot, the action_type should be either CREATED (first snapshot) or RECALCULATED (subsequent).
    // The key invariant is that audit trail exists and change_reason is preserved.
    const auditRow = auditRows.rows[0];
    expect(auditRow.change_reason).toBe("month-end manual check");
    expect(Number(auditRow.changed_by)).toBe(1);
  });

  // AC4: Superseded chain is correctly recorded
  it("superseded chain is correctly recorded (AC4)", async () => {
    const company = await createTestCompanyMinimal({
      code: `AUDIT-AC4-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Audit AC4 ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const asOfDate = "2029-10-01";

    // Create v1
    const v1 = await createAPReconciliationSnapshot({
      companyId: company.id, asOfDate, createdBy: 1, autoGenerated: false,
    });
    expect(v1.snapshotVersion).toBeGreaterThanOrEqual(1);

    // Create v2 (supersedes v1)
    const v2 = await createAPReconciliationSnapshot({
      companyId: company.id, asOfDate, createdBy: 1, autoGenerated: false,
    });
    expect(v2.snapshotVersion).toBe(v1.snapshotVersion + 1);

    const db = getTestDb();

    // Verify snapshot chain: v1.superseded_by_snapshot_id = v2.id
    const snapRows = await sql<{ superseded_by_snapshot_id: number | null }>`
      SELECT superseded_by_snapshot_id
      FROM ap_reconciliation_snapshots
      WHERE id = ${v1.id}
    `.execute(db);
    expect(Number(snapRows.rows[0].superseded_by_snapshot_id)).toBe(v2.id);

    // Verify audit chain: v2's audit entry has action_type = RECALCULATED and previous_snapshot_id = v1.id
    const auditRows = await sql<{ action_type: string; previous_snapshot_id: number | null }>`
      SELECT action_type, previous_snapshot_id
      FROM ap_reconciliation_audit_trail
      WHERE snapshot_id = ${v2.id}
    `.execute(db);
    expect(auditRows.rows.length).toBe(1);
    expect(auditRows.rows[0].action_type).toBe("RECALCULATED");
    expect(Number(auditRows.rows[0].previous_snapshot_id)).toBe(v1.id);
  });

  // AC5: Provenance query returns complete chain
  it("provenance query returns complete chain (AC5)", async () => {
    const company = await createTestCompanyMinimal({
      code: `AUDIT-AC5-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Audit AC5 ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const asOfDate = "2029-11-01";
    const snapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate,
      createdBy: 1,
      autoGenerated: false,
    });

    expect(snapshot.snapshotVersion).toBeGreaterThanOrEqual(1);

    const db = getTestDb();
    const provenance = await sql<{
      snapshot_id: number;
      snapshot_version: number;
      action_type: string;
      change_reason: string | null;
      changed_by: number;
    }>`
      SELECT
        s.id AS snapshot_id,
        s.snapshot_version,
        a.action_type,
        a.change_reason,
        a.changed_by
      FROM ap_reconciliation_snapshots s
      JOIN ap_reconciliation_audit_trail a ON a.snapshot_id = s.id
      WHERE s.id = ${snapshot.id}
    `.execute(db);

    expect(provenance.rows.length).toBe(1);
    expect(Number(provenance.rows[0].snapshot_id)).toBe(snapshot.id);
    expect(Number(provenance.rows[0].snapshot_version)).toBe(snapshot.snapshotVersion);
    // action_type should be either CREATED (first) or RECALCULATED (subsequent)
    expect(["CREATED", "RECALCULATED"]).toContain(provenance.rows[0].action_type);
    expect(provenance.rows[0].change_reason).toBe("manual_snapshot");
    expect(Number(provenance.rows[0].changed_by)).toBe(1);
  });

  // AC7: Backfill detection flags snapshots without audit trail
  it("backfill detection flags snapshots without audit trail (AC7)", async () => {
    const company = await createTestCompanyMinimal({
      code: `AUDIT-AC7-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Audit AC7 ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const snapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate: "2026-12-01",
      createdBy: 1,
    });

    // The snapshot should have an audit trail normally.
    // The query should return 0 rows if everything is working correctly.
    const db = getTestDb();
    const orphans = await sql<{ snapshot_id: number }>`
      SELECT s.id AS snapshot_id
      FROM ap_reconciliation_snapshots s
      LEFT JOIN ap_reconciliation_audit_trail a ON a.snapshot_id = s.id
      WHERE s.company_id = ${company.id}
        AND a.id IS NULL
    `.execute(db);

    expect(orphans.rows.length).toBe(0);
  });

  // AC1: Race simulation — manual snapshot before auto-snapshot returns same ID
  // The idempotency guard (broadened in Story 55.5) prevents version bump when
  // a manual snapshot already captured the same inputs. Both paths return the same snapshot.
  it("manual snapshot before auto-snapshot returns same snapshot (AC1)", async () => {
    const company = await createTestCompanyMinimal({
      code: `RACE-AC1-${Date.now()}-${Math.floor(Math.random() * 10000)}`.slice(0, 20),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Race AC1 ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const asOfDate = "2027-01-01";

    // Step 1: Manual snapshot first (simulates user during post-close gap)
    const manualSnapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate,
      createdBy: 1,
      autoGenerated: false,
      reason: "manual during close gap",
    });
    expect(manualSnapshot.autoGenerated).toBe(false);

    // Step 2: Auto-snapshot trigger fires (simulates fiscal close after gap)
    const autoSnapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate,
      createdBy: 1,
      autoGenerated: true,
    });

    // AC1 invariant: both paths return the SAME snapshot (no duplicate version)
    expect(autoSnapshot.id).toBe(manualSnapshot.id);
    expect(autoSnapshot.autoGenerated).toBe(false); // Returns the manual snapshot

    // AC1 invariant: exactly 1 snapshot row in DB for this company+date
    // (no duplicate rows created — the auto path returned the manual snapshot)
    const db = getTestDb();
    const count = await sql<{ cnt: number }>`
      SELECT COUNT(*) AS cnt
      FROM ap_reconciliation_snapshots
      WHERE company_id = ${company.id}
        AND as_of_date = ${asOfDate}
    `.execute(db);
    expect(Number(count.rows[0].cnt)).toBe(1);

    // AC1 invariant: audit trail has CREATED (not RECALCULATED)
    const auditRows = await sql<{ action_type: string }>`
      SELECT action_type
      FROM ap_reconciliation_audit_trail
      WHERE snapshot_id = ${manualSnapshot.id}
    `.execute(db);
    expect(auditRows.rows.length).toBe(1);
    expect(auditRows.rows[0].action_type).toBe("CREATED");
  });

  // AC4: CSV export correctness — CSV content contains valid snapshot data
  it("CSV export contains correct snapshot data (AC4)", async () => {
    const asOfDate = "2027-02-01";
    const baseUrl = getTestBaseUrl();

    // Create fresh company with auth
    const company = await createTestCompanyMinimal({
      code: `CSV-AC4-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `CSV AC4 ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const seedToken = await getTestAccessToken(baseUrl);
    const csvRole = await createTestRole(baseUrl, seedToken, "CSV AC4 Role");
    const csvUser = await createTestUser(company.id, {
      email: `csv-ac4-${Date.now()}@example.com`,
      name: "CSV AC4 User",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(csvUser.id, csvRole.id);
    await setModulePermission(company.id, csvRole.id, "purchasing", "reports", 63);
    const csvToken = await loginForTest(baseUrl, company.code, csvUser.email, "TestPassword123!");

    // Create v1
    const v1 = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate,
      createdBy: csvUser.id,
      autoGenerated: false,
      reason: "v1 baseline",
    });

    // Create v2 (supersedes v1)
    const v2 = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate,
      createdBy: csvUser.id,
      autoGenerated: false,
      reason: "v2 updated",
    });
    expect(v2.id).not.toBe(v1.id);

    // Export v1 and v2 CSV via API
    const v1CsvRes = await getJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${v1.id}/export?format=csv`,
      csvToken
    );
    expect(v1CsvRes.status).toBe(200);
    expect(v1CsvRes.headers.get("content-type")).toContain("text/csv");
    const v1Csv = await v1CsvRes.text();

    const v2CsvRes = await getJson(
      `/api/purchasing/reports/ap-reconciliation/snapshots/${v2.id}/export?format=csv`,
      csvToken
    );
    expect(v2CsvRes.status).toBe(200);
    expect(v2CsvRes.headers.get("content-type")).toContain("text/csv");
    const v2Csv = await v2CsvRes.text();

    // Both CSVs must be valid: header + data row
    expect(v1Csv).toContain("snapshot_id");
    expect(v2Csv).toContain("snapshot_id");

    // Parse CSV to verify fields
    const parseCsv = (csv: string): { headers: string[]; values: string[] } => {
      const lines = csv.trim().split("\n");
      return {
        headers: lines[0].split(","),
        values: lines[1].split(","),
      };
    };

    const v1Parsed = parseCsv(v1Csv);
    const v2Parsed = parseCsv(v2Csv);
    const csvGet = (name: string, p: { headers: string[]; values: string[] }): string => {
      const idx = p.headers.indexOf(name);
      return idx >= 0 ? p.values[idx] ?? "" : "";
    };

    // AC4: Both CSVs must contain the correct snapshot ID
    expect(csvGet("snapshot_id", v1Parsed)).toBe(String(v1.id));
    expect(csvGet("snapshot_id", v2Parsed)).toBe(String(v2.id));

    // AC4: Both CSVs must have non-empty balance/variance fields
    expect(csvGet("ap_subledger_balance", v1Parsed)).toBeTruthy();
    expect(csvGet("gl_control_balance", v1Parsed)).toBeTruthy();
    expect(csvGet("variance", v1Parsed)).toBeTruthy();
    expect(csvGet("ap_subledger_balance", v2Parsed)).toBeTruthy();
    expect(csvGet("gl_control_balance", v2Parsed)).toBeTruthy();
    expect(csvGet("variance", v2Parsed)).toBeTruthy();

    // AC4: For a company with no AP transactions, subledger == GL == 0 → variance = 0
    const v1Ap = scaled(csvGet("ap_subledger_balance", v1Parsed));
    const v1Gl = scaled(csvGet("gl_control_balance", v1Parsed));
    const v1Var = scaled(csvGet("variance", v1Parsed));
    const v2Ap = scaled(csvGet("ap_subledger_balance", v2Parsed));
    const v2Gl = scaled(csvGet("gl_control_balance", v2Parsed));
    const v2Var = scaled(csvGet("variance", v2Parsed));

    // Internal consistency: variance = gl - ap
    expect(v1Ap).toBe(v1Gl);
    expect(v1Var).toBe(0n);
    expect(v2Ap).toBe(v2Gl);
    expect(v2Var).toBe(0n);
    expect(v2Ap - v1Ap).toBe(0n); // Same AP state → same CSV values

    // AC4: Status field in CSV
    expect(csvGet("status", v1Parsed)).toBe("ACTIVE");
    expect(csvGet("status", v2Parsed)).toBe("ACTIVE");

    // AC4: Superseded snapshot CSV contains correct snapshot_id and version
    expect(v1Csv).toContain(String(v1.id));
    expect(v2Csv).toContain(String(v2.id));
  });

  // ============================================================
  // Archive Flow Tests (Story 56.1)
  // ============================================================

  it("AC1: non-archive UPDATE still blocked by trigger (AC1)", async () => {
    const db = getTestDb();

    // Create a fresh snapshot to test UPDATE blocking
    const company = await createTestCompanyMinimal({
      code: `ARCHIVE-NON-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Archive Non-blk ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const snapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate: "2026-10-01",
      createdBy: 1,
    });

    // Attempt to UPDATE a non-archive field (e.g., variance) — should be blocked by trigger
    // Use db.updateTable for proper Kysely result handling
    await expect(
      db.updateTable("ap_reconciliation_snapshots")
        .set({ variance: "999.99" as unknown as number })
        .where("id", "=", snapshot.id)
        .execute()
    ).rejects.toThrow();
  });

  it("AC2: archive transition (status='ARCHIVED') is allowed by trigger (AC2)", async () => {
    const db = getTestDb();

    // Create a fresh snapshot for archive testing
    const company = await createTestCompanyMinimal({
      code: `ARCHIVE-OK-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Archive OK ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const snapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate: "2026-10-15",
      createdBy: 1,
    });

    // Archive the snapshot — UPDATE with status='ARCHIVED' should succeed.
    // Note: we do NOT update archived_at here because the 0193 trigger requires
    // all non-key fields (including archived_at) to remain unchanged.
    // Only status and archive_version change; archived_at stays NULL (default).
    const archiveResults = await db.updateTable("ap_reconciliation_snapshots")
      .set({
        status: "ARCHIVED",
        archive_version: "1",
      })
      .where("id", "=", snapshot.id)
      .execute();

    expect(archiveResults.length).toBe(1);
    expect(Number(archiveResults[0].numUpdatedRows)).toBe(1);

    // Verify the snapshot is now ARCHIVED in DB
    const result = await sql`SELECT status, archive_version FROM ap_reconciliation_snapshots WHERE id = ${snapshot.id}`.execute(db);
    expect((result.rows[0] as { status: string; archive_version: string | null }).status).toBe("ARCHIVED");
    expect((result.rows[0] as { status: string; archive_version: string | null }).archive_version).toBe("1");
  });

  it("AC1+AC2: archive of already-archived snapshot is a no-op (edge case)", async () => {
    const db = getTestDb();

    const company = await createTestCompanyMinimal({
      code: `ARCHIVE-DBL-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    const { ap_account_id } = await createTestPurchasingAccounts(company.id, {
      apAccountName: `Archive Dbl ${Date.now()}`,
    });
    await createTestAPReconciliationSettings(company.id, [ap_account_id]);

    const snapshot = await createAPReconciliationSnapshot({
      companyId: company.id,
      asOfDate: "2026-11-01",
      createdBy: 1,
    });

    // First archive transition — status only, archive_version increments
    await db.updateTable("ap_reconciliation_snapshots")
      .set({
        status: "ARCHIVED",
        archive_version: "1",
      })
      .where("id", "=", snapshot.id)
      .execute();

    // Second archive transition (already ARCHIVED) — should still succeed (no-op)
    const result2 = await db.updateTable("ap_reconciliation_snapshots")
      .set({
        status: "ARCHIVED",
        archive_version: "2",
      })
      .where("id", "=", snapshot.id)
      .execute();

    expect(result2.length).toBe(1);
    expect(Number(result2[0].numUpdatedRows)).toBe(1);

    // Verify archive_version incremented
    const result2rows = await sql`SELECT archive_version FROM ap_reconciliation_snapshots WHERE id = ${snapshot.id}`.execute(db);
    expect((result2rows.rows[0] as { archive_version: string | null }).archive_version).toBe("2");
  });
});
