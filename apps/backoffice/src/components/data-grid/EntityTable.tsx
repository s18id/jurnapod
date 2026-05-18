// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { DataTable, type DataTableColumnDef, type DataTableProps } from "@/components/ui/DataTable";
import { Button, Checkbox, Group, Menu, Stack } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface EntityTableColumnVisibilityConfig {
  storageKey: string;
  version: number;
  defaultVisibleColumnIds?: string[];
  essentialColumnIds?: string[];
  columnLabels?: Record<string, string>;
  hideChooserOnMobile?: boolean;
}

export interface StoredEntityTableColumnVisibility {
  version: number;
  visibleColumnIds: string[];
}

export type EntityTableProps<TData> = DataTableProps<TData> & {
  entityName?: string;
  columnVisibility?: EntityTableColumnVisibilityConfig;
  isMobileViewport?: boolean;
};

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function getColumnId<TData>(column: DataTableColumnDef<TData>): string | undefined {
  if (column.id) return column.id;
  const withAccessor = column as unknown as { accessorKey?: string };
  return withAccessor.accessorKey;
}

function isUtilityColumn<TData>(column: DataTableColumnDef<TData>): boolean {
  return column.isSelection === true || column.isRowAction === true;
}

function getDefaultVisibleColumnIds<TData>(
  columns: DataTableColumnDef<TData>[],
  defaultVisibleColumnIds?: string[]
): string[] {
  if (defaultVisibleColumnIds && defaultVisibleColumnIds.length > 0) {
    return defaultVisibleColumnIds;
  }

  return columns
    .filter((column) => !isUtilityColumn(column))
    .map(getColumnId)
    .filter((id): id is string => Boolean(id));
}

export function readEntityTableColumnVisibility(
  storage: StorageLike | undefined,
  storageKey: string,
  version: number
): string[] | undefined {
  if (!storage) return undefined;

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredEntityTableColumnVisibility>;
    if (parsed.version !== version || !Array.isArray(parsed.visibleColumnIds)) {
      return undefined;
    }
    return parsed.visibleColumnIds.filter((id): id is string => typeof id === "string");
  } catch {
    return undefined;
  }
}

export function writeEntityTableColumnVisibility(
  storage: StorageLike | undefined,
  storageKey: string,
  version: number,
  visibleColumnIds: string[]
): void {
  if (!storage) return;
  const payload: StoredEntityTableColumnVisibility = { version, visibleColumnIds };
  try {
    storage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Column preferences are non-critical UI state. Quota, private mode,
    // or security failures MUST NOT crash table rendering.
  }
}

export function resolveEntityTableVisibleColumnIds<TData>(
  columns: DataTableColumnDef<TData>[],
  config: EntityTableColumnVisibilityConfig | undefined,
  storage?: StorageLike
): string[] {
  if (!config) {
    return getDefaultVisibleColumnIds(columns);
  }

  return (
    readEntityTableColumnVisibility(storage, config.storageKey, config.version) ??
    getDefaultVisibleColumnIds(columns, config.defaultVisibleColumnIds)
  );
}

export function toggleEntityTableColumnVisibility(
  visibleColumnIds: string[],
  columnId: string,
  checked: boolean
): string[] {
  if (checked) return Array.from(new Set([...visibleColumnIds, columnId]));
  return visibleColumnIds.filter((id) => id !== columnId);
}

export function getEntityTableEffectiveColumns<TData>(
  columns: DataTableColumnDef<TData>[],
  config: EntityTableColumnVisibilityConfig | undefined,
  visibleColumnIds: string[],
  isMobileViewport: boolean
): DataTableColumnDef<TData>[] {
  if (!config) return columns;

  const mobileEssential = new Set(config.essentialColumnIds ?? []);
  const visible = new Set(isMobileViewport && mobileEssential.size > 0 ? mobileEssential : visibleColumnIds);

  return columns.filter((column) => {
    if (isUtilityColumn(column)) return !isMobileViewport || column.isRowAction === true;
    const columnId = getColumnId(column);
    return columnId ? visible.has(columnId) : true;
  });
}

export function EntityTable<TData>(props: EntityTableProps<TData>) {
  const { entityName, _caption, columns, columnVisibility, isMobileViewport = false, ...rest } = props;
  const browserStorage = typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage;
  const storageKey = columnVisibility?.storageKey;
  const schemaVersion = columnVisibility?.version;
  const defaultVisibleColumnIds = columnVisibility?.defaultVisibleColumnIds;
  const essentialColumnIds = columnVisibility?.essentialColumnIds;
  const columnLabels = columnVisibility?.columnLabels;
  const hideChooserOnMobile = columnVisibility?.hideChooserOnMobile;
  const stableColumnVisibility = useMemo<EntityTableColumnVisibilityConfig | undefined>(() => {
    if (!storageKey || schemaVersion === undefined) return undefined;
    return {
      storageKey,
      version: schemaVersion,
      defaultVisibleColumnIds,
      essentialColumnIds,
      columnLabels,
      hideChooserOnMobile,
    };
  }, [
    storageKey,
    schemaVersion,
    defaultVisibleColumnIds,
    essentialColumnIds,
    columnLabels,
    hideChooserOnMobile,
  ]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() =>
    resolveEntityTableVisibleColumnIds(columns, columnVisibility, browserStorage)
  );

  useEffect(() => {
    if (!storageKey || schemaVersion === undefined) return;
    writeEntityTableColumnVisibility(
      browserStorage,
      storageKey,
      schemaVersion,
      visibleColumnIds
    );
  }, [browserStorage, schemaVersion, storageKey, visibleColumnIds]);

  const toggleColumn = useCallback((columnId: string, checked: boolean) => {
    setVisibleColumnIds((current) => toggleEntityTableColumnVisibility(current, columnId, checked));
  }, []);

  const effectiveColumns = useMemo(() => {
    return getEntityTableEffectiveColumns(columns, stableColumnVisibility, visibleColumnIds, isMobileViewport);
  }, [columns, isMobileViewport, stableColumnVisibility, visibleColumnIds]);

  const hideChooser = !stableColumnVisibility || (isMobileViewport && stableColumnVisibility.hideChooserOnMobile !== false);
  const chooserColumns = useMemo(
    () =>
      columns
        .filter((column) => !isUtilityColumn(column) && column.hideable !== false)
        .map((column) => {
          const id = getColumnId(column);
          return id ? { id, label: stableColumnVisibility?.columnLabels?.[id] ?? id } : undefined;
        })
        .filter((column): column is { id: string; label: string } => Boolean(column)),
    [columns, stableColumnVisibility]
  );

  return (
    <Stack gap="sm">
      {!hideChooser && chooserColumns.length > 0 && (
        <Group justify="flex-end">
          <Menu closeOnItemClick={false} withinPortal>
            <Menu.Target>
              <Button variant="light" size="xs" data-testid="entity-table-column-chooser">
                Columns
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {chooserColumns.map((column) => (
                <Menu.Item key={column.id} closeMenuOnClick={false}>
                  <Checkbox
                    label={column.label}
                    checked={visibleColumnIds.includes(column.id)}
                    onChange={(event) => toggleColumn(column.id, event.currentTarget.checked)}
                    data-testid={`entity-table-column-toggle-${column.id}`}
                  />
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
      )}
      <DataTable
        {...rest}
        columns={effectiveColumns}
        _caption={_caption ?? (entityName ? `${entityName} table` : undefined)}
      />
    </Stack>
  );
}
