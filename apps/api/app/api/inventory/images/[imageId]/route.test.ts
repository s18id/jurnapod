// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";

/**
 * Extract imageId from request URL pathname
 * Mirrors the logic in route.ts
 */
function parseImageId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const imageIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(imageIdRaw);
}

/**
 * Old buggy implementation for comparison
 */
function parseImageIdBuggy(request: Request): string {
  const url = new URL(request.url);
  return url.pathname.split('/').slice(-2)[0];
}

test("Route param parsing", async () => {
  await test("parseImageId should extract correct imageId from various URL formats", async () => {
    // Standard case
    const req1 = new Request("http://localhost:3000/api/inventory/images/123");
    assert.strictEqual(parseImageId(req1), 123);

    // With query params
    const req2 = new Request("http://localhost:3000/api/inventory/images/456?foo=bar");
    assert.strictEqual(parseImageId(req2), 456);

    // Trailing slash
    const req3 = new Request("http://localhost:3000/api/inventory/images/789/");
    assert.strictEqual(parseImageId(req3), 789);

    // Different host
    const req4 = new Request("https://api.example.com/api/inventory/images/999");
    assert.strictEqual(parseImageId(req4), 999);
  });

  await test("parseImageId should throw ZodError for invalid/missing IDs", async () => {
    // Non-numeric ID
    const req1 = new Request("http://localhost:3000/api/inventory/images/abc");
    await assert.rejects(
      async () => parseImageId(req1),
      (error: unknown) => error instanceof ZodError,
      "Should throw ZodError for non-numeric ID"
    );

    // Missing ID (empty path)
    const req2 = new Request("http://localhost:3000/api/inventory/images/");
    await assert.rejects(
      async () => parseImageId(req2),
      (error: unknown) => error instanceof ZodError,
      "Should throw ZodError for missing ID"
    );

    // Zero ID
    const req3 = new Request("http://localhost:3000/api/inventory/images/0");
    await assert.rejects(
      async () => parseImageId(req3),
      (error: unknown) => error instanceof ZodError,
      "Should throw ZodError for zero ID"
    );

    // Negative ID
    const req4 = new Request("http://localhost:3000/api/inventory/images/-5");
    await assert.rejects(
      async () => parseImageId(req4),
      (error: unknown) => error instanceof ZodError,
      "Should throw ZodError for negative ID"
    );
  });

  await test("BUGGY implementation demonstrates the problem", async () => {
    // The buggy implementation returns "images" instead of the actual ID
    const req = new Request("http://localhost:3000/api/inventory/images/123");
    const buggyResult = parseImageIdBuggy(req);
    assert.strictEqual(buggyResult, "images", "Buggy implementation returns 'images' instead of ID");
    assert.notStrictEqual(buggyResult, "123", "Buggy implementation does NOT return the actual ID");
  });

  await test("FIXED implementation correctly extracts ID", async () => {
    const req = new Request("http://localhost:3000/api/inventory/images/123");
    const fixedResult = parseImageId(req);
    assert.strictEqual(fixedResult, 123, "Fixed implementation returns correct numeric ID");
  });
});
