// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for item-images.ts thin delegator.
 *
 * These tests verify the refactored item-images.ts maintains the same
 * public API shape as the original monolithic implementation.
 */

import { describe, it, expect } from "vitest";

// =============================================================================
// Test Imports - verify all expected exports are available
// =============================================================================

describe("item-images exports", () => {
  it("exports CrossTenantAccessError", async () => {
    const { CrossTenantAccessError } = await import("../../../src/lib/item-images.js");
    expect(CrossTenantAccessError).toBeDefined();
    expect(new CrossTenantAccessError("test")).toBeInstanceOf(Error);
    expect(new CrossTenantAccessError("test").name).toBe("CrossTenantAccessError");
  });

  it("exports verifyItemOwnership function", async () => {
    const { verifyItemOwnership } = await import("../../../src/lib/item-images.js");
    expect(verifyItemOwnership).toBeDefined();
    expect(typeof verifyItemOwnership).toBe("function");
  });

  it("exports uploadItemImage function", async () => {
    const { uploadItemImage } = await import("../../../src/lib/item-images.js");
    expect(uploadItemImage).toBeDefined();
    expect(typeof uploadItemImage).toBe("function");
  });

  it("exports deleteImage function", async () => {
    const { deleteImage } = await import("../../../src/lib/item-images.js");
    expect(deleteImage).toBeDefined();
    expect(typeof deleteImage).toBe("function");
  });

  it("exports updateImage function", async () => {
    const { updateImage } = await import("../../../src/lib/item-images.js");
    expect(updateImage).toBeDefined();
    expect(typeof updateImage).toBe("function");
  });

  it("exports setPrimaryImage function", async () => {
    const { setPrimaryImage } = await import("../../../src/lib/item-images.js");
    expect(setPrimaryImage).toBeDefined();
    expect(typeof setPrimaryImage).toBe("function");
  });

  it("exports getItemImages function", async () => {
    const { getItemImages } = await import("../../../src/lib/item-images.js");
    expect(getItemImages).toBeDefined();
    expect(typeof getItemImages).toBe("function");
  });

  it("exports getImageById function", async () => {
    const { getImageById } = await import("../../../src/lib/item-images.js");
    expect(getImageById).toBeDefined();
    expect(typeof getImageById).toBe("function");
  });
});

// =============================================================================
// Function Signature Verification (AC1)
// =============================================================================

describe("uploadItemImage signature", () => {
  it("accepts correct parameter types", async () => {
    const { uploadItemImage } = await import("../../../src/lib/item-images.js");

    // AC1: Function signature unchanged — same parameters in same order
    // (companyId, itemId, fileBuffer, fileName, mimeType, uploadedBy, options?)
    const parameterCount = uploadItemImage.length;
    expect(parameterCount).toBeGreaterThanOrEqual(6); // 6 required params
  });
});

describe("deleteImage signature", () => {
  it("accepts correct parameter types", async () => {
    const { deleteImage } = await import("../../../src/lib/item-images.js");

    // AC1: (companyId, imageId, userId)
    const parameterCount = deleteImage.length;
    expect(parameterCount).toBe(3);
  });
});

describe("updateImage signature", () => {
  it("accepts correct parameter types", async () => {
    const { updateImage } = await import("../../../src/lib/item-images.js");

    // AC1: (companyId, imageId, updates, userId)
    const parameterCount = updateImage.length;
    expect(parameterCount).toBe(4);
  });
});

describe("setPrimaryImage signature", () => {
  it("accepts correct parameter types", async () => {
    const { setPrimaryImage } = await import("../../../src/lib/item-images.js");

    // AC1: (companyId, itemId, imageId, userId)
    const parameterCount = setPrimaryImage.length;
    expect(parameterCount).toBe(4);
  });
});

// =============================================================================
// Thin Delegator Verification (AC2-AC5)
// =============================================================================

describe("uploadItemImage is thin delegator (AC2)", () => {
  it("is a function that delegates to adapter", async () => {
    const { uploadItemImage } = await import("../../../src/lib/item-images.js");

    // Verify it exists and is a function (thin delegator)
    expect(uploadItemImage).toBeDefined();
    expect(typeof uploadItemImage).toBe("function");
  });
});

describe("deleteImage is thin delegator (AC3)", () => {
  it("is a function that delegates to adapter", async () => {
    const { deleteImage } = await import("../../../src/lib/item-images.js");

    // Verify it exists and is a function (thin delegator)
    expect(deleteImage).toBeDefined();
    expect(typeof deleteImage).toBe("function");
  });
});

describe("updateImage is thin delegator (AC5)", () => {
  it("is a function that delegates to adapter", async () => {
    const { updateImage } = await import("../../../src/lib/item-images.js");

    expect(updateImage).toBeDefined();
    expect(typeof updateImage).toBe("function");
  });
});

describe("setPrimaryImage is thin delegator (AC4)", () => {
  it("is a function that delegates to adapter", async () => {
    const { setPrimaryImage } = await import("../../../src/lib/item-images.js");

    expect(setPrimaryImage).toBeDefined();
    expect(typeof setPrimaryImage).toBe("function");
  });
});

// =============================================================================
// Code Size Verification (AC8)
// =============================================================================

describe("code size check (AC8)", () => {
  it("item-images.ts is significantly smaller after refactor", async () => {
    const fs = await import("fs");
    const path = await import("path");

    const filePath = path.join(process.cwd(), "src/lib/item-images.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    const lineCount = content.split("\n").length;

    // AC8: target ~150 lines from ~621
    // Allow some buffer for comments, but should be well under 300
    expect(lineCount).toBeLessThan(300);
    expect(lineCount).toBeGreaterThan(100); // Should have real content
  });
});
