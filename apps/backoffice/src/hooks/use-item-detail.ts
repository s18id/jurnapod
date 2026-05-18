// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useQuery } from "@tanstack/react-query";

import type { Item } from "@/hooks/use-items";
import { apiRequest } from "@/lib/api-client";

type ItemDetailEnvelope = {
  success: true;
  data: Item;
};

export const itemDetailQueryKeys = {
  detail: (id: number | null) => ["inventory", "items", "detail", id ?? "none"] as const,
} as const;

export async function fetchItemDetail(id: number): Promise<Item> {
  const response = await apiRequest<ItemDetailEnvelope>(`/inventory/items/${id}`);
  return response.data;
}

export function useItemDetail(id: number | null) {
  return useQuery({
    queryKey: itemDetailQueryKeys.detail(id),
    queryFn: () => fetchItemDetail(id as number),
    enabled: id !== null,
  });
}
