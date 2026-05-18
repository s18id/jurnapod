// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Item } from "@/hooks/use-items";

export type PricingViewMode = "defaults" | "outlet" | "all_outlets";

export interface OutletSummary {
  id: number;
  name: string;
}

export interface ItemPrice {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  price: number;
  is_active: boolean;
  updated_at: string;
}

export interface PriceWithItem extends ItemPrice {
  item?: Item;
  hasOverride: boolean;
  effectivePrice: number;
  defaultPrice?: number;
  outletName?: string;
  outletOverrides?: OutletOverrideSummary[];
}

export interface OutletOverrideSummary {
  outletId: number;
  outletName?: string;
  priceId: number;
  price: number;
  isActive: boolean;
  updatedAt: string;
}

export interface PriceActionAvailability {
  canEdit: boolean;
  canSetOverride: boolean;
  canRemoveOverride: boolean;
  canDeleteDefault: boolean;
}

export function compareOutletOverrides(left: OutletOverrideSummary, right: OutletOverrideSummary): number {
  if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) return updatedComparison;
  return left.outletId - right.outletId;
}

export function getPrimaryOutletOverride(
  outletOverrides: readonly OutletOverrideSummary[] | undefined
): OutletOverrideSummary | undefined {
  if (!outletOverrides || outletOverrides.length === 0) return undefined;
  return [...outletOverrides].sort(compareOutletOverrides)[0];
}

export function formatIdrCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}

export function calculatePriceDifferencePercent(defaultPrice: number | undefined, overridePrice: number): number {
  if (defaultPrice === undefined || defaultPrice <= 0) return 0;
  return Math.abs(((overridePrice - defaultPrice) / defaultPrice) * 100);
}

export function getPriceActionAvailability(
  price: Pick<PriceWithItem, "hasOverride" | "outlet_id">,
  canUpdate: boolean,
  viewMode: PricingViewMode
): PriceActionAvailability {
  return {
    canEdit: canUpdate,
    canSetOverride: canUpdate && viewMode === "outlet" && !price.hasOverride,
    canRemoveOverride: canUpdate && viewMode === "outlet" && price.hasOverride && price.outlet_id !== null,
    canDeleteDefault: canUpdate && viewMode === "defaults" && price.outlet_id === null,
  };
}

export function mapDefaultPrices(
  companyDefaults: readonly ItemPrice[],
  itemMap: Map<number, Item>
): PriceWithItem[] {
  return companyDefaults.map((price) => ({
    ...price,
    item: itemMap.get(price.item_id),
    hasOverride: false,
    effectivePrice: price.price,
    defaultPrice: price.price,
  }));
}

export function resolveOutletPriceRows(input: {
  companyDefaults: readonly ItemPrice[];
  outletPrices: readonly ItemPrice[];
  itemMap: Map<number, Item>;
  selectedOutletName?: string;
}): PriceWithItem[] {
  const merged = new Map<number, PriceWithItem>();

  for (const defaultPrice of input.companyDefaults) {
    merged.set(defaultPrice.item_id, {
      ...defaultPrice,
      item: input.itemMap.get(defaultPrice.item_id),
      hasOverride: false,
      effectivePrice: defaultPrice.price,
      defaultPrice: defaultPrice.price,
    });
  }

  for (const overridePrice of input.outletPrices) {
    const defaultRow = merged.get(overridePrice.item_id);
    merged.set(overridePrice.item_id, {
      ...overridePrice,
      item: defaultRow?.item ?? input.itemMap.get(overridePrice.item_id),
      hasOverride: true,
      effectivePrice: overridePrice.price,
      defaultPrice: defaultRow?.defaultPrice,
      outletName: input.selectedOutletName,
    });
  }

  return Array.from(merged.values());
}

export function derivePriceBuckets(allPrices: readonly ItemPrice[]): {
  defaults: ItemPrice[];
  outletOverrides: ItemPrice[];
} {
  return {
    defaults: allPrices.filter((price) => price.outlet_id === null),
    outletOverrides: allPrices.filter((price) => price.outlet_id !== null),
  };
}

export function resolveAllOutletPriceRows(input: {
  companyDefaults: readonly ItemPrice[];
  outletPrices: readonly ItemPrice[];
  itemMap: Map<number, Item>;
  outlets: readonly OutletSummary[];
}): PriceWithItem[] {
  const outletNameById = new Map(input.outlets.map((outlet) => [outlet.id, outlet.name]));
  const merged = new Map<number, PriceWithItem>();

  for (const defaultPrice of input.companyDefaults) {
    merged.set(defaultPrice.item_id, {
      ...defaultPrice,
      item: input.itemMap.get(defaultPrice.item_id),
      hasOverride: false,
      effectivePrice: defaultPrice.price,
      defaultPrice: defaultPrice.price,
      outletOverrides: [],
    });
  }

  for (const overridePrice of input.outletPrices) {
    if (overridePrice.outlet_id === null) continue;
    const existing = merged.get(overridePrice.item_id);
    const row: PriceWithItem = existing ?? {
      ...overridePrice,
      outlet_id: null,
      item: input.itemMap.get(overridePrice.item_id),
      hasOverride: true,
      effectivePrice: overridePrice.price,
      defaultPrice: undefined,
      outletOverrides: [],
    };
    const overrides = row.outletOverrides ?? [];
    overrides.push({
      outletId: overridePrice.outlet_id,
      outletName: outletNameById.get(overridePrice.outlet_id),
      priceId: overridePrice.id,
      price: overridePrice.price,
      isActive: overridePrice.is_active,
      updatedAt: overridePrice.updated_at,
    });
    const sortedOverrides = overrides.sort(compareOutletOverrides);
    const primaryOverride = sortedOverrides[0];
    const hasDefaultPrice = row.defaultPrice !== undefined;
    merged.set(overridePrice.item_id, {
      ...row,
      id: hasDefaultPrice || !primaryOverride ? row.id : primaryOverride.priceId,
      outlet_id: null,
      price: hasDefaultPrice || !primaryOverride ? row.price : primaryOverride.price,
      is_active: hasDefaultPrice || !primaryOverride ? row.is_active : primaryOverride.isActive,
      updated_at: hasDefaultPrice || !primaryOverride ? row.updated_at : primaryOverride.updatedAt,
      hasOverride: true,
      effectivePrice: hasDefaultPrice || !primaryOverride ? row.effectivePrice : primaryOverride.price,
      outletOverrides: sortedOverrides,
    });
  }

  return Array.from(merged.values());
}

export function filterPriceRows(
  rows: readonly PriceWithItem[],
  filters: {
    search?: string;
    scope?: "override" | "default" | null;
    status?: boolean | null;
    viewMode: PricingViewMode;
  }
): PriceWithItem[] {
  const search = filters.search?.trim().toLowerCase();
  return rows.filter((price) => {
    if (search) {
      const nameMatch = price.item?.name.toLowerCase().includes(search) ?? false;
      const skuMatch = price.item?.sku?.toLowerCase().includes(search) ?? false;
      if (!nameMatch && !skuMatch) return false;
    }

    if ((filters.viewMode === "outlet" || filters.viewMode === "all_outlets") && filters.scope) {
      if (filters.scope === "override" && !price.hasOverride) return false;
      if (filters.scope === "default" && price.hasOverride) return false;
    }

    if (filters.status !== null && filters.status !== undefined && price.is_active !== filters.status) {
      return false;
    }

    return true;
  });
}

export function getPriceScopeLabel(price: Pick<PriceWithItem, "defaultPrice" | "hasOverride" | "outletName" | "outlet_id" | "outletOverrides">): string {
  if (price.hasOverride && price.outlet_id === null && (price.outletOverrides?.length ?? 0) > 0) {
    if (price.defaultPrice === undefined) return "Overrides Only";
    return "Default + Overrides";
  }
  if (!price.hasOverride || price.outlet_id === null) return "Default";
  return `Outlet: ${price.outletName ?? price.outlet_id}`;
}
