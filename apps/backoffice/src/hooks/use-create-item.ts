// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Item, ItemType } from "@/hooks/use-items";
import { apiRequest } from "@/lib/api-client";

import { itemsQueryKeys } from "./use-items-query";

export interface ItemMutationInput {
  sku: string | null;
  name: string;
  type: ItemType;
  item_group_id: number | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: boolean;
}

type ItemMutationEnvelope = {
  success: true;
  data: Item;
};

export async function createItem(input: ItemMutationInput): Promise<Item> {
  const response = await apiRequest<ItemMutationEnvelope>("/inventory/items", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsQueryKeys.all });
    },
  });
}
