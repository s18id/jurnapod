// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Badge, Button, Divider, Group, Stack, Text } from "@mantine/core";

import { DetailDrawer, fullDetailsLink, StatusBadge } from "@/components/data-grid";
import { useItemDetail } from "@/hooks/use-item-detail";
import type { Item } from "@/hooks/use-items";

export interface ItemDetailDrawerProps {
  item: Item | null;
  opened: boolean;
  groupName: string;
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onDeactivate: (item: Item) => void;
}

function formatOptional(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function optionalSchemaField(item: Item, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(item, key)) return undefined;
  const value = (item as unknown as Record<string, unknown>)[key];
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return undefined;
  return String(value);
}

function ItemDetailContent({ item, groupName }: { item: Item; groupName: string }) {
  const taxCategory = optionalSchemaField(item, "tax_category") ?? optionalSchemaField(item, "tax_category_name");
  const unitOfMeasure = optionalSchemaField(item, "unit_of_measure") ?? optionalSchemaField(item, "unit_of_measure_name");

  return (
    <Stack gap="md" data-testid="item-detail-drawer-content">
      <Group justify="space-between">
        <div>
          <Text fw={600}>{item.name}</Text>
          <Text size="xs" c="dimmed">
            {formatOptional(item.sku)}
          </Text>
        </div>
        <StatusBadge status={item.is_active ? "Active" : "Inactive"} colorMap={{ active: "green", inactive: "red" }} />
      </Group>
      <Divider />
      <Stack gap="xs">
        <Group justify="space-between"><Text size="sm" c="dimmed">SKU</Text><Text size="sm" fw={500}>{formatOptional(item.sku)}</Text></Group>
        <Group justify="space-between"><Text size="sm" c="dimmed">Name</Text><Text size="sm" fw={500}>{item.name}</Text></Group>
        <Group justify="space-between"><Text size="sm" c="dimmed">Type</Text><Badge variant="light">{item.type}</Badge></Group>
        <Group justify="space-between"><Text size="sm" c="dimmed">Status</Text><Text size="sm" fw={500}>{item.is_active ? "Active" : "Inactive"}</Text></Group>
        <Group justify="space-between"><Text size="sm" c="dimmed">Item Group</Text><Text size="sm" fw={500}>{groupName}</Text></Group>
        {taxCategory !== undefined && <Group justify="space-between"><Text size="sm" c="dimmed">Tax Category</Text><Text size="sm" fw={500}>{taxCategory}</Text></Group>}
        {unitOfMeasure !== undefined && <Group justify="space-between"><Text size="sm" c="dimmed">Unit of Measure</Text><Text size="sm" fw={500}>{unitOfMeasure}</Text></Group>}
      </Stack>
      {item.type === "PRODUCT" && (
        <Text size="sm" c="dimmed" data-testid="item-detail-pricing-summary">
          Pricing summary is read-only here. Use Manage Prices for full pricing changes.
        </Text>
      )}
      {item.type === "INGREDIENT" && (
        <Text size="sm" c="dimmed" data-testid="item-detail-stock-summary">
          Stock tracking is available through inventory and variant records.
        </Text>
      )}
      {item.type === "RECIPE" && (
        <Text size="sm" c="dimmed" data-testid="item-detail-recipe-summary">
          Recipe ingredients are available in the recipe composition manager.
        </Text>
      )}
    </Stack>
  );
}

export function ItemDetailDrawer({
  item,
  opened,
  groupName,
  canUpdate,
  canDelete,
  onClose,
  onEdit,
  onDeactivate,
}: ItemDetailDrawerProps) {
  const detailQuery = useItemDetail(opened && item ? item.id : null);
  const detailItem = detailQuery.data ?? item;

  return (
    <DetailDrawer
      opened={opened}
      onClose={onClose}
      title="Item Detail"
      size="lg"
      loading={detailQuery.isLoading}
      error={detailQuery.error instanceof Error ? detailQuery.error.message : null}
      data-testid="item-detail-drawer"
      actions={
        detailItem ? (
          <>
            {fullDetailsLink(`/items/${detailItem.id}`, "View Full Detail")}
            {canUpdate && <Button variant="light" onClick={() => onEdit(detailItem)}>Edit</Button>}
            {canDelete && detailItem.is_active && <Button color="orange" variant="light" onClick={() => onDeactivate(detailItem)}>Deactivate</Button>}
          </>
        ) : null
      }
    >
      {detailItem ? <ItemDetailContent item={detailItem} groupName={groupName} /> : null}
    </DetailDrawer>
  );
}
