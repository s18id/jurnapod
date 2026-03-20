// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Pagination,
  Select,
  Stack,
  Text,
  TextInput,
  Badge
} from "@mantine/core";
import { DataTable } from "../components/DataTable";
import { PageCard } from "../components/PageCard";
import { FilterBar } from "../components/FilterBar";
import { ReservationFormModal } from "../components/ReservationFormModal";
import { UniversalPaginator } from "../components/UniversalPaginator";
import type { SessionUser } from "../lib/session";
import {
  isReservationFinalStatus,
  RESERVATION_STATUS_META,
  RESERVATION_STATUS_OPTIONS,
  RESERVATION_STATUS_TRANSITIONS
} from "../lib/reservation-status";
import { useOutletsFull } from "../hooks/use-outlets";
import { useOutletTables } from "../hooks/use-outlet-tables";
import {
  useReservations,
  cancelReservation,
  updateReservation
} from "../hooks/use-reservations";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReservationRow, ReservationStatus } from "@jurnapod/shared";

const PAGE_SIZE = 50;

function getThisMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return {
    dateFrom: formatDate(firstDay),
    dateTo: formatDate(lastDay)
  };
}

type ReservationsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | null;

// Memoized cell components to prevent unnecessary re-renders
interface TableCellProps {
  reservation: ReservationRow;
  tableCode: string | null;
}

const TableCell = memo(function TableCell({ reservation, tableCode }: TableCellProps) {
  const isFinal = isReservationFinalStatus(reservation.status);
  return <Text c={isFinal ? "dimmed" : undefined}>{tableCode ?? "—"}</Text>;
});

interface StatusCellProps {
  status: ReservationStatus;
}

const StatusCell = memo(function StatusCell({ status }: StatusCellProps) {
  const statusConfig = RESERVATION_STATUS_META[status];
  return (
    <Badge color={statusConfig.badgeColor} variant="light">
      {statusConfig.label}
    </Badge>
  );
});

interface CustomerCellProps {
  name: string;
  phone: string | null;
}

const CustomerCell = memo(function CustomerCell({ name, phone }: CustomerCellProps) {
  return (
    <Stack gap={0}>
      <Text fw={600}>{name}</Text>
      {phone && (
        <Text size="xs" c="dimmed">
          {phone}
        </Text>
      )}
    </Stack>
  );
});

export function ReservationsPage(props: ReservationsPageProps) {
  const { user, accessToken } = props;
  const isSuperAdminOrOwner =
    user.global_roles.includes("SUPER_ADMIN") || user.global_roles.includes("OWNER");
  const userCompanyId = user.company_id;

  // Selected outlet filter
  const [selectedOutletId, setSelectedOutletId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | null>(null);

  // Date range filter - default to this month
  const thisMonth = getThisMonthRange();
  const [dateFrom, setDateFrom] = useState<string | null>(thisMonth.dateFrom);
  const [dateTo, setDateTo] = useState<string | null>(thisMonth.dateTo);

  // Pagination
  const [page, setPage] = useState(1);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingReservation, setEditingReservation] = useState<ReservationRow | null>(null);
  const [statusUpdatingReservationId, setStatusUpdatingReservationId] = useState<number | null>(
    null
  );

  // Cancel confirmation
  const [cancelConfirm, setCancelConfirm] = useState<ReservationRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data hooks
  const outlets = useOutletsFull(userCompanyId, accessToken);
  const tables = useOutletTables(selectedOutletId, accessToken);

  // Auto-select first outlet when outlets load
  useEffect(() => {
    if (!selectedOutletId && outlets.data.length > 0) {
      setSelectedOutletId(Number(outlets.data[0].id));
    }
  }, [outlets.data, selectedOutletId]);

  // Table code lookup
  const tableCodeById = useMemo(() => {
    const map = new Map<number, string>();
    for (const table of tables.data) {
      map.set(table.id, table.code);
    }
    return map;
  }, [tables.data]);

  const reservationQuery = useMemo(
    () =>
      selectedOutletId
        ? {
            outlet_id: selectedOutletId,
            status: statusFilter || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE
          }
        : null,
    [selectedOutletId, statusFilter, dateFrom, dateTo, page]
  );
  const reservations = useReservations(reservationQuery, accessToken);

  // Listen for cross-page invalidation events
  useEffect(() => {
    const handleInvalidation = () => {
      reservations.refetch();
    };
    window.addEventListener("reservation-invalidation", handleInvalidation);
    return () => window.removeEventListener("reservation-invalidation", handleInvalidation);
  }, [reservations]);

  // Open create dialog
  const openCreateDialog = useCallback(() => {
    if (!selectedOutletId) {
      setError("Please select an outlet first");
      return;
    }
    setEditingReservation(null);
    setDialogMode("create");
  }, [selectedOutletId]);

  // Open edit dialog
  const openEditDialog = useCallback((reservation: ReservationRow) => {
    setEditingReservation(reservation);
    setDialogMode("edit");
  }, []);

  // Close dialog helper
  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setEditingReservation(null);
  }, []);

  // Handle cancel reservation
  const handleCancel = useCallback(async () => {
    if (!cancelConfirm) return;

    setCancelling(true);
    setError(null);

    try {
      await cancelReservation(cancelConfirm.reservation_id, accessToken);
      setSuccessMessage("Reservation cancelled successfully");
      await reservations.refetch();
      setCancelConfirm(null);
    } catch (e: any) {
      setError(e.message || "Failed to cancel reservation");
    } finally {
      setCancelling(false);
    }
  }, [cancelConfirm, accessToken, reservations]);

  const handleStatusTransition = useCallback(
    async (reservation: ReservationRow, nextStatus: ReservationStatus) => {
      setStatusUpdatingReservationId(reservation.reservation_id);
      setError(null);

      try {
        await updateReservation(
          reservation.reservation_id,
          {
            status: nextStatus
          },
          accessToken
        );
        setSuccessMessage(`Reservation updated to ${nextStatus.replace("_", " ")}`);
        await Promise.all([reservations.refetch(), tables.refetch()]);
      } catch (e: any) {
        setError(e.message || "Failed to update reservation status");
      } finally {
        setStatusUpdatingReservationId(null);
      }
    },
    [accessToken, reservations, tables]
  );

  // Clear success message on timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Columns definition
  const columns = useMemo<ColumnDef<ReservationRow>[]>(
    () => [
      {
        id: "customer",
        header: "Customer",
        cell: (info) => (
          <CustomerCell
            name={info.row.original.customer_name}
            phone={info.row.original.customer_phone}
          />
        )
      },
      {
        id: "datetime",
        header: "Date & Time",
        cell: (info) => (
          <Text>{new Date(info.row.original.reservation_at).toLocaleString()}</Text>
        )
      },
      {
        id: "guests",
        header: "Guests",
        cell: (info) => <Text>{info.row.original.guest_count}</Text>
      },
      {
        id: "table",
        header: "Table",
        cell: (info) => (
          <TableCell
            reservation={info.row.original}
            tableCode={info.row.original.table_id ? tableCodeById.get(info.row.original.table_id) ?? null : null}
          />
        )
      },
      {
        id: "status",
        header: "Status",
        cell: (info) => <StatusCell status={info.row.original.status} />
      },
      {
        id: "actions",
        header: "Actions",
        cell: (info) => (
          <Group gap="xs" justify="flex-end" wrap="wrap">
            <Button
              size="xs"
              variant="light"
              onClick={() => openEditDialog(info.row.original)}
              disabled={isReservationFinalStatus(info.row.original.status)}
            >
              Edit
            </Button>

            {!isReservationFinalStatus(info.row.original.status) &&
              RESERVATION_STATUS_TRANSITIONS[info.row.original.status]
                .filter((nextStatus) => nextStatus !== "CANCELLED")
                .map((nextStatus) => (
                <Button
                  key={nextStatus}
                  size="xs"
                  variant={nextStatus === "NO_SHOW" ? "outline" : "light"}
                  color={nextStatus === "NO_SHOW" ? "red" : "blue"}
                  loading={statusUpdatingReservationId === info.row.original.reservation_id}
                  onClick={() => void handleStatusTransition(info.row.original, nextStatus)}
                >
                  {nextStatus.replace("_", " ")}
                </Button>
                ))}

            {!isReservationFinalStatus(info.row.original.status) && (
              <Button
                size="xs"
                color="red"
                variant="light"
                onClick={() => setCancelConfirm(info.row.original)}
              >
                Cancel
              </Button>
            )}
          </Group>
        )
      }
    ],
    [
      openEditDialog,
      tableCodeById,
      handleStatusTransition,
      statusUpdatingReservationId
    ]
  );

  return (
    <Stack gap="md">
      <PageCard
        title="Reservations"
        description="Manage table reservations and bookings"
        actions={
          <Button onClick={openCreateDialog} disabled={!selectedOutletId}>
            Create Reservation
          </Button>
        }
      >
        <Stack gap="sm">
          <FilterBar>
            {isSuperAdminOrOwner && (
              <Select
                label="Outlet"
                placeholder="Select outlet"
                data={outlets.data.map((o: any) => ({
                  value: o.id.toString(),
                  label: `${o.code} - ${o.name}`
                }))}
                value={selectedOutletId?.toString() || null}
                onChange={(value) => {
                  setSelectedOutletId(value ? Number(value) : null);
                  setPage(1);
                }}
                clearable
              />
            )}

            {!isSuperAdminOrOwner && outlets.data.length > 0 && (
              <Select
                label="Outlet"
                placeholder="Select outlet"
                data={outlets.data.map((o: any) => ({
                  value: o.id.toString(),
                  label: `${o.code} - ${o.name}`
                }))}
                value={selectedOutletId?.toString() || null}
                onChange={(value) => {
                  setSelectedOutletId(value ? Number(value) : null);
                  setPage(1);
                }}
                clearable
              />
            )}

            <Select
              label="Status"
              placeholder="All statuses"
              data={RESERVATION_STATUS_OPTIONS}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value as ReservationStatus | null);
                setPage(1);
              }}
              clearable
            />

            <TextInput
              label="From Date"
              type="date"
              value={dateFrom || ""}
              onChange={(e) => {
                setDateFrom(e.currentTarget.value || null);
                setPage(1);
              }}
            />

            <TextInput
              label="To Date"
              type="date"
              value={dateTo || ""}
              onChange={(e) => {
                setDateTo(e.currentTarget.value || null);
                setPage(1);
              }}
            />

            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                setDateFrom(null);
                setDateTo(null);
                setPage(1);
              }}
            >
              Clear Dates
            </Button>
          </FilterBar>

          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}
          {successMessage && (
            <Alert color="green" title="Success">
              {successMessage}
            </Alert>
          )}

          {!selectedOutletId && (
            <Alert color="blue" title="Select Outlet">
              Please select an outlet to view its reservations
            </Alert>
          )}
        </Stack>
      </PageCard>

      {selectedOutletId && (
        <PageCard
          title="Reservations"
        >
          {reservations.loading && <Text c="dimmed">Loading reservations...</Text>}
          {!reservations.loading && reservations.data.length === 0 && (
            <Text c="dimmed">No reservations found. Create a new reservation to get started.</Text>
          )}
          {!reservations.loading && reservations.data.length > 0 && (
            <>
              <DataTable
                columns={columns}
                data={reservations.data}
                emptyState="No reservations found"
              />
              <UniversalPaginator
                total={reservations.total}
                pageSize={PAGE_SIZE}
                page={page}
                onPageChange={setPage}
                loading={reservations.loading}
              />
            </>
          )}
        </PageCard>
      )}

      {/* Create/Edit Reservation Modal */}
      {selectedOutletId && (
        <ReservationFormModal
          opened={dialogMode !== null}
          onClose={closeDialog}
          mode={dialogMode === "edit" ? "edit" : "create"}
          reservation={editingReservation}
          outletId={selectedOutletId}
          accessToken={accessToken}
          enableMultiTable={true}
          showTableSuggestions={true}
          defaultDurationMinutes={120}
          onSuccess={() => {
            reservations.refetch();
          }}
        />
      )}

      {/* Cancel Confirmation */}
      <Modal
        opened={cancelConfirm !== null}
        onClose={() => setCancelConfirm(null)}
        title="Confirm Cancellation"
        centered
      >
        <Stack gap="md">
          <Text>
            Cancel reservation for <strong>{cancelConfirm?.customer_name}</strong> on{" "}
            {cancelConfirm && new Date(cancelConfirm.reservation_at).toLocaleString()}?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCancelConfirm(null)}>
              Back
            </Button>
            <Button color="red" onClick={handleCancel} loading={cancelling}>
              Cancel Reservation
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
