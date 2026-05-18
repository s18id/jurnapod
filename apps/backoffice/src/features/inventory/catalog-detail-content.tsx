// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Divider, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

import { ScopeBadge, StatusBadge } from "@/components/data-grid";

import type { CatalogItemRow, CatalogPriceRow } from "./catalog-table-config";

export interface CatalogDetailField {
  label: string;
  value: ReactNode;
}

export interface CatalogItemDetailContext {
  groupName?: string;
}

export interface CatalogPriceDetailContext {
  outletName?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatOptional(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function getCatalogPriceScopeLabel(
  price: CatalogPriceRow,
  context: CatalogPriceDetailContext = {}
): string {
  if (price.outlet_id === null) return "Default";
  return `Outlet: ${context.outletName ?? price.outletName ?? price.outlet_id}`;
}

export function getCatalogItemDetailFields(
  item: CatalogItemRow,
  context: CatalogItemDetailContext = {}
): CatalogDetailField[] {
  return [
    { label: "SKU", value: formatOptional(item.sku) },
    { label: "Name", value: item.name },
    { label: "Type", value: item.type },
    { label: "Status", value: item.is_active ? "Active" : "Inactive" },
    { label: "Group", value: context.groupName ?? item.groupName ?? "-" },
    { label: "Updated At", value: formatOptional(item.updated_at) },
  ];
}

export function getCatalogPriceDetailFields(
  price: CatalogPriceRow,
  context: CatalogPriceDetailContext = {}
): CatalogDetailField[] {
  return [
    { label: "Item", value: price.item?.name ?? "Unknown Item" },
    { label: "SKU", value: price.item?.sku ?? "No SKU" },
    { label: "Scope", value: getCatalogPriceScopeLabel(price, context) },
    { label: "Price", value: formatCurrency(price.price) },
    { label: "Default Price", value: price.defaultPrice === undefined ? "-" : formatCurrency(price.defaultPrice) },
    { label: "Status", value: price.is_active ? "Active" : "Inactive" },
    { label: "Updated At", value: formatOptional(price.updated_at) },
  ];
}

function CatalogDetailFields({ fields }: { fields: CatalogDetailField[] }) {
  return (
    <Stack gap="xs" data-testid="catalog-detail-fields">
      {fields.map((field) => (
        <Group key={field.label} justify="space-between" align="flex-start" gap="md">
          <Text size="sm" c="dimmed">
            {field.label}
          </Text>
          <Text size="sm" fw={500} ta="right">
            {field.value}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

export function CatalogItemDetailContent({
  item,
  context,
}: {
  item: CatalogItemRow;
  context?: CatalogItemDetailContext;
}) {
  return (
    <Stack gap="md" data-testid="catalog-item-detail-content">
      <Group justify="space-between">
        <Text fw={600}>{item.name}</Text>
        <StatusBadge status={item.is_active ? "Active" : "Inactive"} colorMap={{ active: "green", inactive: "red" }} />
      </Group>
      <Divider />
      <CatalogDetailFields fields={getCatalogItemDetailFields(item, context)} />
    </Stack>
  );
}

export function CatalogPriceDetailContent({
  price,
  context,
}: {
  price: CatalogPriceRow;
  context?: CatalogPriceDetailContext;
}) {
  const scopeLabel = getCatalogPriceScopeLabel(price, context);
  return (
    <Stack gap="md" data-testid="catalog-price-detail-content">
      <Group justify="space-between">
        <Text fw={600}>{price.item?.name ?? "Unknown Item"}</Text>
        <ScopeBadge label={scopeLabel} color={scopeLabel === "Default" ? "green" : "blue"} />
      </Group>
      <Divider />
      <CatalogDetailFields fields={getCatalogPriceDetailFields(price, context)} />
    </Stack>
  );
}
