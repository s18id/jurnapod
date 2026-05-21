// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("journal void stale-service guard", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when the accounting service lacks the safe void resolver", async () => {
    const staleVoidMutation = vi.fn();
    vi.doMock("../../../src/lib/accounting-services.js", () => ({
      getJournalsService: () => ({
        voidPostedManualJournal: staleVoidMutation,
      }),
    }));

    const { handleVoidJournal } = await import("../../../src/lib/journal-handlers.js");

    const response = await handleVoidJournal(
      { companyId: 101, userId: 202 } as never,
      new Request("http://localhost/api/journals/303/void", { method: "POST" }),
      303,
      { reason: "Stale service regression" },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "SERVICE_VERSION_MISMATCH" },
    });
    expect(staleVoidMutation).not.toHaveBeenCalled();
  });
});
