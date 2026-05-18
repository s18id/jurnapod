// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useQuery } from "@tanstack/react-query";

import type { Item, ItemType } from "@/hooks/use-items";
import { apiRequest } from "@/lib/api-client";

export const ITEMS_DEFAULT_PAGE_SIZE = 25;

export type ItemsSortOrder = "asc" | "desc";

export interface ItemsQueryParams {
  page: number;
  limit: number;
  search?: string;
  type?: ItemType;
  status?: boolean;
  groupId?: number;
  sortBy?: string;
  sortOrder?: ItemsSortOrder;
}

export interface ItemsListResult {
  items: Item[];
  total: number;
  page: number;
  limit: number;
}

type ItemsEnvelope = {
  success?: boolean;
  data?: Item[] | ItemsListResult;
  items?: Item[];
  total?: number;
  page?: number;
  limit?: number;
};

function normalizeSearch(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildItemsSearchParams(params: ItemsQueryParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params.page));
  searchParams.set("limit", String(params.limit));

  const search = normalizeSearch(params.search);
  if (search) searchParams.set("search", search);
  if (params.type) searchParams.set("type", params.type);
  if (params.status !== undefined) {
    searchParams.set("status", String(params.status));
    searchParams.set("is_active", String(params.status));
  }
  if (params.groupId !== undefined) searchParams.set("group_id", String(params.groupId));
  if (params.sortBy) searchParams.set("sort_by", params.sortBy);
  if (params.sortOrder) searchParams.set("sort_order", params.sortOrder);

  return searchParams;
}

function compareNullableText(left: string | null | undefined, right: string | null | undefined): number {
  return (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" });
}

export function applyItemsClientFallback(items: Item[], params: ItemsQueryParams): Item[] {
  const search = normalizeSearch(params.search)?.toLowerCase();
  let result = [...items];

  if (search) {
    result = result.filter((item) => {
      const skuMatch = item.sku?.toLowerCase().includes(search) ?? false;
      const nameMatch = item.name.toLowerCase().includes(search);
      return skuMatch || nameMatch;
    });
  }

  if (params.type) {
    result = result.filter((item) => item.type === params.type);
  }

  if (params.status !== undefined) {
    result = result.filter((item) => item.is_active === params.status);
  }

  if (params.groupId !== undefined) {
    result = result.filter((item) => item.item_group_id === params.groupId);
  }

  if (params.sortBy) {
    const direction = params.sortOrder === "desc" ? -1 : 1;
    result.sort((left, right) => {
      switch (params.sortBy) {
        case "sku":
          return compareNullableText(left.sku, right.sku) * direction;
        case "name":
          return compareNullableText(left.name, right.name) * direction;
        case "type":
          return compareNullableText(left.type, right.type) * direction;
        case "is_active":
        case "status":
          return (Number(left.is_active) - Number(right.is_active)) * direction;
        case "updated_at":
          return compareNullableText(left.updated_at, right.updated_at) * direction;
        default:
          return 0;
      }
    });
  }

  return result;
}

function paginateItems(items: Item[], params: ItemsQueryParams): Item[] {
  const start = Math.max(0, (params.page - 1) * params.limit);
  return items.slice(start, start + params.limit);
}

export function normalizeItemsListResponse(payload: ItemsEnvelope, params: ItemsQueryParams): ItemsListResult {
  const raw = payload.data ?? payload;

  if (!Array.isArray(raw) && Array.isArray(raw.items)) {
    return {
      items: raw.items,
      total: raw.total ?? raw.items.length,
      page: raw.page ?? params.page,
      limit: raw.limit ?? params.limit,
    };
  }

  const fullList = Array.isArray(raw) ? raw : payload.items ?? [];
  const filtered = applyItemsClientFallback(fullList, params);

  return {
    items: paginateItems(filtered, params),
    total: filtered.length,
    page: params.page,
    limit: params.limit,
  };
}

export const itemsQueryKeys = {
  all: ["inventory", "items"] as const,
  list: (params: ItemsQueryParams) => ["inventory", "items", "list", params] as const,
} as const;

export async function fetchItemsQuery(params: ItemsQueryParams): Promise<ItemsListResult> {
  const query = buildItemsSearchParams(params).toString();
  const payload = await apiRequest<ItemsEnvelope>(`/inventory/items?${query}`);
  return normalizeItemsListResponse(payload, params);
}

export function useItemsQuery(params: ItemsQueryParams) {
  return useQuery({
    queryKey: itemsQueryKeys.list(params),
    queryFn: () => fetchItemsQuery(params),
    placeholderData: (previousData) => previousData,
  });
}
