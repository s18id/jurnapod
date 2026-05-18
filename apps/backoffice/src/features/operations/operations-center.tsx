// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Badge, Button, Card, Group, Progress, Stack, Text, Title } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { EntityTable } from "@/components/data-grid/EntityTable";
import type { DataTableColumnDef, PaginationState } from "@/components/ui/DataTable";
import { useAsyncJobDrawer } from "@/hooks/use-async-job-drawer";
import type { AsyncJobDrawerContextValue } from "@/hooks/use-async-job-drawer";
import {
  OPERATIONS_DEFAULT_LIMIT,
  isSupportedOperationListStatus,
  type OperationListItem,
  type OperationsListParams,
  useOperationsList,
} from "@/hooks/use-operations-list";
import { actionGates, resolveEffectivePermissions } from "@/lib/auth/permissions";
import { canReadOperations } from "@/lib/operations-permissions";
import type { SessionUser } from "@/lib/session";

import { OperationsFilterBar, type OperationsFilters } from "./operations-filter-bar";

interface OperationsCenterProps {
  user: SessionUser;
}

export function parseOperationsFiltersFromHash(hash: string): OperationsFilters {
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return {};

  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const status = params.get("status");
  return {
    status: isSupportedOperationListStatus(status) ? status : undefined,
  };
}

export function buildOperationsHash(filters: OperationsFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  const query = params.toString();
  return query ? `#/operations?${query}` : "#/operations";
}

export function pageToOffset(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize);
}

export function makeOperationsListParams(filters: OperationsFilters, pagination: PaginationState): OperationsListParams {
  return {
    status: filters.status,
    type: filters.type,
    limit: pagination.pageSize,
    offset: pageToOffset(pagination.page, pagination.pageSize),
  };
}

function statusColor(status: OperationListItem["status"]): string {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "cancelled") return "yellow";
  return "blue";
}

export function canShowOperationsEmptyImportLink(user: SessionUser): boolean {
  const effectivePermissions = resolveEffectivePermissions(user) ?? [];
  return actionGates(effectivePermissions, "inventory", "items", ["CREATE"]).CREATE;
}

export function canShowOperationsEmptyExportLink(user: SessionUser): boolean {
  const effectivePermissions = resolveEffectivePermissions(user) ?? [];
  return actionGates(effectivePermissions, "inventory", "items", ["READ"]).READ;
}

export function openOperationFromRow(drawer: Pick<AsyncJobDrawerContextValue, "open">, row: OperationListItem): void {
  drawer.open({ operationId: row.operationId, operationType: row.type });
}

function OperationsEmptyState({ user }: { user: SessionUser }) {
  const canImport = canShowOperationsEmptyImportLink(user);
  const canExport = canShowOperationsEmptyExportLink(user);

  return (
    <Stack align="center" gap="xs">
      <Text>No operations yet</Text>
      {(canImport || canExport) ? (
        <Group gap="xs">
          {canImport ? <Button component="a" href="#/items/import" size="xs" variant="light">Go to import</Button> : null}
          {canExport ? <Button component="a" href="#/items" size="xs" variant="light">Go to export</Button> : null}
        </Group>
      ) : null}
    </Stack>
  );
}

export function OperationsCenter({ user }: OperationsCenterProps) {
  const hasAccess = canReadOperations(user);
  const drawer = useAsyncJobDrawer();
  const [filters, setFilters] = useState<OperationsFilters>(() => (
    typeof window === "undefined" ? {} : parseOperationsFiltersFromHash(window.location.hash)
  ));
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: OPERATIONS_DEFAULT_LIMIT });
  const params = useMemo(() => makeOperationsListParams(filters, pagination), [filters, pagination]);
  const query = useOperationsList(params, { enabled: hasAccess });

  const columns = useMemo<DataTableColumnDef<OperationListItem>[]>(() => [
    {
      id: "operationId",
      accessorKey: "operationId",
      header: "Operation ID",
      cell: (info) => <Text size="sm" fw={600}>{info.row.original.operationId}</Text>,
    },
    {
      id: "type",
      accessorKey: "type",
      header: "Job type",
      cell: (info) => <Badge variant="light">{info.row.original.type}</Badge>,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      cell: (info) => <Badge color={statusColor(info.row.original.status)} variant="light">{info.row.original.status}</Badge>,
    },
    {
      id: "progress",
      header: "Progress",
      cell: (info) => (
        <Stack gap={4} miw={120}>
          <Progress value={info.row.original.percentage} aria-label={`Progress ${info.row.original.operationId}`} />
          <Text size="xs" c="dimmed">{info.row.original.completed}/{info.row.original.total} · {info.row.original.percentage}%</Text>
        </Stack>
      ),
    },
    { id: "startedAt", accessorKey: "startedAt", header: "Started at", cell: (info) => info.row.original.startedAt },
    { id: "updatedAt", accessorKey: "updatedAt", header: "Updated at", cell: (info) => info.row.original.updatedAt },
    { id: "completedAt", accessorKey: "completedAt", header: "Completed at", cell: (info) => info.row.original.completedAt ?? "—" },
    {
      id: "details",
      header: "Details",
      isRowAction: true,
      cell: (info) => (
        <Button
          size="xs"
          variant="subtle"
          onClick={(event) => {
            event.stopPropagation();
            openOperationFromRow(drawer, info.row.original);
          }}
        >
          Open details
        </Button>
      ),
    },
  ], [drawer]);

  function handleFilterChange(nextFilters: OperationsFilters) {
    setFilters(nextFilters);
    setPagination((current) => ({ ...current, page: 1 }));
    if (typeof window !== "undefined") {
      window.location.hash = buildOperationsHash(nextFilters);
    }
  }

  if (!hasAccess) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>Operations Center</Title>
        <Alert color="red" title="Access denied" icon={<IconLock size={16} />}>
          Access denied
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Operations Center</Title>
          <Text size="sm" c="dimmed">Review persisted async operation progress rows.</Text>
        </div>
      </Group>

      <Card>
        <OperationsFilterBar filters={filters} onChange={handleFilterChange} loading={query.isLoading} />
      </Card>

      <EntityTable
        entityName="Operations"
        data={query.data?.operations ?? []}
        columns={columns}
        getRowId={(row) => row.operationId}
        loading={query.isLoading ? "loading" : query.isFetching ? "refreshing" : "idle"}
        error={query.error ? { message: query.error instanceof Error ? query.error.message : "Failed to load operations" } : null}
        onRetry={() => void query.refetch()}
        totalCount={query.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        onRowClick={(row) => openOperationFromRow(drawer, row)}
        rowAriaLabel={(row) => `Open operation ${row.operationId}`}
        emptyState={<OperationsEmptyState user={user} />}
        data-testid="operations-table"
        columnVisibility={{
          storageKey: "operations-center-columns-v1",
          version: 1,
          defaultVisibleColumnIds: ["operationId", "type", "status", "progress", "startedAt", "updatedAt", "completedAt"],
          columnLabels: {
            operationId: "Operation ID",
            type: "Job type",
            status: "Status",
            progress: "Progress",
            startedAt: "Started at",
            updatedAt: "Updated at",
            completedAt: "Completed at",
          },
        }}
      />
    </Stack>
  );
}
