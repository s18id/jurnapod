// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Badge, Box, Button, Group, Menu, Stack, Text, Tooltip } from "@mantine/core";
import { IconEdit, IconPinned, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { EntityTable, ScopeBadge, StatusBadge } from "@/components/data-grid";
import type { DataTableColumnDef, PaginationState, RowSelectionState, SortState } from "@/components/ui/DataTable";
import { catalogPriceTableConfig, createCatalogEntityTableDefaults } from "@/features/inventory/catalog-table-config";
import {
  calculatePriceDifferencePercent,
  formatIdrCurrency,
  getPriceActionAvailability,
  getPriceScopeLabel,
  getPrimaryOutletOverride,
  type OutletSummary,
  type PriceWithItem,
  type PricingViewMode,
} from "@/features/prices/price-resolution";

export interface PricesTableProps {
  prices: PriceWithItem[];
  viewMode: PricingViewMode;
  outletColumns?: OutletSummary[];
  hiddenOutletCount?: number;
  onShowMoreOutlets?: () => void;
  getGroupName: (groupId: number | null) => string;
  canUpdate: boolean;
  onEdit: (price: PriceWithItem) => void;
  onSetOverride: (itemId: number, defaultPrice: number) => void;
  onDelete: (price: PriceWithItem) => void;
}

function compareText(left: string | null | undefined, right: string | null | undefined): number {
  return (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" });
}

function sortPrices(rows: PriceWithItem[], sort: SortState | null, viewMode: PricingViewMode): PriceWithItem[] {
  if (!sort?.direction) return rows;
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    switch (sort.id) {
      case "item":
        return compareText(left.item?.name, right.item?.name) * direction;
      case "sku":
        return compareText(left.item?.sku, right.item?.sku) * direction;
      case "default_price":
        return ((left.defaultPrice ?? 0) - (right.defaultPrice ?? 0)) * direction;
      case "override_price":
        if (viewMode === "all_outlets") {
          const leftPrimary = getPrimaryOutletOverride(left.outletOverrides);
          const rightPrimary = getPrimaryOutletOverride(right.outletOverrides);
          if (leftPrimary && !rightPrimary) return -1 * direction;
          if (!leftPrimary && rightPrimary) return 1 * direction;
          if (leftPrimary && rightPrimary) {
            const updatedComparison = rightPrimary.updatedAt.localeCompare(leftPrimary.updatedAt);
            if (updatedComparison !== 0) return updatedComparison * direction;
          }
          return ((left.outletOverrides?.length ?? 0) - (right.outletOverrides?.length ?? 0)) * direction;
        }
        return ((left.hasOverride ? left.price : 0) - (right.hasOverride ? right.price : 0)) * direction;
      case "effective_price":
      case "price":
        return (left.effectivePrice - right.effectivePrice) * direction;
      case "status":
        return (Number(left.is_active) - Number(right.is_active)) * direction;
      case "updated_at":
        return compareText(left.updated_at, right.updated_at) * direction;
      default:
        return 0;
    }
  });
}

function paginatePrices(rows: PriceWithItem[], pagination: PaginationState): PriceWithItem[] {
  const start = Math.max(0, (pagination.page - 1) * pagination.pageSize);
  return rows.slice(start, start + pagination.pageSize);
}

function OverrideCell({ price }: { price: PriceWithItem }) {
  if (!price.hasOverride) {
    return <Text size="sm" c="dimmed">—</Text>;
  }

  const difference = calculatePriceDifferencePercent(price.defaultPrice, price.price);
  return (
    <Box
      p="xs"
      style={{
        borderRadius: 8,
        backgroundColor: "var(--mantine-color-blue-0)",
      }}
      data-testid={`price-override-cell-${price.item_id}`}
    >
      <Group gap={6} align="center">
        <IconPinned size={14} color="var(--mantine-color-blue-6)" />
        <Text size="sm" fw={700} c="blue.8">{formatIdrCurrency(price.price)}</Text>
        {difference > 0 && <Badge size="xs" color={difference > 20 ? "red" : "blue"} variant="light">{difference.toFixed(0)}%</Badge>}
      </Group>
    </Box>
  );
}

export function PricesTable({
  prices,
  viewMode,
  outletColumns = [],
  hiddenOutletCount = 0,
  onShowMoreOutlets,
  getGroupName,
  canUpdate,
  onEdit,
  onSetOverride,
  onDelete,
}: PricesTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 25 });
  const [sort, setSort] = useState<SortState | null>({ id: "item", direction: "asc" });
  const [selection, setSelection] = useState<RowSelectionState>({});

  const outletPriceColumns = useMemo<DataTableColumnDef<PriceWithItem>[]>(() => {
    if (viewMode !== "all_outlets") return [];
    const columnsForOutlets: DataTableColumnDef<PriceWithItem>[] = outletColumns.map((outlet) => ({
      id: `outlet_${outlet.id}`,
      header: outlet.name,
      cell: (info) => {
        const override = info.row.original.outletOverrides?.find((entry) => entry.outletId === outlet.id);
        if (!override) return <Text size="sm" c="dimmed">Default</Text>;
        return (
          <Box p="xs" style={{ borderRadius: 8, backgroundColor: "var(--mantine-color-blue-0)" }}>
            <Group gap={6} align="center">
              <IconPinned size={14} color="var(--mantine-color-blue-6)" />
              <Text size="sm" fw={700} c="blue.8">{formatIdrCurrency(override.price)}</Text>
            </Group>
          </Box>
        );
      },
    }));
    if (hiddenOutletCount > 0) {
      columnsForOutlets.push({
        id: "show_more_outlets",
        header: "More Outlets",
        isRowAction: true,
        hideable: false,
        cell: () => <Button variant="subtle" size="xs" onClick={onShowMoreOutlets}>Show {hiddenOutletCount} more</Button>,
      });
    }
    return columnsForOutlets;
  }, [hiddenOutletCount, onShowMoreOutlets, outletColumns, viewMode]);

  const columns = useMemo<DataTableColumnDef<PriceWithItem>[]>(() => [
    { id: "selection", header: "", cell: () => null, isSelection: true, hideable: false },
    {
      id: "item",
      header: "Item Name",
      sortable: true,
      filterable: true,
      cell: (info) => {
        const price = info.row.original;
        return (
          <Stack gap={2}>
            <Text size="sm" fw={600}>{price.item?.name ?? "Unknown Item"}</Text>
            <Text size="xs" c="dimmed">{getGroupName(price.item?.item_group_id ?? null)}</Text>
          </Stack>
        );
      },
    },
    { id: "sku", header: "SKU", sortable: true, filterable: true, cell: (info) => info.row.original.item?.sku ?? "No SKU" },
    {
      id: "default_price",
      header: "Default Price",
      sortable: true,
      cell: (info) => <Text size="sm" fw={400}>{info.row.original.defaultPrice === undefined ? "—" : formatIdrCurrency(info.row.original.defaultPrice)}</Text>,
    },
    {
      id: "override_price",
      header: viewMode === "all_outlets" ? "Outlet Overrides" : "Outlet Override Price",
      sortable: true,
      cell: (info) => viewMode === "all_outlets"
        ? <Badge color={info.row.original.hasOverride ? "blue" : "gray"} variant="light">{info.row.original.outletOverrides?.length ?? 0} overrides</Badge>
        : <OverrideCell price={info.row.original} />,
    },
    ...outletPriceColumns,
    {
      id: "effective_price",
      header: "Effective Price",
      sortable: true,
      cell: (info) => (
        <Tooltip label={info.row.original.hasOverride ? "Outlet override is effective" : "Default price is effective"}>
          <Text fw={700}>{formatIdrCurrency(info.row.original.effectivePrice)}</Text>
        </Tooltip>
      ),
    },
    {
      id: "scope",
      header: "Scope",
      filterable: true,
      cell: (info) => {
        const label = getPriceScopeLabel(info.row.original);
        return <ScopeBadge label={label} color={label === "Default" ? "green" : "blue"} />;
      },
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      filterable: true,
      cell: (info) => <StatusBadge status={info.row.original.is_active ? "Active" : "Inactive"} colorMap={{ active: "green", inactive: "red" }} />,
    },
    {
      id: "actions",
      header: "Actions",
      isRowAction: true,
      hideable: false,
      cell: (info) => {
        const price = info.row.original;
        const actions = getPriceActionAvailability(price, canUpdate, viewMode);
        if (!actions.canEdit && !actions.canSetOverride && !actions.canRemoveOverride && !actions.canDeleteDefault) {
          return <Text size="xs" c="dimmed">Read-only</Text>;
        }
        return (
          <Menu withinPortal>
            <Menu.Target><Button variant="light" size="xs" aria-label={`Price actions for ${price.item?.name ?? price.item_id}`}>Actions</Button></Menu.Target>
            <Menu.Dropdown>
              {actions.canEdit && <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEdit(price)}>Edit</Menu.Item>}
              {actions.canSetOverride && <Menu.Item leftSection={<IconPinned size={14} />} onClick={() => onSetOverride(price.item_id, price.effectivePrice)}>Set Override</Menu.Item>}
              {(actions.canRemoveOverride || actions.canDeleteDefault) && (
                <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => onDelete(price)}>
                  {actions.canRemoveOverride ? "Remove Override" : "Delete Default"}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        );
      },
    },
  ], [canUpdate, getGroupName, onDelete, onEdit, onSetOverride, outletPriceColumns, viewMode]);

  const sortedRows = useMemo(() => sortPrices(prices, sort, viewMode), [prices, sort, viewMode]);
  const pageRows = useMemo(() => paginatePrices(sortedRows, pagination), [pagination, sortedRows]);
  const tableDefaults = useMemo(() => createCatalogEntityTableDefaults({ ...catalogPriceTableConfig, columns }), [columns]);

  return (
    <EntityTable
      {...tableDefaults}
      data={pageRows}
      getRowId={(price) => String(price.id)}
      loading="idle"
      totalCount={sortedRows.length}
      pagination={pagination}
      sort={sort}
      selection={selection}
      onPaginationChange={setPagination}
      onSortChange={setSort}
      onSelectionChange={setSelection}
      emptyState="No prices found."
      isMobileViewport={false}
      data-testid="prices-entity-table"
    />
  );
}
