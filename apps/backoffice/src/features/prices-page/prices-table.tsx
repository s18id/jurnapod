// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Table, ScrollArea, Text, Badge, Group, Tooltip, Stack, Button, Menu , ThemeIcon } from "@mantine/core";
import { IconAlertTriangle, IconEdit, IconTrash } from "@tabler/icons-react";

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

export interface PricesTableProps {
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

export function PricesTable({
  prices,
  viewMode,
  getGroupName,
  onEdit,
  onSetOverride,
  onDelete,
}: PricesTableProps) {
  return (
    <ScrollArea>
      <Table highlightOnHover striped stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Item</Table.Th>
            <Table.Th>Group</Table.Th>
            {viewMode === "outlet" && <Table.Th>Scope</Table.Th>}
            <Table.Th>Price</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {prices.map((price) => {
            const differencePercent =
              price.defaultPrice && price.hasOverride
                ? calculatePriceDifference(price.defaultPrice, price.price)
                : 0;
            const isSignificantDifference = differencePercent > 20;

            return (
              <Table.Tr key={price.id}>
                <Table.Td>{price.id}</Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {price.item?.name ?? "Unknown Item"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {price.item?.sku ?? "No SKU"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{getGroupName(price.item?.item_group_id ?? null)}</Text>
                </Table.Td>
                {viewMode === "outlet" && (
                  <Table.Td>
                    {price.hasOverride ? (
                      <Group gap={4} align="center">
                        <Badge color="blue" size="sm">Override</Badge>
                        {isSignificantDifference && (
                          <Badge color="red" size="xs" variant="light">+{differencePercent.toFixed(0)}%</Badge>
                        )}
                      </Group>
                    ) : (
                      <Badge color="green" size="sm">Default</Badge>
                    )}
                  </Table.Td>
                )}
                <Table.Td>
                  {viewMode === "outlet" && price.hasOverride ? (
                    <Tooltip
                      label={`Default: ${formatCurrency(price.defaultPrice ?? 0)}, Override: ${formatCurrency(price.price)}`}
                      multiline
                    >
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
                    </Tooltip>
                  ) : viewMode === "outlet" ? (
                    <Tooltip label={`Using default company price: ${formatCurrency(price.price)}`}>
                      <Group gap={4} align="center">
                        <Badge color="green" size="sm">Using Default</Badge>
                        <Text fw={500}>{formatCurrency(price.price)}</Text>
                      </Group>
                    </Tooltip>
                  ) : (
                    <Group gap={4} align="center">
                      <Badge color="green" size="sm">Default</Badge>
                      <Text fw={500}>{formatCurrency(price.price)}</Text>
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge color={price.is_active ? "green" : "red"} variant="light">
                    {price.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Menu>
                    <Menu.Target>
                      <Button variant="light" size="xs">
                        Actions
                      </Button>
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
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}
