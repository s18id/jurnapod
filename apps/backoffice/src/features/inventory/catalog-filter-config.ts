// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { FilterSchema, FilterValue, SelectOption } from "@/components/ui/FilterBar/types";
import { DEBOUNCE_MS } from "@/components/ui/FilterBar/types";

export const CATALOG_FILTER_DEBOUNCE_MS = DEBOUNCE_MS;

export type CatalogPriceViewMode = "defaults" | "outlet";

export interface CatalogFilterMobileBehavior {
  breakpoint: "48em";
  collapsedFieldKeys: string[];
  primaryFieldKey: "search";
  advancedToggleLabel: string;
}

export const catalogFilterMobileBehavior: CatalogFilterMobileBehavior = {
  breakpoint: "48em",
  collapsedFieldKeys: ["type", "group", "status", "scope", "outlet_id"],
  primaryFieldKey: "search",
  advancedToggleLabel: "Advanced filters",
};

export const itemTypeFilterOptions: SelectOption[] = [
  { value: "SERVICE", label: "Service" },
  { value: "PRODUCT", label: "Product" },
  { value: "INGREDIENT", label: "Ingredient" },
  { value: "RECIPE", label: "Recipe" },
];

export const activeStatusFilterOptions: SelectOption[] = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

export const priceScopeFilterOptions: SelectOption[] = [
  { value: "override", label: "Outlet Override" },
  { value: "default", label: "Default" },
];

export function createCatalogItemFilterSchema(groupOptions: SelectOption[] = []): FilterSchema {
  return {
    fields: [
      {
        key: "search",
        type: "text",
        label: "Search",
        placeholder: "Search SKU or item name...",
        validationPattern: "^[\\w\\s._#/-]*$",
      },
      { key: "type", type: "select", label: "Type", options: itemTypeFilterOptions },
      ...(groupOptions.length > 0 ? [{ key: "group", type: "select" as const, label: "Group", options: groupOptions }] : []),
      { key: "status", type: "select", label: "Status", options: activeStatusFilterOptions },
    ],
    defaultValues: {
      search: "",
      status: "true",
    },
  };
}

export function createCatalogPriceFilterSchema(
  viewMode: CatalogPriceViewMode,
  outletOptions: SelectOption[] = []
): FilterSchema {
  return {
    fields: [
      {
        key: "search",
        type: "text",
        label: "Search",
        placeholder: "Search SKU or item name...",
        validationPattern: "^[\\w\\s._#/-]*$",
      },
      ...(viewMode === "outlet" ? [{ key: "scope", type: "select" as const, label: "Scope", options: priceScopeFilterOptions }] : []),
      ...(outletOptions.length > 0 ? [{ key: "outlet_id", type: "select" as const, label: "Outlet", options: outletOptions }] : []),
      { key: "status", type: "select", label: "Status", options: activeStatusFilterOptions },
    ],
    defaultValues: {
      search: "",
    },
  };
}

export function toCatalogQueryParams(filters: Record<string, FilterValue>): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params[key] = value.join(",");
      continue;
    }
    if (typeof value === "object") continue;
    params[key] = value;
  }

  return params;
}

export const catalogItemFilterSchema = createCatalogItemFilterSchema();
export const catalogDefaultPriceFilterSchema = createCatalogPriceFilterSchema("defaults");
export const catalogOutletPriceFilterSchema = createCatalogPriceFilterSchema("outlet");
