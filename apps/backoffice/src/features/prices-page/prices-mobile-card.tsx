// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Card, Stack, Group, Text, Badge, ThemeIcon, Menu, ActionIcon } from "@mantine/core";
import {
  IconEdit,
  IconTrash,
  IconDots,
  IconAlertTriangle,
} from "@tabler/icons-react";
import type { Item } from "../../hooks/use-items";

export interface PriceWithItem {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  price: number;
  is_active: boolean;
  updated_at: string;
  item?: Item;
  hasOverride?: boolean;
  effectivePrice?: number;
  defaultPrice?: number;
}

export interface PricesMobileCardProps {
  prices: PriceWithItem[];
  viewMode: "defaults" | "outlet";
  getGroupName: (groupId: number | null) => string;
  onEdit: (price: PriceWithItem) => void;
  onSetOverride: (itemId: number, defaultPrice: number) => void;
  onDelete: (price: PriceWithItem) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}

function calculatePriceDifference(defaultPrice: number, overridePrice: number): number {
  return Math.abs(((overridePrice - defaultPrice) / defaultPrice) * 100);
}

export function PricesMobileCard({
  prices,
  viewMode,
  getGroupName,
  onEdit,
  onSetOverride,
  onDelete,
}: PricesMobileCardProps) {
  return (
    <Stack gap="xs">
      {prices.map((price) => {
        const differencePercent =
          price.defaultPrice && price.hasOverride
            ? calculatePriceDifference(price.defaultPrice, price.price)
            : 0;
        const isSignificantDifference = differencePercent > 20;

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
                        {formatCurrency(price.defaultPrice ?? 0)}
                      </Text>
                      <Badge color="blue" size="xs">Override</Badge>
                    </Group>
                    <Group gap={4} align="center">
                      <Text fw={500} c={isSignificantDifference ? "red" : undefined}>
                        {formatCurrency(price.price)}
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
                    <Text>{formatCurrency(price.price)}</Text>
                  </Group>
                ) : (
                  <Group gap={4} align="center">
                    <Badge color="green" size="sm">Default</Badge>
                    <Text fw={500}>{formatCurrency(price.price)}</Text>
                  </Group>
                )}

                <Menu>
                  <Menu.Target>
                    <ActionIcon variant="subtle">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEdit(price)}>
                      Edit
                    </Menu.Item>
                    {viewMode === "outlet" && !price.hasOverride && (
                      <Menu.Item onClick={() => onSetOverride(price.item_id, price.price)}>
                        Set Override
                      </Menu.Item>
                    )}
                    <Menu.Item
                      leftSection={<IconTrash size={14} />}
                      color="red"
                      onClick={() => onDelete(price)}
                    >
                      Delete
                    </Menu.Item>
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
