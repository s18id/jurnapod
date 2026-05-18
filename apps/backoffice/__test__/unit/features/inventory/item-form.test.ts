import { describe, expect, it } from "vitest";

import { defaultItemFormData, mapItemFormApiError, validateItemFormData } from "@/features/items/item-form";
import { ApiError } from "@/lib/api-client";

describe("item form helpers", () => {
  it("requires an item name", () => {
    expect(validateItemFormData({ ...defaultItemFormData, name: "" })).toEqual({ name: "Name is required" });
  });

  it("accepts a valid PRODUCT item payload", () => {
    expect(validateItemFormData({ ...defaultItemFormData, sku: "PROD-001", name: "Product A", type: "PRODUCT" })).toEqual({});
  });

  it("maps duplicate SKU conflicts to the SKU field", () => {
    const errors = mapItemFormApiError(new ApiError(409, "CONFLICT", "SKU already exists"));

    expect(errors).toEqual({ sku: "SKU already exists" });
  });

  it("maps permission failures to a form-level error", () => {
    const errors = mapItemFormApiError(new ApiError(403, "FORBIDDEN", "Access denied"));

    expect(errors).toEqual({ form: "Permission denied" });
  });
});
