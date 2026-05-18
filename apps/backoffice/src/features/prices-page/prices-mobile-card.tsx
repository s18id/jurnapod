// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Card, Stack, Group, Text, Badge, ThemeIcon, Menu, ActionIcon } from "@mantine/core";
import {
  IconEdit,
  IconPinned,
  IconTrash,
  IconDots,
  IconAlertTriangle,
} from "@tabler/icons-react";

import {
  calculatePriceDifferencePercent,
  formatIdrCurrency,
  getPriceActionAvailability,
  type PriceWithItem,
  type PricingViewMode,
} from "@/features/prices/price-resolution";

export interface PricesMobileCardProps {
  prices: PriceWithItem[];
  viewMode: PricingViewMode;
  getGroupName: (groupId: number | null) => string;
  canUpdate: boolean;
  onEdit: (price: PriceWithItem) => void;
  onSetOverride: (itemId: number, defaultPrice: number) => void;
  onDelete: (price: PriceWithItem) => void;
}

export function PricesMobileCard({
  prices,
  viewMode,
  getGroupName,
  canUpdate,
  onEdit,
  onSetOverride,
  onDelete,
}: PricesMobileCardProps) {
  return (
    <Stack gap="xs">
      {prices.map((price) => {
        const differencePercent = calculatePriceDifferencePercent(price.defaultPrice, price.price);
        const isSignificantDifference = differencePercent > 20;
        const actions = getPriceActionAvailability(price, canUpdate, viewMode);

        return (
          <Card key={price.id} withBorder>
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text size="sm" fw={600}>
                    {price.item?.name ?? "Unknown Item"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {price.item?.sku ?? "No SKU"}
                  </Text>
                </div>
                <Badge color={price.is_active ? "green" : "red"} variant="light">
                  {price.is_active ? "Active" : "Inactive"}
                </Badge>
              </Group>

              <Group justify="space-between" align="center">
                <Text size="xs" c="dimmed">
                  {getGroupName(price.item?.item_group_id ?? null)}
                </Text>
                <Badge variant="light">{price.item?.type}</Badge>
              </Group>

              <Group justify="space-between" align="center">
                {viewMode === "outlet" && price.hasOverride ? (
                  <Stack gap={2}>
                    <Group gap={4} align="center">
                      <Text size="xs" c="dimmed" td="line-through">
                        {price.defaultPrice === undefined ? "No default" : formatIdrCurrency(price.defaultPrice)}
                      </Text>
                      <Badge color="blue" size="xs">Override</Badge>
                    </Group>
                    <Group gap={4} align="center">
                      <IconPinned size={14} color="var(--mantine-color-blue-6)" />
                      <Text fw={500} c={isSignificantDifference ? "red" : undefined}>
                        {formatIdrCurrency(price.price)}
                      </Text>
                      {isSignificantDifference && (
                        <ThemeIcon color="red" size="sm" variant="light" title={`Price differs by ${differencePercent.toFixed(1)}% from default`}>
                          <IconAlertTriangle size={12} />
                        </ThemeIcon>
                      )}
                    </Group>
                  </Stack>
                ) : viewMode === "outlet" ? (
                  <Group gap={4} align="center">
                    <Badge color="green" size="sm">Using Default</Badge>
                    <Text>{formatIdrCurrency(price.effectivePrice)}</Text>
                  </Group>
                ) : viewMode === "all_outlets" ? (
                  <Group gap={4} align="center">
                    <Badge color={price.hasOverride ? "blue" : "gray"} size="sm" variant="light">
                      {price.outletOverrides?.length ?? 0} overrides
                    </Badge>
                    <Text fw={600}>Effective: {formatIdrCurrency(price.effectivePrice)}</Text>
                  </Group>
                ) : (
                  <Group gap={4} align="center">
                    <Badge color="green" size="sm">Default</Badge>
                    <Text fw={500}>{formatIdrCurrency(price.effectivePrice)}</Text>
                  </Group>
                )}

                <Menu>
                  <Menu.Target>
                    <ActionIcon variant="subtle" aria-label={`Price actions for ${price.item?.name ?? price.item_id}`}>
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {actions.canEdit && <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEdit(price)}>
                      Edit
                    </Menu.Item>}
                    {actions.canSetOverride && (
                      <Menu.Item leftSection={<IconPinned size={14} />} onClick={() => onSetOverride(price.item_id, price.effectivePrice)}>
                        Set Override
                      </Menu.Item>
                    )}
                    {(actions.canRemoveOverride || actions.canDeleteDefault) && <Menu.Item
                      leftSection={<IconTrash size={14} />}
                      color="red"
                      onClick={() => onDelete(price)}
                    >
                      {actions.canRemoveOverride ? "Remove Override" : "Delete Default"}
                    </Menu.Item>}
                    {!actions.canEdit && !actions.canSetOverride && !actions.canRemoveOverride && !actions.canDeleteDefault && (
                      <Menu.Item disabled>Read-only</Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
