// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ActionIcon, Alert, Badge, Button, Card, Group, Menu, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle, IconBarcode, IconBan, IconDots, IconEdit, IconPackage, IconTools } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";

import { EntityTable } from "@/components/data-grid";
import type { DataTableColumnDef, PaginationState, RowSelectionState, SortState } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar/FilterBar";
import type { FilterValue } from "@/components/ui/FilterBar/types";
import { catalogFilterMobileBehavior, createCatalogItemFilterSchema } from "@/features/inventory/catalog-filter-config";
import { catalogItemTableConfig, createCatalogEntityTableDefaults, type CatalogItemRow } from "@/features/inventory/catalog-table-config";
import { useItemVariantStats } from "@/hooks/use-item-variant-stats";
import type { Item, ItemType } from "@/hooks/use-items";
import { ITEMS_DEFAULT_PAGE_SIZE, type ItemsQueryParams, useItemsQuery } from "@/hooks/use-items-query";
import type { ItemGroup } from "@/hooks/use-item-groups";
import type { SessionUser } from "@/lib/session";

import { ItemDetailDrawer } from "./item-detail-drawer";

export interface ItemListState {
  filters: {
    search?: string;
    type?: string;
    groupId: number | null;
    status: boolean | null;
  };
  totalCount: number;
}

export interface ItemListPermissions {
  canUpdate: boolean;
  canDelete: boolean;
}

export interface ItemListProps {
  user: SessionUser;
  itemGroups: ItemGroup[];
  groupMap: Map<number, ItemGroup>;
  permissions: ItemListPermissions;
  refreshToken?: number;
  onListStateChange?: (state: ItemListState) => void;
  onEdit: (item: Item) => void;
  onDeactivate: (item: Item) => void;
  onManageRecipe: (item: Item) => void;
  onManageVariants: (item: Item) => void;
  onManageBarcodeImages: (item: Item) => void;
}

export interface ItemActionAvailability {
  canEdit: boolean;
  canManageRecipe: boolean;
  canManageVariants: boolean;
  canManageBarcodeImages: boolean;
  canDeactivate: boolean;
}

export function getItemActionAvailability(
  item: Pick<Item, "type" | "is_active">,
  permissions: ItemListPermissions
): ItemActionAvailability {
  return {
    canEdit: permissions.canUpdate,
    canManageRecipe: permissions.canUpdate && item.type === "RECIPE",
    canManageVariants: permissions.canUpdate,
    canManageBarcodeImages: permissions.canUpdate,
    canDeactivate: permissions.canDelete && item.is_active,
  };
}

function stopMenuPropagation(event: MouseEvent): void {
  event.stopPropagation();
}

function isItemType(value: string | undefined): value is ItemType {
  return value === "SERVICE" || value === "PRODUCT" || value === "INGREDIENT" || value === "RECIPE";
}

function getGroupName(groupMap: Map<number, ItemGroup>, groupId: number | null): string {
  if (!groupId) return "-";
  return groupMap.get(groupId)?.name ?? "-";
}

function getStatusFilter(value: FilterValue): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function mapItemsToCatalogRows(
  items: Item[],
  groupMap: Map<number, ItemGroup>,
  variantStats: Map<number, { total_stock: number; variant_count: number; has_variants: boolean }>
): CatalogItemRow[] {
  return items.map((item) => {
    const stats = variantStats.get(item.id);
    return {
      ...item,
      groupName: getGroupName(groupMap, item.item_group_id),
      totalStock: stats?.has_variants ? stats.total_stock : undefined,
      variantCount: stats?.has_variants ? stats.variant_count : undefined,
    };
  });
}

export function ItemList({
  user,
  itemGroups,
  groupMap,
  permissions,
  refreshToken,
  onListStateChange,
  onEdit,
  onDeactivate,
  onManageRecipe,
  onManageVariants,
  onManageBarcodeImages,
}: ItemListProps) {
  const isMobile = useMediaQuery(`(max-width: ${catalogFilterMobileBehavior.breakpoint})`);
  const [filters, setFilters] = useState<Record<string, FilterValue>>({ search: "", status: "true" });
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: ITEMS_DEFAULT_PAGE_SIZE });
  const [sort, setSort] = useState<SortState | null>({ id: "name", direction: "asc" });
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const groupOptions = useMemo(
    () => itemGroups.map((group) => ({ value: String(group.id), label: group.name })),
    [itemGroups]
  );
  const filterSchema = useMemo(() => createCatalogItemFilterSchema(groupOptions), [groupOptions]);
  const status = getStatusFilter(filters.status);
  const type = isItemType(filters.type as string | undefined) ? (filters.type as ItemType) : undefined;
  const groupId = filters.group ? Number(filters.group) : undefined;

  const queryParams: ItemsQueryParams = useMemo(() => ({
    page: pagination.page,
    limit: pagination.pageSize,
    search: typeof filters.search === "string" ? filters.search : undefined,
    type,
    status,
    groupId,
    sortBy: sort?.id === "status" ? "is_active" : sort?.id,
    sortOrder: sort?.direction ?? undefined,
  }), [filters.search, filters.group, groupId, pagination.page, pagination.pageSize, sort?.direction, sort?.id, status, type]);

  const itemsQuery = useItemsQuery(queryParams);
  const items = itemsQuery.data?.items ?? [];
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const { stats: variantStats } = useItemVariantStats({ user, itemIds });
  const rows = useMemo(() => mapItemsToCatalogRows(items, groupMap, variantStats), [groupMap, items, variantStats]);
  const totalCount = itemsQuery.data?.total ?? 0;

  useEffect(() => {
    if (refreshToken === undefined) return;
    void itemsQuery.refetch();
  }, [refreshToken]);

  useEffect(() => {
    onListStateChange?.({
      filters: {
        search: typeof filters.search === "string" && filters.search.trim() ? filters.search.trim() : undefined,
        type: typeof filters.type === "string" ? filters.type : undefined,
        groupId: groupId ?? null,
        status: status ?? null,
      },
      totalCount,
    });
  }, [filters.search, filters.type, groupId, onListStateChange, status, totalCount]);

  const handleFilterChange = useCallback((nextFilters: Record<string, FilterValue>) => {
    setFilters(nextFilters);
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const actionColumn = useMemo<DataTableColumnDef<CatalogItemRow>>(() => ({
    id: "actions",
    header: "Actions",
    isRowAction: true,
    hideable: false,
    cell: (info) => {
      const item = info.row.original;
      const actions = getItemActionAvailability(item, permissions);
      return (
        <Menu withinPortal>
          <Menu.Target>
            <Button variant="light" size="xs" data-testid={`item-actions-${item.id}`}>Actions</Button>
          </Menu.Target>
          <Menu.Dropdown>
            {actions.canEdit && (
              <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEdit(item)}>Edit</Menu.Item>
            )}
            {actions.canManageRecipe && (
              <Menu.Item leftSection={<IconTools size={14} />} onClick={() => onManageRecipe(item)}>Manage Recipe</Menu.Item>
            )}
            {actions.canManageVariants && (
              <Menu.Item leftSection={<IconPackage size={14} />} onClick={() => onManageVariants(item)}>Manage Variants</Menu.Item>
            )}
            {actions.canManageBarcodeImages && (
              <Menu.Item leftSection={<IconBarcode size={14} />} onClick={() => onManageBarcodeImages(item)}>Manage Barcode & Images</Menu.Item>
            )}
            {actions.canDeactivate && (
              <Menu.Item leftSection={<IconBan size={14} />} color="orange" onClick={() => onDeactivate(item)}>Deactivate</Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      );
    },
  }), [onDeactivate, onEdit, onManageBarcodeImages, onManageRecipe, onManageVariants, permissions]);

  const columns = useMemo<DataTableColumnDef<CatalogItemRow>[]>(() => {
    return catalogItemTableConfig.columns
      .filter((column) => column.id !== "selection")
      .map((column) => {
        if (column.id !== "name") return column;
        return {
          ...column,
          cell: (info) => (
            <Button variant="subtle" size="compact-sm" onClick={() => setSelectedItem(info.row.original)}>
              {info.row.original.name}
            </Button>
          ),
        } satisfies DataTableColumnDef<CatalogItemRow>;
      })
      .concat(actionColumn);
  }, [actionColumn]);

  const tableDefaults = useMemo(() => createCatalogEntityTableDefaults({ ...catalogItemTableConfig, columns }), [columns]);
  const selectedGroupName = selectedItem ? getGroupName(groupMap, selectedItem.item_group_id) : "-";

  return (
    <Stack gap="md" data-testid="item-list">
      <Card data-mobile-collapsed-filters={isMobile ? "true" : "false"}>
        <FilterBar
          schema={filterSchema}
          onFilterChange={handleFilterChange}
          resultCount={totalCount}
          isLoading={itemsQuery.isLoading || itemsQuery.isFetching}
          manageUrlState={false}
          data-testid="items-filter-bar"
        />
      </Card>

      {itemsQuery.error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} data-testid="items-list-error">
          {itemsQuery.error instanceof Error ? itemsQuery.error.message : "Failed to load items"}
        </Alert>
      )}

      {isMobile ? (
        <Stack gap="xs" data-testid="items-mobile-cards">
          {rows.length === 0 ? (
            <Card withBorder><Text c="dimmed" ta="center">No items found.</Text></Card>
          ) : rows.map((item) => {
            const actions = getItemActionAvailability(item, permissions);
            return (
              <Card key={item.id} withBorder onClick={() => setSelectedItem(item)} data-testid={`item-card-${item.id}`}>
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="sm" fw={600}>{item.name}</Text>
                    <Text size="xs" c="dimmed">{item.sku ?? "No SKU"}</Text>
                  </div>
                  <Badge color={item.is_active ? "green" : "red"} variant="light">{item.is_active ? "Active" : "Inactive"}</Badge>
                </Group>
                <Group justify="space-between" mt="xs">
                  <Badge variant="light">{item.type}</Badge>
                  <Menu withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" onClick={(event) => event.stopPropagation()}><IconDots size={16} /></ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown onClick={stopMenuPropagation}>
                      {actions.canEdit && <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEdit(item)}>Edit</Menu.Item>}
                      {actions.canManageRecipe && <Menu.Item leftSection={<IconTools size={14} />} onClick={() => onManageRecipe(item)}>Manage Recipe</Menu.Item>}
                      {actions.canManageVariants && <Menu.Item leftSection={<IconPackage size={14} />} onClick={() => onManageVariants(item)}>Manage Variants</Menu.Item>}
                      {actions.canManageBarcodeImages && <Menu.Item leftSection={<IconBarcode size={14} />} onClick={() => onManageBarcodeImages(item)}>Manage Barcode & Images</Menu.Item>}
                      {actions.canDeactivate && <Menu.Item leftSection={<IconBan size={14} />} color="orange" onClick={() => onDeactivate(item)}>Deactivate</Menu.Item>}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Card>
            );
          })}
        </Stack>
      ) : (
        <EntityTable
          {...tableDefaults}
          data={rows}
          getRowId={(item) => String(item.id)}
          loading={itemsQuery.isLoading ? "loading" : itemsQuery.isFetching ? "refreshing" : "idle"}
          error={itemsQuery.error ? { message: itemsQuery.error instanceof Error ? itemsQuery.error.message : "Failed to load items" } : null}
          totalCount={totalCount}
          pagination={pagination}
          sort={sort}
          selection={selection}
          onPaginationChange={setPagination}
          onSortChange={setSort}
          onSelectionChange={setSelection}
          onRetry={() => void itemsQuery.refetch()}
          emptyState="No items found."
          isMobileViewport={false}
          data-testid="items-entity-table"
        />
      )}

      <ItemDetailDrawer
        item={selectedItem}
        opened={selectedItem !== null}
        groupName={selectedGroupName}
        canUpdate={permissions.canUpdate}
        canDelete={permissions.canDelete}
        onClose={() => setSelectedItem(null)}
        onEdit={onEdit}
        onDeactivate={onDeactivate}
      />
    </Stack>
  );
}
