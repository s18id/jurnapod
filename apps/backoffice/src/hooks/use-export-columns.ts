// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../lib/api-client";
import type { ExportColumn, ExportEntityType } from "./use-export";

type ExportColumnsApiColumn = Omit<ExportColumn, "group"> & { group?: string };

type ExportColumnsApiResponse = {
  success: true;
  data: {
    entityType: ExportEntityType;
    columns: ExportColumnsApiColumn[];
    defaultColumns: string[];
  };
};

export type ExportColumnsResult = {
  columns: ExportColumn[];
  defaultColumns: string[];
};

export const exportColumnsQueryKeys = {
  all: ["export-columns"] as const,
  entity: (entityType: ExportEntityType) => [...exportColumnsQueryKeys.all, entityType] as const,
};

const ITEM_GROUP_BY_KEY: Record<string, string> = {
  id: "Basic Info",
  sku: "Basic Info",
  name: "Basic Info",
  item_type: "Basic Info",
  description: "Basic Info",
  barcode: "Basic Info",
  barcode_type: "Basic Info",
  unit_of_measure: "Basic Info",
  item_group_id: "Classification",
  item_group_name: "Classification",
  category_name: "Classification",
  group_name: "Classification",
  cogs_account_id: "Accounting",
  inventory_asset_account_id: "Accounting",
  base_price: "Pricing",
  cost_price: "Pricing",
  is_active: "Status",
  created_at: "Timestamps",
  updated_at: "Timestamps",
};

const PRICE_GROUP_BY_KEY: Record<string, string> = {
  id: "Basic Info",
  item_id: "Item Info",
  item_sku: "Item Info",
  item_name: "Item Info",
  outlet_id: "Outlet Info",
  outlet_name: "Outlet Info",
  base_price: "Pricing",
  outlet_price: "Pricing",
  price: "Pricing",
  is_active: "Status",
  is_overridden: "Pricing",
  is_override: "Pricing",
  effective_date: "Dates",
  created_at: "Timestamps",
  updated_at: "Timestamps",
};

function getColumnGroup(entityType: ExportEntityType, column: ExportColumnsApiColumn): string {
  if (column.group) return column.group;
  const map = entityType === "items" ? ITEM_GROUP_BY_KEY : PRICE_GROUP_BY_KEY;
  return map[column.key] ?? "Other";
}

export function normalizeExportColumnsResponse(
  entityType: ExportEntityType,
  response: ExportColumnsApiResponse
): ExportColumnsResult {
  return {
    columns: response.data.columns.map((column) => ({
      ...column,
      group: getColumnGroup(entityType, column),
      fieldType: column.fieldType ?? "string",
    })),
    defaultColumns: response.data.defaultColumns,
  };
}

export async function fetchExportColumns(entityType: ExportEntityType): Promise<ExportColumnsResult> {
  const response = await apiRequest<ExportColumnsApiResponse>(`/export/${entityType}/columns`);
  return normalizeExportColumnsResponse(entityType, response);
}

type UseExportColumnsReturn = ExportColumnsResult & {
  availableGroups: string[];
  getColumnsByGroup: (group: string) => ExportColumn[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useExportColumns(entityType: ExportEntityType): UseExportColumnsReturn {
  const query = useQuery({
    queryKey: exportColumnsQueryKeys.entity(entityType),
    queryFn: () => fetchExportColumns(entityType),
    staleTime: 5 * 60 * 1000,
  });

  const columns = query.data?.columns ?? [];
  const defaultColumns = query.data?.defaultColumns ?? [];

  const availableGroups = useMemo(() => {
    return Array.from(new Set(columns.map((column) => column.group)));
  }, [columns]);

  const getColumnsByGroup = useMemo(() => {
    return (group: string) => columns.filter((column) => column.group === group);
  }, [columns]);

  return {
    columns,
    defaultColumns,
    availableGroups,
    getColumnsByGroup,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
