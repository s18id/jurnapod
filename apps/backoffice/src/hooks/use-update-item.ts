// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Item } from "@/hooks/use-items";
import { apiRequest } from "@/lib/api-client";

import { itemDetailQueryKeys } from "./use-item-detail";
import type { ItemMutationInput } from "./use-create-item";
import { itemsQueryKeys } from "./use-items-query";

export type ItemUpdateInput = Partial<ItemMutationInput>;

type ItemMutationEnvelope = {
  success: true;
  data: Item;
};

export async function updateItem(input: { id: number; patch: ItemUpdateInput }): Promise<Item> {
  const response = await apiRequest<ItemMutationEnvelope>(`/inventory/items/${input.id}`, {
    method: "PATCH",
    body: JSON.stringify(input.patch),
  });
  return response.data;
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateItem,
    onSuccess: async (_item, variables) => {
      await queryClient.invalidateQueries({ queryKey: itemsQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: itemDetailQueryKeys.detail(variables.id) });
    },
  });
}
