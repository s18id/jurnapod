// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertCircle, IconChecks, IconEye, IconRefresh, IconUserCheck, IconX } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type MouseEvent } from "react";

import { EntityTable } from "@/components/data-grid";
import type { DataTableColumnDef } from "@/components/ui/DataTable";
import { actionGates, resolveEffectivePermissions } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

import {
  AP_EXCEPTIONS_DEFAULT_LIMIT,
  apExceptionQueryKeys,
  useApExceptionWorklistQuery,
  useAssignApExceptionMutation,
  useResolveApExceptionMutation,
} from "./api";
import { AssignExceptionModal, ResolveExceptionModal, formatApExceptionApiError } from "./actions";
import { ApExceptionDetailPanel } from "./detail-panel";
import { ApExceptionFilters } from "./filters";
import type { ApException, ApExceptionFilterState, ApExceptionResolutionStatus, ApExceptionWorklistParams, ApExceptionWorklistResult } from "./types";

interface PurchasingApExceptionsPageProps {
  user: SessionUser;
}

const DEFAULT_FILTERS: ApExceptionFilterState = {
  type: "",
  status: "",
  supplierId: "",
  search: "",
  limit: AP_EXCEPTIONS_DEFAULT_LIMIT,
};

export function parseApExceptionHighlightId(hash: string | undefined): number | null {
  if (!hash) return null;
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return null;
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const raw = params.get("highlight");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function userCanReadApExceptions(user: SessionUser): boolean {
  const permissions = resolveEffectivePermissions(user) ?? [];
  const accounting = actionGates(permissions, "accounting", "journals", ["ANALYZE"]);
  const purchasing = actionGates(permissions, "purchasing", "suppliers", ["ANALYZE"]);
  return accounting.ANALYZE || purchasing.ANALYZE;
}

export function userCanMutateApExceptions(user: SessionUser): boolean {
  const permissions = resolveEffectivePermissions(user) ?? [];
  return actionGates(permissions, "accounting", "journals", ["UPDATE"]).UPDATE;
}

function statusBadgeColor(status: ApException["status"]): string {
  switch (status) {
    case "OPEN": return "orange";
    case "ASSIGNED": return "blue";
    case "RESOLVED": return "green";
    case "DISMISSED": return "gray";
  }
}

function updateExceptionInWorklist(result: ApExceptionWorklistResult | undefined, updated: ApException): ApExceptionWorklistResult | undefined {
  if (!result) return result;
  return {
    ...result,
    exceptions: result.exceptions.map((exception) => exception.id === updated.id ? updated : exception),
  };
}

export function PurchasingApExceptionsPage({ user }: PurchasingApExceptionsPageProps) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ApExceptionFilterState>(DEFAULT_FILTERS);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedException, setSelectedException] = useState<ApException | null>(null);
  const [actionException, setActionException] = useState<ApException | null>(null);
  const [resolveAction, setResolveAction] = useState<ApExceptionResolutionStatus>("RESOLVED");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [detailOpen, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const [assignOpen, { open: openAssign, close: closeAssign }] = useDisclosure(false);
  const [resolveOpen, { open: openResolve, close: closeResolve }] = useDisclosure(false);

  const canRead = userCanReadApExceptions(user);
  const canMutate = userCanMutateApExceptions(user);

  const listParams = useMemo<ApExceptionWorklistParams>(() => ({
    type: filters.type,
    status: filters.status,
    supplier_id: filters.supplierId,
    search: filters.search,
    cursor,
    limit: filters.limit,
  }), [cursor, filters]);

  const worklistQuery = useApExceptionWorklistQuery(listParams, { enabled: canRead });
  const assignMutation = useAssignApExceptionMutation();
  const resolveMutation = useResolveApExceptionMutation();
  const exceptions = worklistQuery.data?.exceptions ?? [];
  const highlightId = parseApExceptionHighlightId(typeof globalThis.location === "undefined" ? undefined : globalThis.location.hash);
  const highlightedLoaded = highlightId == null || exceptions.some((exception) => exception.id === highlightId);

  function updateFilters(patch: Partial<ApExceptionFilterState>) {
    setFilters((current) => ({ ...current, ...patch }));
    setCursor(null);
  }

  const selectRow = useCallback((exception: ApException) => {
    setSelectedException(exception);
    openDetail();
  }, [openDetail]);

  const openAssignReview = useCallback((exception: ApException, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    setActionException(exception);
    setMutationError(null);
    openAssign();
  }, [openAssign]);

  const openResolveReview = useCallback((exception: ApException, action: ApExceptionResolutionStatus, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    setActionException(exception);
    setResolveAction(action);
    setMutationError(null);
    openResolve();
  }, [openResolve]);

  async function applyUpdatedException(updated: ApException) {
    queryClient.setQueryData(apExceptionQueryKeys.list(listParams), (current: ApExceptionWorklistResult | undefined) => updateExceptionInWorklist(current, updated));
    setSelectedException((current) => current?.id === updated.id ? updated : current);
    setActionException(updated);
    await queryClient.invalidateQueries({ queryKey: apExceptionQueryKeys.all });
  }

  async function submitAssign(assignedToUserId: number): Promise<boolean> {
    if (!actionException) return false;
    setMutationError(null);
    try {
      const updated = await assignMutation.mutateAsync({ exceptionId: actionException.id, assignedToUserId });
      await applyUpdatedException(updated);
      setSuccessMessage(`${updated.exception_key} assigned to user ${updated.assigned_to_user_id}.`);
      closeAssign();
      return true;
    } catch (error) {
      setMutationError(formatApExceptionApiError(error));
      return false;
    }
  }

  async function submitResolve(resolutionNote: string): Promise<boolean> {
    if (!actionException) return false;
    setMutationError(null);
    try {
      const updated = await resolveMutation.mutateAsync({ exceptionId: actionException.id, status: resolveAction, resolutionNote });
      await applyUpdatedException(updated);
      setSuccessMessage(`${updated.exception_key} ${updated.status.toLowerCase()}.`);
      closeResolve();
      return true;
    } catch (error) {
      setMutationError(formatApExceptionApiError(error));
      return false;
    }
  }

  const columns = useMemo<DataTableColumnDef<ApException>[]>(() => [
    { id: "type", accessorKey: "type", header: "Type", cell: (info) => String(info.getValue()) },
    { id: "source", header: "Source", cell: ({ row }) => `${row.original.source_type} #${row.original.source_id}` },
    { id: "supplier_id", accessorKey: "supplier_id", header: "Supplier ID", cell: (info) => info.getValue() == null ? "—" : String(info.getValue()) },
    { id: "variance_amount", accessorKey: "variance_amount", header: "Variance", cell: (info) => info.getValue() == null ? "—" : String(info.getValue()) },
    { id: "currency_code", accessorKey: "currency_code", header: "Currency", cell: (info) => info.getValue() == null ? "—" : String(info.getValue()) },
    { id: "status", accessorKey: "status", header: "Status", cell: ({ row }) => <Badge color={statusBadgeColor(row.original.status)}>{row.original.status}</Badge> },
    { id: "assigned_to_user_id", accessorKey: "assigned_to_user_id", header: "Assigned user", cell: (info) => info.getValue() == null ? "—" : String(info.getValue()) },
    { id: "detected_at", accessorKey: "detected_at", header: "Detected", cell: (info) => String(info.getValue()) },
    { id: "due_date", accessorKey: "due_date", header: "Due date", cell: (info) => info.getValue() == null ? "—" : String(info.getValue()) },
    {
      id: "actions",
      header: "Actions",
      isRowAction: true,
      cell: ({ row }) => (
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="subtle" leftSection={<IconEye size={14} />} onClick={(event) => { event.stopPropagation(); selectRow(row.original); }}>
            View
          </Button>
          {canMutate && (row.original.status === "OPEN" || row.original.status === "ASSIGNED") ? (
            <Button size="xs" variant="light" leftSection={<IconUserCheck size={14} />} onClick={(event) => openAssignReview(row.original, event)}>
              Assign
            </Button>
          ) : null}
          {canMutate && row.original.status === "ASSIGNED" ? (
            <>
              <Button size="xs" variant="light" color="green" leftSection={<IconChecks size={14} />} onClick={(event) => openResolveReview(row.original, "RESOLVED", event)}>
                Resolve
              </Button>
              <Button size="xs" variant="light" color="gray" leftSection={<IconX size={14} />} onClick={(event) => openResolveReview(row.original, "DISMISSED", event)}>
                Dismiss
              </Button>
            </>
          ) : null}
        </Group>
      ),
    },
  ], [canMutate, openAssignReview, openResolveReview, selectRow]);

  if (!canRead) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>AP Exception Worklist</Title>
        <Alert color="red" icon={<IconAlertCircle size={16} />}>Access denied: accounting.journals.ANALYZE or purchasing.suppliers.ANALYZE is required.</Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="md">
      <Group justify="space-between" align="center">
        <div>
          <Title order={2}>AP Exception Worklist</Title>
          <Text size="sm" c="dimmed">Review AP reconciliation variances, mismatches, disputes, and duplicate exceptions from the current accounting backend.</Text>
        </div>
        <Badge variant="light" color="blue">accounting.ap-exceptions</Badge>
      </Group>

      {successMessage ? <Alert color="green" onClose={() => setSuccessMessage(null)} withCloseButton>{successMessage}</Alert> : null}
      {mutationError && !assignOpen && !resolveOpen ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{mutationError}</Alert> : null}
      {highlightId != null && !highlightedLoaded && !worklistQuery.isLoading ? (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>Highlighted AP exception #{highlightId} is not in the loaded worklist. The link may be stale or filtered out.</Alert>
      ) : null}
      {!canMutate ? <Alert color="blue">Assign, resolve, and dismiss require accounting.journals.UPDATE.</Alert> : null}

      <ApExceptionFilters filters={filters} onChange={updateFilters} onRefresh={() => void worklistQuery.refetch()} loading={worklistQuery.isFetching} />

      {worklistQuery.error ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{formatApExceptionApiError(worklistQuery.error)}</Alert> : null}

      <Card withBorder radius="md" p="md">
        <EntityTable
          entityName="AP exceptions"
          columns={columns}
          data={exceptions}
          getRowId={(exception) => String(exception.id)}
          loading={worklistQuery.isLoading ? "loading" : worklistQuery.isFetching ? "refreshing" : "idle"}
          totalCount={worklistQuery.data?.total ?? exceptions.length}
          pagination={{ page: 1, pageSize: filters.limit }}
          onPaginationChange={(next) => updateFilters({ limit: next.pageSize })}
          selection={highlightId && highlightedLoaded ? { [String(highlightId)]: true } : {}}
          onRowClick={selectRow}
          rowAriaLabel={(exception) => `Open AP exception ${exception.exception_key}`}
          emptyState="All AP accounts reconciled"
          data-testid="ap-exceptions-table"
          columnVisibility={{
            storageKey: "jurnapod.ap-exceptions.columns.v1",
            version: 1,
            defaultVisibleColumnIds: ["type", "source", "supplier_id", "variance_amount", "currency_code", "status", "assigned_to_user_id", "detected_at", "due_date", "actions"],
            essentialColumnIds: ["type", "source", "status", "actions"],
          }}
        />
        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">Total {worklistQuery.data?.total ?? 0}{cursor ? ` · cursor ${cursor}` : ""}</Text>
          <Group>
            {cursor ? <Button variant="subtle" onClick={() => setCursor(null)}>First page</Button> : null}
            <Button
              variant="light"
              rightSection={<IconRefresh size={14} />}
              disabled={!worklistQuery.data?.has_more || !worklistQuery.data.next_cursor}
              onClick={() => setCursor(worklistQuery.data?.next_cursor ?? null)}
            >
              Load next
            </Button>
          </Group>
        </Group>
      </Card>

      <ApExceptionDetailPanel opened={detailOpen} exception={selectedException} onClose={closeDetail} />
      <AssignExceptionModal opened={assignOpen} exception={actionException} submitting={assignMutation.isPending} submitError={mutationError} onClose={closeAssign} onSubmit={submitAssign} />
      <ResolveExceptionModal opened={resolveOpen} exception={actionException} action={resolveAction} submitting={resolveMutation.isPending} submitError={mutationError} onClose={closeResolve} onSubmit={submitResolve} />
    </Stack>
  );
}

export { fetchApExceptionWorklist, assignApException, resolveApException, buildApExceptionWorklistSearchParams } from "./api";
export type { ApException, ApExceptionWorklistParams, ApExceptionWorklistResult } from "./types";
