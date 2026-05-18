// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { AuditLogResponse } from "@jurnapod/shared";
import { Alert, Badge, Button, Group, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";

import { FilterBar } from "@/components/FilterBar";
import { PageCard } from "@/components/PageCard";
import { DetailDrawer, EntityTable } from "@/components/data-grid";
import type { DataTableColumnDef, PaginationState, RowSelectionState, SortState } from "@/components/ui/DataTable";
import { findRoute } from "@/app/routes";
import { resolveEffectivePermissions, userSatisfiesRoutePermission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

import { useAuditLogDetail, useAuditLogList } from "./audit/api";
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  buildAuditDiffRows,
  buildHalfOpenDateRange,
  formatAuditDiffValue,
  isValidDateRange,
  parseAuditJsonObject,
  type AuditFilterInput,
} from "./audit/audit-helpers";

type AuditLogsPageProps = {
  user: SessionUser;
};

type SelectValue = "all" | string;

const actionOptions = [
  { value: "all", label: "All actions" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "DEACTIVATE", label: "Deactivate" },
  { value: "REACTIVATE", label: "Reactivate" },
  { value: "VOID", label: "Void" },
  { value: "REFUND", label: "Refund" },
  { value: "POST", label: "Post" },
  { value: "IMPORT", label: "Import" },
];

const objectTypeOptions = [
  { value: "all", label: "All object types" },
  { value: "user", label: "User" },
  { value: "role", label: "Role" },
  { value: "company", label: "Company" },
  { value: "outlet", label: "Outlet" },
  { value: "setting", label: "Setting" },
  { value: "item", label: "Item" },
  { value: "invoice", label: "Invoice" },
  { value: "payment", label: "Payment" },
];

const successOptions = [
  { value: "all", label: "All outcomes" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
];

function useAuditRouteAllowed(user: SessionUser): boolean {
  const route = findRoute("/audit-logs");
  const permissions = resolveEffectivePermissions(user);
  return !!route && userSatisfiesRoutePermission(route.permission, permissions);
}

function toNumberFilter(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function buildSummary(row: AuditLogResponse): string {
  const payload = parseAuditJsonObject(row.payload_json);
  const summary = typeof payload?.summary === "string" ? payload.summary.trim() : "";
  if (summary) return summary;
  return `${row.action} ${row.entity_type ?? "object"}${row.entity_id ? ` #${row.entity_id}` : ""}`;
}

function buildScope(row: AuditLogResponse): string {
  const parts = [`company:${row.company_id ?? "—"}`];
  if (row.outlet_id !== null) parts.push(`outlet:${row.outlet_id}`);
  return parts.join(" / ");
}

function AuditDetailContent({ row }: { row: AuditLogResponse }) {
  const diffRows = buildAuditDiffRows(row.changes_json);
  const payload = parseAuditJsonObject(row.payload_json);
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Text><strong>Actor user ID:</strong> {row.user_id ?? "—"}</Text>
        <Text><strong>Action:</strong> {row.action}</Text>
        <Text><strong>Object:</strong> {row.entity_type ?? "—"} #{row.entity_id ?? "—"}</Text>
        <Text><strong>Scope:</strong> {buildScope(row)}</Text>
        <Text><strong>Timestamp:</strong> {row.created_at}</Text>
        <Text><strong>Success:</strong> {row.success ? "Yes" : "No"}</Text>
        <Text><strong>Status:</strong> {row.status}</Text>
        <Text><strong>IP address:</strong> {row.ip_address ?? "—"}</Text>
      </SimpleGrid>
      <Stack gap="xs">
        <Text fw={600}>Object details</Text>
        <Text size="sm" c="dimmed">{payload ? JSON.stringify(payload) : "No payload available."}</Text>
      </Stack>
      <Stack gap="xs">
        <Text fw={600}>Before/after diff</Text>
        {diffRows.length === 0 ? (
          <Text c="dimmed" size="sm">No before/after payload is available for this audit record.</Text>
        ) : (
          diffRows.map((diff) => (
            <Group key={diff.field} gap="sm" align="flex-start">
              <Badge color={diff.changed ? "blue" : "gray"}>{diff.field}</Badge>
              <Text size="sm"><strong>Before:</strong> {formatAuditDiffValue(diff.before)}</Text>
              <Text size="sm"><strong>After:</strong> {formatAuditDiffValue(diff.after)}</Text>
            </Group>
          ))
        )}
      </Stack>
    </Stack>
  );
}

export function AuditLogsPage(props: AuditLogsPageProps) {
  const { user } = props;
  const routeAllowed = useAuditRouteAllowed(user);
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState<SelectValue>("all");
  const [objectType, setObjectType] = useState<SelectValue>("all");
  const [objectId, setObjectId] = useState("");
  const [success, setSuccess] = useState<SelectValue>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [outletId, setOutletId] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: AUDIT_DEFAULT_PAGE_SIZE });
  const [sort, setSort] = useState<SortState | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [selectedAuditId, setSelectedAuditId] = useState<number | null>(null);

  const filters = useMemo<AuditFilterInput>(() => {
    const dateRange = startDate && endDate && isValidDateRange(startDate, endDate)
      ? buildHalfOpenDateRange(startDate, endDate)
      : null;
    return {
      actorUserId: toNumberFilter(actorUserId),
      action: action === "all" ? undefined : action,
      objectType: objectType === "all" ? undefined : objectType,
      entityId: objectId.trim() || undefined,
      companyId: user.company_id,
      outletId: toNumberFilter(outletId),
      success: success === "all" ? undefined : success === "success",
      startDate: dateRange?.startMs,
      endDate: dateRange?.endMs,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize,
    };
  }, [action, actorUserId, endDate, objectId, objectType, outletId, pagination.page, pagination.pageSize, startDate, success, user.company_id]);

  const auditQuery = useAuditLogList(user.company_id, filters);
  const detailQuery = useAuditLogDetail(user.company_id, selectedAuditId);

  const columns = useMemo<DataTableColumnDef<AuditLogResponse>[]>(() => [
    { id: "created_at", header: "Timestamp", sortable: true, cell: (info) => <Text size="sm">{info.row.original.created_at}</Text> },
    { id: "actor", header: "Actor", cell: (info) => <Text size="sm">{info.row.original.user_id ?? "—"}</Text> },
    { id: "action", header: "Action", cell: (info) => <Badge variant="light">{info.row.original.action}</Badge> },
    { id: "object_type", header: "Object Type", cell: (info) => <Text size="sm">{info.row.original.entity_type ?? "—"}</Text> },
    { id: "object_id", header: "Object ID", cell: (info) => <Text size="sm">{info.row.original.entity_id ?? "—"}</Text> },
    { id: "summary", header: "Summary", cell: (info) => <Text size="sm">{buildSummary(info.row.original)}</Text> },
    { id: "scope", header: "Scope", cell: (info) => <Text size="sm">{buildScope(info.row.original)}</Text> },
    { id: "success", header: "Success", cell: (info) => <Badge color={info.row.original.success ? "green" : "red"}>{info.row.original.success ? "Success" : "Failure"}</Badge> },
    {
      id: "actions",
      header: "Actions",
      cell: (info) => (
        <Button size="xs" variant="light" onClick={() => setSelectedAuditId(info.row.original.id)}>
          View
        </Button>
      ),
    },
  ], []);

  const logs = auditQuery.data?.logs ?? [];
  const total = auditQuery.data?.total ?? 0;

  function resetPage() {
    setPagination((current) => ({ ...current, page: 1 }));
  }

  if (!routeAllowed) {
    return (
      <Alert color="red" title="Access denied" data-testid="audit-route-denied">
        Missing route permission for platform.settings.READ.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <PageCard
        title="Audit Log Explorer"
        description="Read-only audit explorer. Backend ACL remains authoritative. This screen does not introduce audit write paths."
      >
        <Stack gap="md">
          <Alert color="blue" title="Read-only audit contract" data-testid="audit-contract-available">
            Generic audit reads use `/api/audit-logs`, tenant scope from authenticated company_id, `success` outcome filtering, and half-open `from_ts`/`to_ts` boundaries.
          </Alert>
          <FilterBar>
            <TextInput label="Actor user ID" value={actorUserId} onChange={(event) => { setActorUserId(event.currentTarget.value); resetPage(); }} placeholder="Optional user ID" />
            <Select label="Action" data={actionOptions} value={action} onChange={(value) => { setAction(value ?? "all"); resetPage(); }} />
            <Select label="Object type" data={objectTypeOptions} value={objectType} onChange={(value) => { setObjectType(value ?? "all"); resetPage(); }} />
            <TextInput label="Object ID" value={objectId} onChange={(event) => { setObjectId(event.currentTarget.value); resetPage(); }} />
            <TextInput label="Start date" value={startDate} onChange={(event) => { setStartDate(event.currentTarget.value); resetPage(); }} placeholder="YYYY-MM-DD" />
            <TextInput label="End date" value={endDate} onChange={(event) => { setEndDate(event.currentTarget.value); resetPage(); }} placeholder="YYYY-MM-DD" />
            <TextInput label="Outlet scope" value={outletId} onChange={(event) => { setOutletId(event.currentTarget.value); resetPage(); }} placeholder="Optional outlet_id" />
            <Select label="Success" data={successOptions} value={success} onChange={(value) => { setSuccess(value ?? "all"); resetPage(); }} />
          </FilterBar>
          {startDate && endDate && !isValidDateRange(startDate, endDate) ? (
            <Alert color="red" title="Invalid date range">End date MUST be on or after start date.</Alert>
          ) : null}
        </Stack>
      </PageCard>

      <PageCard title={`Audit Entries (${total})`}>
        <EntityTable
          entityName="audit logs"
          columns={columns}
          data={logs}
          getRowId={(row) => String(row.id)}
          loading={auditQuery.isLoading ? "loading" : auditQuery.isFetching ? "refreshing" : "idle"}
          error={auditQuery.error ? { message: auditQuery.error.message, retryable: true } : null}
          onRetry={() => void auditQuery.refetch()}
          pagination={pagination}
          sort={sort}
          selection={selection}
          totalCount={total}
          onPaginationChange={setPagination}
          onSortChange={setSort}
          onSelectionChange={setSelection}
          emptyState="No audit logs match the current filters."
          data-testid="audit-logs-table"
        />
      </PageCard>

      <DetailDrawer
        opened={selectedAuditId !== null}
        onClose={() => setSelectedAuditId(null)}
        title="Audit Detail"
        size="lg"
        loading={detailQuery.isLoading}
        error={detailQuery.error ? detailQuery.error.message : null}
        data-testid="audit-detail-drawer"
      >
        {detailQuery.data ? <AuditDetailContent row={detailQuery.data} /> : null}
      </DetailDrawer>
    </Stack>
  );
}
