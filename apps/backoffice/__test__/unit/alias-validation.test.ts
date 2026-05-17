// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Alias validation test for Epic 65 Batch A.
// Verifies that the @/ alias resolves correctly in the vitest environment.

import { describe, test, expect } from "vitest";

describe("@/ alias validation", () => {
  test("@/ alias resolves to apps/backoffice/src for vitest", async () => {
    // Import a module using the @/ alias. This verifies the resolve.alias
    // in vitest.config.ts maps @ -> apps/backoffice/src correctly.
    const mod = await import("@/lib/api-base-url");
    expect(mod).toBeDefined();
    expect(typeof mod.getApiBaseUrl).toBe("function");
  });

  test("@/ alias resolves imports from lib/api-client", async () => {
    const mod = await import("@/lib/api-client");
    expect(mod).toBeDefined();
    expect(typeof mod.apiRequest).toBe("function");
    expect(typeof mod.apiStreamingRequest).toBe("function");
    expect(typeof mod.uploadWithProgress).toBe("function");
    expect(typeof mod.applyWithProgress).toBe("function");
  });

  test("@/ alias resolves imports from lib/session", async () => {
    const mod = await import("@/lib/session");
    expect(mod).toBeDefined();
  });
});
