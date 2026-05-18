// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { BatchAction, DataTableColumnDef } from "@/components/ui/DataTable";
import type { EntityTableColumnVisibilityConfig } from "@/components/data-grid";
import { ScopeBadge, StatusBadge } from "@/components/data-grid";
import { IconBan, IconCheck, IconDownload } from "@tabler/icons-react";
import { createElement } from "react";

import type { Item, ItemType } from "@/hooks/use-items";

export type CatalogEntityType = "items" | "prices";

export const CATALOG_COLUMN_SCHEMA_VERSION = 1;

export function getCatalogColumnVisibilityStorageKey(
  entityType: CatalogEntityType,
  version: number = CATALOG_COLUMN_SCHEMA_VERSION
): string {
  return `jurnapod.catalog.${entityType}.columns.v${version}`;
}

export interface CatalogColumnMetadata {
  id: string;
  label: string;
  essential: boolean;
  cardLabel?: string;
  mobilePriority: number;
  defaultVisible: boolean;
}

export interface CatalogItemRow extends Item {
  groupName?: string;
  totalStock?: number;
  variantCount?: number;
}

export interface CatalogPriceItemSummary {
  id: number;
  sku: string | null;
  name: string;
  type?: ItemType;
  item_group_id?: number | null;
}

export interface CatalogPriceRow {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  price: number;
  is_active: boolean;
  updated_at: string;
  item?: CatalogPriceItemSummary;
  groupName?: string;
  hasOverride?: boolean;
  effectivePrice?: number;
  defaultPrice?: number;
  outletName?: string;
}

export interface CatalogTableConfig<TData> {
  entityType: CatalogEntityType;
  entityName: string;
  columns: DataTableColumnDef<TData>[];
  columnMetadata: CatalogColumnMetadata[];
  columnVisibility: EntityTableColumnVisibilityConfig;
  bulkActions: BatchAction[];
  cardReadyColumnIds: string[];
  essentialColumnIds: string[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatStatus(isActive: boolean) {
  return createElement(StatusBadge, {
    status: isActive ? "Active" : "Inactive",
    colorMap: { active: "green", inactive: "red" },
  });
}

function formatUpdatedAt(value: string | undefined): string {
  return value || "-";
}

function getColumnLabels(metadata: CatalogColumnMetadata[]): Record<string, string> {
  return Object.fromEntries(metadata.map((column) => [column.id, column.label]));
}

function getDefaultVisibleColumnIds(metadata: CatalogColumnMetadata[]): string[] {
  return metadata.filter((column) => column.defaultVisible).map((column) => column.id);
}

function getEssentialColumnIds(metadata: CatalogColumnMetadata[]): string[] {
  return metadata.filter((column) => column.essential).map((column) => column.id);
}

export const catalogItemColumnMetadata: CatalogColumnMetadata[] = [
  { id: "sku", label: "SKU", essential: true, cardLabel: "SKU", mobilePriority: 2, defaultVisible: true },
  { id: "name", label: "Name", essential: true, cardLabel: "Name", mobilePriority: 1, defaultVisible: true },
  { id: "type", label: "Type", essential: true, cardLabel: "Type", mobilePriority: 3, defaultVisible: true },
  { id: "status", label: "Status", essential: true, cardLabel: "Status", mobilePriority: 4, defaultVisible: true },
  { id: "updated_at", label: "Updated At", essential: false, cardLabel: "Updated", mobilePriority: 5, defaultVisible: true },
  { id: "group", label: "Group", essential: false, cardLabel: "Group", mobilePriority: 6, defaultVisible: false },
  { id: "stock", label: "Stock", essential: false, cardLabel: "Stock", mobilePriority: 7, defaultVisible: false },
];

export const catalogPriceColumnMetadata: CatalogColumnMetadata[] = [
  { id: "item", label: "Item", essential: true, cardLabel: "Item", mobilePriority: 1, defaultVisible: true },
  { id: "sku", label: "SKU", essential: true, cardLabel: "SKU", mobilePriority: 2, defaultVisible: true },
  { id: "scope", label: "Scope", essential: true, cardLabel: "Scope", mobilePriority: 3, defaultVisible: true },
  { id: "price", label: "Price", essential: true, cardLabel: "Price", mobilePriority: 4, defaultVisible: true },
  { id: "status", label: "Status", essential: true, cardLabel: "Status", mobilePriority: 5, defaultVisible: true },
  { id: "updated_at", label: "Updated At", essential: false, cardLabel: "Updated", mobilePriority: 6, defaultVisible: true },
  { id: "group", label: "Group", essential: false, cardLabel: "Group", mobilePriority: 7, defaultVisible: false },
];

export const catalogItemColumns: DataTableColumnDef<CatalogItemRow>[] = [
  { id: "selection", header: "", cell: () => null, isSelection: true, hideable: false },
  { id: "sku", accessorKey: "sku", header: "SKU", sortable: true, filterable: true, cell: (info) => info.getValue<string | null>() ?? "-" },
  { id: "name", accessorKey: "name", header: "Name", sortable: true, filterable: true, cell: (info) => info.getValue<string>() },
  { id: "type", accessorKey: "type", header: "Type", sortable: true, filterable: true, cell: (info) => info.getValue<string>() },
  { id: "status", accessorKey: "is_active", header: "Status", sortable: true, filterable: true, cell: (info) => formatStatus(Boolean(info.getValue<boolean>())) },
  { id: "updated_at", accessorKey: "updated_at", header: "Updated At", sortable: true, cell: (info) => formatUpdatedAt(info.getValue<string>()) },
  { id: "group", accessorKey: "groupName", header: "Group", filterable: true, cell: (info) => info.getValue<string | undefined>() ?? "-" },
  { id: "stock", accessorKey: "totalStock", header: "Stock", cell: (info) => info.getValue<number | undefined>() ?? "-" },
];

export const catalogPriceColumns: DataTableColumnDef<CatalogPriceRow>[] = [
  { id: "selection", header: "", cell: () => null, isSelection: true, hideable: false },
  { id: "item", header: "Item", sortable: true, filterable: true, cell: (info) => info.row.original.item?.name ?? "Unknown Item" },
  { id: "sku", header: "SKU", sortable: true, filterable: true, cell: (info) => info.row.original.item?.sku ?? "No SKU" },
  {
    id: "scope",
    header: "Scope",
    filterable: true,
    cell: (info) => {
      const price = info.row.original;
      const label = price.outlet_id === null ? "Default" : `Outlet: ${price.outletName ?? price.outlet_id}`;
      return createElement(ScopeBadge, { label, color: label === "Default" ? "green" : "blue" });
    },
  },
  { id: "price", accessorKey: "price", header: "Price", sortable: true, cell: (info) => formatCurrency(Number(info.getValue<number>())) },
  { id: "status", accessorKey: "is_active", header: "Status", sortable: true, filterable: true, cell: (info) => formatStatus(Boolean(info.getValue<boolean>())) },
  { id: "updated_at", accessorKey: "updated_at", header: "Updated At", sortable: true, cell: (info) => formatUpdatedAt(info.getValue<string>()) },
  { id: "group", accessorKey: "groupName", header: "Group", filterable: true, cell: (info) => info.getValue<string | undefined>() ?? "-" },
];

export const catalogItemBulkActions: BatchAction[] = [
  { id: "export", label: "Export selected items", icon: createElement(IconDownload, { size: 16 }) },
  { id: "activate", label: "Activate selected items", icon: createElement(IconCheck, { size: 16 }), color: "green" },
  { id: "deactivate", label: "Deactivate selected items", icon: createElement(IconBan, { size: 16 }), color: "orange" },
];

export const catalogPriceBulkActions: BatchAction[] = [
  { id: "export", label: "Export selected prices", icon: createElement(IconDownload, { size: 16 }) },
  { id: "deactivate", label: "Deactivate selected prices", icon: createElement(IconBan, { size: 16 }), color: "orange" },
];

export function createCatalogColumnVisibilityConfig(
  entityType: CatalogEntityType,
  metadata: CatalogColumnMetadata[]
): EntityTableColumnVisibilityConfig {
  return {
    storageKey: getCatalogColumnVisibilityStorageKey(entityType),
    version: CATALOG_COLUMN_SCHEMA_VERSION,
    defaultVisibleColumnIds: getDefaultVisibleColumnIds(metadata),
    essentialColumnIds: getEssentialColumnIds(metadata),
    columnLabels: getColumnLabels(metadata),
    hideChooserOnMobile: true,
  };
}

export const catalogItemTableConfig: CatalogTableConfig<CatalogItemRow> = {
  entityType: "items",
  entityName: "Items",
  columns: catalogItemColumns,
  columnMetadata: catalogItemColumnMetadata,
  columnVisibility: createCatalogColumnVisibilityConfig("items", catalogItemColumnMetadata),
  bulkActions: catalogItemBulkActions,
  cardReadyColumnIds: [...catalogItemColumnMetadata].sort((a, b) => a.mobilePriority - b.mobilePriority).map((column) => column.id),
  essentialColumnIds: getEssentialColumnIds(catalogItemColumnMetadata),
};

export const catalogPriceTableConfig: CatalogTableConfig<CatalogPriceRow> = {
  entityType: "prices",
  entityName: "Prices",
  columns: catalogPriceColumns,
  columnMetadata: catalogPriceColumnMetadata,
  columnVisibility: createCatalogColumnVisibilityConfig("prices", catalogPriceColumnMetadata),
  bulkActions: catalogPriceBulkActions,
  cardReadyColumnIds: [...catalogPriceColumnMetadata].sort((a, b) => a.mobilePriority - b.mobilePriority).map((column) => column.id),
  essentialColumnIds: getEssentialColumnIds(catalogPriceColumnMetadata),
};

export function createCatalogEntityTableDefaults<TData>(config: CatalogTableConfig<TData>) {
  return {
    entityName: config.entityName,
    columns: config.columns,
    columnVisibility: config.columnVisibility,
    batchActions: config.bulkActions,
    minWidth: 720,
    stickyHeader: true,
    zebraStriping: true,
  };
}

export function renderPriceScopeSummary(price: CatalogPriceRow) {
  const label = price.outlet_id === null ? "Default" : `Outlet: ${price.outletName ?? price.outlet_id}`;
  return createElement(ScopeBadge, { label, color: label === "Default" ? "green" : "blue" });
}
