import { describe, expect, it } from "vitest";

import {
  CATALOG_FILTER_DEBOUNCE_MS,
  catalogFilterMobileBehavior,
  createCatalogItemFilterSchema,
  createCatalogPriceFilterSchema,
  toCatalogQueryParams,
} from "@/features/inventory/catalog-filter-config";

describe("catalog filter config", () => {
  it("uses the shared 300ms FilterBar debounce interval", () => {
    expect(CATALOG_FILTER_DEBOUNCE_MS).toBe(300);
  });

  it("creates item filters for search, type, group, and status", () => {
    const schema = createCatalogItemFilterSchema([{ value: "1", label: "Food" }]);

    expect(schema.fields.map((field) => field.key)).toEqual(["search", "type", "group", "status"]);
    expect(schema.defaultValues?.status).toBe("true");
  });

  it("creates outlet price filters with scope and optional outlet selector", () => {
    const schema = createCatalogPriceFilterSchema("outlet", [{ value: "10", label: "Main" }]);

    expect(schema.fields.map((field) => field.key)).toEqual(["search", "scope", "outlet_id", "status"]);
  });

  it("creates default price filters without outlet-specific scope", () => {
    const schema = createCatalogPriceFilterSchema("defaults");

    expect(schema.fields.map((field) => field.key)).toEqual(["search", "status"]);
  });

  it("documents mobile collapsed filter behavior", () => {
    expect(catalogFilterMobileBehavior.breakpoint).toBe("48em");
    expect(catalogFilterMobileBehavior.primaryFieldKey).toBe("search");
    expect(catalogFilterMobileBehavior.collapsedFieldKeys).toContain("scope");
  });

  it("normalizes non-empty filter values to API query params", () => {
    expect(
      toCatalogQueryParams({
        search: "latte",
        status: "true",
        type: undefined,
        ignored: null,
      })
    ).toEqual({ search: "latte", status: "true" });
  });
});
