// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for Story 12.4 - V2 Reservations API
 *
 * Tests the V2 contract for reservation management including:
 * - GET /api/dinein/reservations (list with filters, pagination)
 * - GET /api/dinein/reservations/:id (get single)
 * - POST /api/dinein/reservations (create)
 * - PATCH /api/dinein/reservations/:id (status updates)
 *
 * Follows integration test policy: API-driven setup where possible,
 * direct DB access only for cleanup.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { Pool } from "mysql2/promise";
import {
  createIntegrationTestContext,
  loginOwner,
  readEnv,
  TEST_TIMEOUT_MS
} from "../../../../tests/integration/integration-harness.mjs";
import { closeDbPool } from "../../../../src/lib/db";

const testContext = createIntegrationTestContext();
let baseUrl = "";
let db: Pool | null = null;

function getDb(): Pool {
  if (!db) {
    throw new Error("Database pool not initialized");
  }
  return db;
}

test.before(async () => {
  await testContext.start();
  baseUrl = testContext.baseUrl;
  db = testContext.db;
});

test.after(async () => {
  await testContext.stop();
});

async function requestJson(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test(
  "Story 12.4: V2 Reservations API - full lifecycle with filters and status transitions",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const runId = Date.now().toString(36);
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let token = "";
    const createdTableIds: number[] = [];
    const createdReservationIds: number[] = [];

    try {
      // Get company and user fixtures
      const [ownerRows] = await getDb().execute<RowDataPacket[]>(
        `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ? AND u.email = ? AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found; run database seed first");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // Login to get access token
      token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
      const authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      // ============================================
      // Test 1: POST /api/dinein/reservations - Create reservation
      // ============================================
      await test("POST /api/dinein/reservations creates reservation with 201", async () => {
        const reservationTime = new Date();
        reservationTime.setHours(reservationTime.getHours() + 2);

        const { response, payload } = await requestJson(`/api/dinein/reservations?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            partySize: 4,
            customerName: `API Customer ${runId}`,
            customerPhone: "081234567890",
            customerEmail: `test-${runId}@example.com`,
            reservationTime: reservationTime.toISOString(),
            durationMinutes: 90,
            notes: "API test reservation"
          })
        });

        assert.strictEqual(response.status, 201, "Should return 201 Created");
        assert.ok(payload.data?.id, "Response should include reservation id");
        assert.ok(payload.data?.reservationCode, "Response should include reservation code");
        assert.ok(payload.data?.reservationCode.startsWith("RES-"), "Code should start with RES-");
        assert.equal(payload.data?.statusId, 1, "Status should be PENDING (1)");
        assert.equal(payload.data?.partySize, 4, "Party size should match");
        assert.equal(payload.data?.customerName, `API Customer ${runId}`, "Customer name should match");
        assert.ok(payload.data?.message, "Response should include success message");

        createdReservationIds.push(Number(payload.data.id));
      });

      // ============================================
      // Test 2: POST - Validation errors return 400
      // ============================================
      await test("POST /api/dinein/reservations returns 400 for invalid data", async () => {
        const { response, payload } = await requestJson(`/api/dinein/reservations?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            partySize: 0, // Invalid: should be at least 1
            customerName: "", // Invalid: required
            reservationTime: "invalid-date", // Invalid: not ISO date
            durationMinutes: -1 // Invalid: negative
          })
        });

        assert.strictEqual(response.status, 400, "Should return 400 for invalid data");
        assert.equal(payload.error?.code, "INVALID_REQUEST", "Error code should be INVALID_REQUEST");
      });

      // ============================================
      // Test 3: POST - Missing outletId returns 400
      // ============================================
      await test("POST /api/dinein/reservations returns 400 for missing outletId", async () => {
        const { response, payload } = await requestJson(`/api/dinein/reservations`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            partySize: 2,
            customerName: `Test ${runId}`,
            reservationTime: new Date().toISOString(),
            durationMinutes: 60
          })
        });

        assert.strictEqual(response.status, 400, "Should return 400 for missing outletId");
        assert.equal(payload.error?.code, "MISSING_OUTLET_ID", "Error code should be MISSING_OUTLET_ID");
      });

      // ============================================
      // Test 4: GET /api/dinein/reservations - List with filters
      // ============================================
      await test("GET /api/dinein/reservations lists reservations with pagination", async () => {
        // Create a few more reservations for list testing
        const baseTime = new Date();
        baseTime.setHours(baseTime.getHours() + 3);

        for (let i = 0; i < 3; i++) {
          const reservationTime = new Date(baseTime);
          reservationTime.setHours(reservationTime.getHours() + i);

          const { response, payload } = await requestJson(`/api/dinein/reservations?outletId=${outletId}`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              partySize: i + 2,
              customerName: `ListTest Customer ${i} ${runId}`,
              customerPhone: "081234567890",
              reservationTime: reservationTime.toISOString(),
              durationMinutes: 90
            })
          });

          if (response.status === 201) {
            createdReservationIds.push(Number(payload.data.id));
          }
        }

        // Test list all
        const { response, payload } = await requestJson(`/api/dinein/reservations?outletId=${outletId}&limit=10&offset=0`, {
          method: "GET",
          headers: authHeaders
        });

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.ok(Array.isArray(payload.data?.reservations), "Response should include reservations array");
        assert.ok(payload.data?.pagination, "Response should include pagination");
        assert.ok(typeof payload.data?.pagination?.total === "number", "Pagination should include total");
        assert.ok(typeof payload.data?.pagination?.hasMore === "boolean", "Pagination should include hasMore");
      });

      // ============================================
      // Test 5: GET - Filter by customer name
      // ============================================
      await test("GET /api/dinein/reservations filters by customer name", async () => {
        const { response, payload } = await requestJson(
          `/api/dinein/reservations?outletId=${outletId}&customerName=ListTest Customer 0 ${runId}&limit=10`,
          { method: "GET", headers: authHeaders }
        );

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.ok(payload.data?.reservations?.length >= 1, "Should find at least one matching reservation");
        assert.ok(
          payload.data.reservations[0].customerName.includes(`ListTest Customer 0 ${runId}`),
          "Found reservation should match filter"
        );
      });

      // ============================================
      // Test 6: GET - Pagination limits
      // ============================================
      await test("GET /api/dinein/reservations respects pagination limits", async () => {
        const { response, payload } = await requestJson(
          `/api/dinein/reservations?outletId=${outletId}&limit=2&offset=0`,
          { method: "GET", headers: authHeaders }
        );

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.ok(payload.data?.reservations?.length <= 2, "Should return at most 2 reservations");
        assert.equal(payload.data?.pagination?.limit, 2, "Pagination limit should be 2");
        assert.equal(payload.data?.pagination?.offset, 0, "Pagination offset should be 0");
      });

      // ============================================
      // Test 7: GET /api/dinein/reservations/:id - Get single reservation
      // ============================================
      await test("GET /api/dinein/reservations/:id returns single reservation", async () => {
        if (createdReservationIds.length === 0) {
          return;
        }

        const reservationId = createdReservationIds[0];
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          { method: "GET", headers: authHeaders }
        );

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.ok(payload.data?.id, "Response should include reservation id");
        assert.equal(payload.data?.id, reservationId.toString(), "ID should match");
        assert.ok(payload.data?.reservationCode, "Response should include reservation code");
        assert.ok(payload.data?.statusId, "Response should include status");
        assert.ok(payload.data?.customerName, "Response should include customer name");
        assert.ok(payload.data?.createdAt, "Response should include createdAt");
        assert.ok(payload.data?.updatedAt, "Response should include updatedAt");
      });

      // ============================================
      // Test 8: GET - 404 for non-existent reservation
      // ============================================
      await test("GET /api/dinein/reservations/:id returns 404 for non-existent", async () => {
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/999999?outletId=${outletId}`,
          { method: "GET", headers: authHeaders }
        );

        assert.strictEqual(response.status, 404, "Should return 404");
        assert.equal(payload.error?.code, "NOT_FOUND", "Error code should be NOT_FOUND");
      });

      // ============================================
      // Test 9: Tenant isolation - wrong outlet returns 404
      // ============================================
      await test("GET /api/dinein/reservations/:id returns 404 for wrong outlet", async () => {
        if (createdReservationIds.length === 0) {
          return;
        }

        const reservationId = createdReservationIds[0];
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=999999`,
          { method: "GET", headers: authHeaders }
        );

        assert.strictEqual(response.status, 404, "Should return 404 for wrong outlet");
        assert.equal(payload.error?.code, "NOT_FOUND", "Error code should be NOT_FOUND");
      });

      // ============================================
      // Test 10: PATCH /api/dinein/reservations/:id - Status update
      // ============================================
      await test("PATCH /api/dinein/reservations/:id updates status with valid transition", async () => {
        if (createdReservationIds.length === 0) {
          return;
        }

        const reservationId = createdReservationIds[0];

        // Transition PENDING -> CONFIRMED
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
              statusId: 2 // CONFIRMED
            })
          }
        );

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.equal(payload.data?.statusId, 2, "Status should be CONFIRMED (2)");
        assert.equal(payload.data?.previousStatusId, 1, "Previous status should be PENDING (1)");
        assert.ok(payload.data?.message, "Response should include success message");
      });

      // ============================================
      // Test 11: PATCH - Invalid status transition returns 400
      // ============================================
      await test("PATCH /api/dinein/reservations/:id returns 400 for invalid transition", async () => {
        if (createdReservationIds.length === 0) {
          return;
        }

        const reservationId = createdReservationIds[0];

        // Try to transition CONFIRMED -> PENDING (invalid)
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
              statusId: 1 // PENDING - invalid from CONFIRMED
            })
          }
        );

        assert.strictEqual(response.status, 400, "Should return 400 for invalid transition");
        assert.equal(payload.error?.code, "INVALID_TRANSITION", "Error code should be INVALID_TRANSITION");
      });

      // ============================================
      // Test 12: PATCH - 404 for non-existent reservation
      // ============================================
      await test("PATCH /api/dinein/reservations/:id returns 404 for non-existent", async () => {
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/999999?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
              statusId: 2
            })
          }
        );

        assert.strictEqual(response.status, 404, "Should return 404");
        assert.equal(payload.error?.code, "NOT_FOUND", "Error code should be NOT_FOUND");
      });

      // ============================================
      // Test 13: PATCH - Missing outletId returns 400
      // ============================================
      await test("PATCH /api/dinein/reservations/:id returns 400 for missing outletId", async () => {
        if (createdReservationIds.length === 0) {
          return;
        }

        const reservationId = createdReservationIds[0];
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/${reservationId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
              statusId: 2
            })
          }
        );

        assert.strictEqual(response.status, 400, "Should return 400 for missing outletId");
        assert.equal(payload.error?.code, "MISSING_OUTLET_ID", "Error code should be MISSING_OUTLET_ID");
      });

      // ============================================
      // Test 14: PATCH - Cancel reservation with reason
      // ============================================
      await test("PATCH /api/dinein/reservations/:id cancels with reason", async () => {
        // Create a new reservation for cancellation test
        const reservationTime = new Date();
        reservationTime.setHours(reservationTime.getHours() + 3);

        const { response: createResponse, payload: createPayload } = await requestJson(
          `/api/dinein/reservations?outletId=${outletId}`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              partySize: 2,
              customerName: `CancelTest ${runId}`,
              customerPhone: "081234567890",
              reservationTime: reservationTime.toISOString(),
              durationMinutes: 60
            })
          }
        );

        if (createResponse.status !== 201) {
          return;
        }

        const reservationId = Number(createPayload.data.id);
        createdReservationIds.push(reservationId);

        // First confirm
        await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ statusId: 2 })
          }
        );

        // Then cancel with reason
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
              statusId: 5, // CANCELLED
              cancellationReason: "Customer requested cancellation",
              notes: "Cancelled via phone call"
            })
          }
        );

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.equal(payload.data?.statusId, 5, "Status should be CANCELLED (5)");
      });

      // ============================================
      // Test 15: Full lifecycle - PENDING -> COMPLETED
      // ============================================
      await test("Full reservation lifecycle: PENDING -> CONFIRMED -> CHECKED_IN -> COMPLETED", async () => {
        const reservationTime = new Date();
        reservationTime.setHours(reservationTime.getHours() + 4);

        // Create reservation
        const { response: createResponse, payload: createPayload } = await requestJson(
          `/api/dinein/reservations?outletId=${outletId}`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              partySize: 3,
              customerName: `LifecycleTest ${runId}`,
              customerPhone: "081234567890",
              reservationTime: reservationTime.toISOString(),
              durationMinutes: 90
            })
          }
        );

        assert.strictEqual(createResponse.status, 201, "Create should succeed");
        const reservationId = Number(createPayload.data.id);
        createdReservationIds.push(reservationId);
        assert.equal(createPayload.data.statusId, 1, "Initial status should be PENDING");

        // Confirm
        const { response: confirmResponse, payload: confirmPayload } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ statusId: 2 })
          }
        );

        assert.strictEqual(confirmResponse.status, 200, "Confirm should succeed");
        assert.equal(confirmPayload.data.statusId, 2, "Status should be CONFIRMED");
        assert.equal(confirmPayload.data.previousStatusId, 1, "Previous should be PENDING");

        // Check in
        const { response: checkinResponse, payload: checkinPayload } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ statusId: 3 })
          }
        );

        assert.strictEqual(checkinResponse.status, 200, "Check-in should succeed");
        assert.equal(checkinPayload.data.statusId, 3, "Status should be CHECKED_IN");

        // Complete
        const { response: completeResponse, payload: completePayload } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ statusId: 6 })
          }
        );

        assert.strictEqual(completeResponse.status, 200, "Complete should succeed");
        assert.equal(completePayload.data.statusId, 6, "Status should be COMPLETED");

        // Verify cannot transition from COMPLETED
        const { response: invalidResponse } = await requestJson(
          `/api/dinein/reservations/${reservationId}?outletId=${outletId}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ statusId: 1 })
          }
        );

        assert.strictEqual(invalidResponse.status, 400, "Cannot transition from COMPLETED");
      });

      // ============================================
      // Test 16: Invalid reservationId format returns 400
      // ============================================
      await test("GET /api/dinein/reservations/:id returns 400 for invalid id format", async () => {
        const { response, payload } = await requestJson(
          `/api/dinein/reservations/invalid-id?outletId=${outletId}`,
          { method: "GET", headers: authHeaders }
        );

        assert.strictEqual(response.status, 400, "Should return 400 for invalid id");
        assert.equal(payload.error?.code, "INVALID_REQUEST", "Error code should be INVALID_REQUEST");
      });

      // ============================================
      // Test 17: Invalid outletId format returns 400
      // ============================================
      await test("GET /api/dinein/reservations returns 400 for invalid outletId", async () => {
        const { response, payload } = await requestJson(
          `/api/dinein/reservations?outletId=invalid`,
          { method: "GET", headers: authHeaders }
        );

        assert.strictEqual(response.status, 400, "Should return 400 for invalid outletId");
        assert.equal(payload.error?.code, "INVALID_REQUEST", "Error code should be INVALID_REQUEST");
      });

      // ============================================
      // Test 18: Unauthorized access returns 401
      // ============================================
      await test("GET /api/dinein/reservations returns 401 without auth", async () => {
        const { response } = await requestJson(
          `/api/dinein/reservations?outletId=${outletId}`,
          { method: "GET" } // No auth headers
        );

        assert.strictEqual(response.status, 401, "Should return 401 without auth");
      });

    } finally {
      // CLEANUP: Delete created reservations
      if (createdReservationIds.length > 0) {
        const placeholders = createdReservationIds.map(() => "?").join(", ");
        await getDb().execute(
          `DELETE FROM reservations WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdReservationIds]
        );
      }

      // CLEANUP: Delete created tables
      if (createdTableIds.length > 0) {
        const placeholders = createdTableIds.map(() => "?").join(", ");
        await getDb().execute(
          `DELETE FROM outlet_tables WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdTableIds]
        );
      }
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
