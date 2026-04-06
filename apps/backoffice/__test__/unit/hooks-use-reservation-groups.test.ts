// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test, afterEach } from "node:test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Overrides globalThis.fetch for the duration of a test, then restores it. */
async function withMockedFetch<T>(
  fakeResp: { ok: boolean; status: number; body: unknown },
  fn: () => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
   
  globalThis.fetch = (async () => {
    return {
      ok: fakeResp.ok,
      status: fakeResp.status,
      async json() {
        return fakeResp.body;
      },
      async text() {
        return JSON.stringify(fakeResp.body);
      }
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

// ---------------------------------------------------------------------------
// Tests — createReservationGroup
// ---------------------------------------------------------------------------
describe("createReservationGroup", () => {
  test("POSTs to /reservation-groups and returns parsed group_id + reservation_ids", async () => {
    const { createReservationGroup } = await import("./use-reservation-groups.js");

    const result = await withMockedFetch(
      {
        ok: true,
        status: 201,
        body: { success: true, data: { group_id: 55, reservation_ids: [101, 102] } }
      },
      () =>
        createReservationGroup(
          {
            outlet_id: 3,
            customer_name: "Smith",
            guest_count: 8,
            table_ids: [1, 2],
            reservation_at: "2026-03-20T18:00:00+07:00"
          },
          "tok"
        )
    );

    assert.strictEqual(result.group_id, 55);
    assert.deepStrictEqual(result.reservation_ids, [101, 102]);
  });

  test("throws ApiError on 409 conflict", async () => {
    const { createReservationGroup } = await import("./use-reservation-groups.js");

    await assert.rejects(
      () =>
        withMockedFetch(
          {
            ok: false,
            status: 409,
            body: { data: { code: "CONFLICT", message: "Tables not available" } }
          },
          () =>
            createReservationGroup(
              {
                outlet_id: 3,
                customer_name: "Smith",
                guest_count: 8,
                table_ids: [1, 2],
                reservation_at: "2026-03-20T18:00:00+07:00"
              },
              "tok"
            )
        ),
      (err: unknown) => {
        const e = err as { message?: string };
        return e.message?.includes("Tables not available") ?? false;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — getReservationGroup
// ---------------------------------------------------------------------------
describe("getReservationGroup", () => {
  test("GETs /reservation-groups/:id and returns full group detail", async () => {
    const { getReservationGroup } = await import("./use-reservation-groups.js");

    const groupDetail = {
      success: true,
      data: {
        id: 77,
        company_id: 2,
        outlet_id: 5,
        group_name: null,
        total_guest_count: 14,
        created_at: "2026-03-20T09:00:00.000Z",
        updated_at: "2026-03-20T09:00:00.000Z",
        reservations: [
          {
            reservation_id: 201,
            table_id: 10,
            table_code: "A1",
            table_name: "Area 1",
            status: "CONFIRMED",
            reservation_at: "2026-03-20T19:00:00.000Z"
          },
          {
            reservation_id: 202,
            table_id: 11,
            table_code: "A2",
            table_name: "Area 2",
            status: "CONFIRMED",
            reservation_at: "2026-03-20T19:00:00.000Z"
          }
        ]
      }
    };

    const result = await withMockedFetch({ ok: true, status: 200, body: groupDetail }, () =>
      getReservationGroup(77, "tok")
    );

    assert.strictEqual(result.id, 77);
    assert.strictEqual(result.total_guest_count, 14);
    assert.strictEqual(result.reservations.length, 2);
  });

  test("throws ApiError on 404", async () => {
    const { getReservationGroup } = await import("./use-reservation-groups.js");

    await assert.rejects(
      () =>
        withMockedFetch(
          { ok: false, status: 404, body: { data: { code: "NOT_FOUND", message: "Group not found" } } },
          () => getReservationGroup(9999, "tok")
        ),
      (err: unknown) => {
        const e = err as { message?: string };
        return e.message?.includes("Group not found") ?? false;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — cancelReservationGroup
// ---------------------------------------------------------------------------
describe("cancelReservationGroup", () => {
  test("DELETEs /reservation-groups/:id and returns deleted=true with ungrouped count", async () => {
    const { cancelReservationGroup } = await import("./use-reservation-groups.js");

    const result = await withMockedFetch(
      {
        ok: true,
        status: 200,
        body: { success: true, data: { deleted: true, ungrouped_count: 4 } }
      },
      () => cancelReservationGroup(77, "tok")
    );

    assert.strictEqual(result.deleted, true);
    assert.strictEqual(result.ungrouped_count, 4);
  });

  test("throws CONFLICT when reservations have already started", async () => {
    const { cancelReservationGroup } = await import("./use-reservation-groups.js");

    await assert.rejects(
      () =>
        withMockedFetch(
          {
            ok: false,
            status: 409,
            body: { data: { code: "CONFLICT", message: "Cannot cancel group with reservations that have already started" } }
          },
          () => cancelReservationGroup(77, "tok")
        ),
      (err: unknown) => {
        const e = err as { message?: string };
        return e.message?.includes("already started") ?? false;
      }
    );
  });

  test("throws CONFLICT when reservations not in BOOKED/CONFIRMED status", async () => {
    const { cancelReservationGroup } = await import("./use-reservation-groups.js");

    await assert.rejects(
      () =>
        withMockedFetch(
          {
            ok: false,
            status: 409,
            body: {
              data: {
                code: "CONFLICT",
                message: "All reservations in group must be in BOOKED or CONFIRMED status to cancel"
              }
            }
          },
          () => cancelReservationGroup(77, "tok")
        ),
      (err: unknown) => {
        const e = err as { message?: string };
        return e.message?.includes("BOOKED or CONFIRMED") ?? false;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — createReservationGroup error paths (TX conflict simulation)
// ---------------------------------------------------------------------------
describe("createReservationGroup error paths", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("throws when tables are not available (409 from in-TX conflict check)", async () => {
    const { createReservationGroup } = await import("./use-reservation-groups.js");

    await assert.rejects(
      () =>
        withMockedFetch(
          {
            ok: false,
            status: 409,
            body: { data: { code: "CONFLICT", message: "Tables not available: A1, A2" } }
          },
          () =>
            createReservationGroup(
              {
                outlet_id: 1,
                customer_name: "Large Party",
                guest_count: 8,
                table_ids: [1, 2],
                reservation_at: "2026-03-20T19:00:00+07:00"
              },
              "tok"
            )
        ),
      (err: unknown) => {
        const e = err as { message?: string };
        return e.message?.includes("Tables not available") ?? false;
      }
    );
  });

  test("throws when one or more tables are not available (repo lock failure)", async () => {
    const { createReservationGroup } = await import("./use-reservation-groups.js");

    await assert.rejects(
      () =>
        withMockedFetch(
          {
            ok: false,
            status: 409,
            body: { data: { code: "CONFLICT", message: "One or more tables are not available" } }
          },
          () =>
            createReservationGroup(
              {
                outlet_id: 1,
                customer_name: "Large Party",
                guest_count: 8,
                table_ids: [1, 2],
                reservation_at: "2026-03-20T19:00:00+07:00"
              },
              "tok"
            )
        ),
      (err: unknown) => {
        const e = err as { message?: string };
        return e.message?.includes("not available") ?? false;
      }
    );
  });

  test("throws when insufficient capacity (400)", async () => {
    const { createReservationGroup } = await import("./use-reservation-groups.js");

    await assert.rejects(
      () =>
        withMockedFetch(
          {
            ok: false,
            status: 400,
            body: { data: { code: "INVALID_REQUEST", message: "Insufficient capacity: 4 seats for 10 guests" } }
          },
          () =>
            createReservationGroup(
              {
                outlet_id: 1,
                customer_name: "Too Many",
                guest_count: 10,
                table_ids: [1],
                reservation_at: "2026-03-20T19:00:00+07:00"
              },
              "tok"
            )
        ),
      (err: unknown) => {
        const e = err as { message?: string };
        return e.message?.includes("Insufficient capacity") ?? false;
      }
    );
  });

  test("cancelReservationGroup calls DELETE with correct group id in path", async () => {
    const { cancelReservationGroup } = await import("./use-reservation-groups.js");

    let receivedPath = "";
    globalThis.fetch = (async (path: RequestInfo | URL) => {
      receivedPath = path.toString();
      return {
        ok: true,
        status: 200,
        async json() {
          return { success: true, data: { deleted: true, ungrouped_count: 2 } };
        }
      } as unknown as Response;
    }) as typeof globalThis.fetch;

    const result = await cancelReservationGroup(99, "tok");

    assert.strictEqual(receivedPath, "/api/reservation-groups/99");
    assert.strictEqual(result.deleted, true);
    assert.strictEqual(result.ungrouped_count, 2);
  });
});
