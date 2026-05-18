// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Button, Checkbox, Group, Select, Stack, TextInput } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

import type { ItemType } from "@/hooks/use-items";
import type { ItemMutationInput } from "@/hooks/use-create-item";
import { ApiError } from "@/lib/api-client";

export type ItemFormData = ItemMutationInput;

export interface ItemSelectOption {
  value: string;
  label: string;
}

export const itemTypeOptions: ItemSelectOption[] = [
  { value: "SERVICE", label: "Service" },
  { value: "PRODUCT", label: "Product" },
  { value: "INGREDIENT", label: "Ingredient" },
  { value: "RECIPE", label: "Recipe" },
];

export const defaultItemFormData: ItemFormData = {
  sku: null,
  name: "",
  type: "PRODUCT",
  item_group_id: null,
  cogs_account_id: null,
  inventory_asset_account_id: null,
  is_active: true,
};

export function validateItemFormData(data: ItemFormData): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.name.trim()) {
    errors.name = "Name is required";
  }

  if (!itemTypeOptions.some((option) => option.value === data.type)) {
    errors.type = "Type is required";
  }

  return errors;
}

export function mapItemFormApiError(error: unknown): Record<string, string> {
  if (error instanceof ApiError) {
    const message = error.message || "Item request failed";
    if (error.status === 409) return { sku: message || "SKU already exists" };
    if (error.status === 422 || error.status === 400) return { form: message };
    if (error.status === 403) return { form: "Permission denied" };
    return { form: message };
  }

  if (error instanceof Error) return { form: error.message };
  return { form: "Item request failed" };
}

export interface ItemFormProps {
  value: ItemFormData;
  errors: Record<string, string>;
  groupOptions: ItemSelectOption[];
  cogsAccountOptions: ItemSelectOption[];
  inventoryAccountOptions: ItemSelectOption[];
  cogsAccountsLoading?: boolean;
  inventoryAccountsLoading?: boolean;
  submitting?: boolean;
  submitLabel: string;
  onChange: (value: ItemFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ItemForm({
  value,
  errors,
  groupOptions,
  cogsAccountOptions,
  inventoryAccountOptions,
  cogsAccountsLoading = false,
  inventoryAccountsLoading = false,
  submitting = false,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ItemFormProps) {
  return (
    <Stack gap="md" data-testid="item-form">
      {errors.form && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} data-testid="item-form-error">
          {errors.form}
        </Alert>
      )}

      <TextInput
        label="SKU"
        placeholder="Optional SKU code"
        value={value.sku ?? ""}
        onChange={(event) => onChange({ ...value, sku: event.currentTarget.value || null })}
        error={errors.sku}
      />

      <TextInput
        label="Name"
        placeholder="Item name"
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.currentTarget.value })}
        error={errors.name}
        required
      />

      <Select
        label="Type"
        value={value.type}
        onChange={(nextValue) => onChange({ ...value, type: (nextValue as ItemType) || "PRODUCT" })}
        data={itemTypeOptions}
        error={errors.type}
        required
      />

      <Select
        label="Group"
        placeholder="Optional group"
        value={value.item_group_id ? String(value.item_group_id) : ""}
        onChange={(nextValue) => onChange({ ...value, item_group_id: nextValue ? Number(nextValue) : null })}
        data={groupOptions}
        clearable
      />

      <Select
        label="COGS Account"
        placeholder="Select expense account for COGS"
        value={value.cogs_account_id ? String(value.cogs_account_id) : ""}
        onChange={(nextValue) => onChange({ ...value, cogs_account_id: nextValue ? Number(nextValue) : null })}
        data={cogsAccountOptions}
        disabled={cogsAccountsLoading}
        description="Expense account for Cost of Goods Sold. Uses company default if not selected."
      />

      <Select
        label="Inventory Asset Account"
        placeholder="Select asset account for inventory"
        value={value.inventory_asset_account_id ? String(value.inventory_asset_account_id) : ""}
        onChange={(nextValue) => onChange({ ...value, inventory_asset_account_id: nextValue ? Number(nextValue) : null })}
        data={inventoryAccountOptions}
        disabled={inventoryAccountsLoading}
        description="Asset account for inventory tracking. Uses company default if not selected."
      />

      <Checkbox
        label="Active"
        checked={value.is_active}
        onChange={(event) => onChange({ ...value, is_active: event.currentTarget.checked })}
      />

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit} loading={submitting}>
          {submitLabel}
        </Button>
      </Group>
    </Stack>
  );
}
