// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  NumberInput,
  Textarea,
  Badge
} from "@mantine/core";
// Note: Using TextInput for datetime until @mantine/dates is installed
import { DataTable } from "../components/DataTable";
import { PageCard } from "../components/PageCard";
import { FilterBar } from "../components/FilterBar";
import type { SessionUser } from "../lib/session";
import { useOutletsFull } from "../hooks/use-outlets";
import { useOutletTables } from "../hooks/use-outlet-tables";
import {
  useReservations,
  createReservation,
  updateReservation,
  cancelReservation
} from "../hooks/use-reservations";
import type { ColumnDef } from "@tanstack/react-table";
import type { OutletTableResponse, ReservationRow, ReservationStatus } from "@jurnapod/shared";

type ReservationsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | null;

interface FormData {
  table_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  guest_count: number;
  reservation_at: Date | null;
  duration_minutes: number | null;
  notes: string | null;
}

const emptyForm: FormData = {
  table_id: null,
  customer_name: "",
  customer_phone: null,
  guest_count: 2,
  reservation_at: null,
  duration_minutes: 120,
  notes: null
};

const STATUS_OPTIONS: Array<{ value: ReservationStatus; label: string; color: string }> = [
  { value: "BOOKED", label: "Booked", color: "blue" },
  { value: "CONFIRMED", label: "Confirmed", color: "cyan" },
  { value: "ARRIVED", label: "Arrived", color: "yellow" },
  { value: "SEATED", label: "Seated", color: "green" },
  { value: "COMPLETED", label: "Completed", color: "gray" },
  { value: "CANCELLED", label: "Cancelled", color: "red" },
  { value: "NO_SHOW", label: "No Show", color: "orange" }
];

const STATUS_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  BOOKED: ["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
  ARRIVED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

const FINAL_STATUSES: ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

function formatDateTimeLocalInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocalInput(value: string): Date | null {
  if (!value) {
    return null;
  }

  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = datePart.split("-");
  const [hourRaw, minuteRaw] = timePart.split(":");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function ReservationsPage(props: ReservationsPageProps) {
  const { user, accessToken } = props;
  const isSuperAdminOrOwner =
    user.global_roles.includes("SUPER_ADMIN") || user.global_roles.includes("OWNER");
  const userCompanyId = user.company_id;

  // Selected outlet filter
  const [selectedOutletId, setSelectedOutletId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | null>(null);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingReservation, setEditingReservation] = useState<ReservationRow | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [statusUpdatingReservationId, setStatusUpdatingReservationId] = useState<number | null>(
    null
  );
  const [tableAssigningReservationId, setTableAssigningReservationId] = useState<number | null>(
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
  const reservations = useReservations(
    selectedOutletId ? { outlet_id: selectedOutletId, status: statusFilter || undefined } : null,
    accessToken
  );

  // Search/filter
  const [searchTerm, setSearchTerm] = useState("");

  // Filter reservations by search
  const filteredReservations = useMemo(() => {
    if (!searchTerm.trim()) return reservations.data;
    const term = searchTerm.toLowerCase();
    return reservations.data.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(term) ||
        (r.customer_phone && r.customer_phone.toLowerCase().includes(term))
    );
  }, [reservations.data, searchTerm]);

  const tableById = useMemo(() => {
    const map = new Map<number, OutletTableResponse>();
    for (const table of tables.data) {
      map.set(table.id, table);
    }
    return map;
  }, [tables.data]);

  const assignableTableOptions = useMemo(
    () =>
      tables.data
        .filter((table) => table.status !== "OCCUPIED" && table.status !== "UNAVAILABLE")
        .map((table) => ({
          value: table.id.toString(),
          label: `${table.code} - ${table.name} (${table.zone || "No zone"})`
        })),
    [tables.data]
  );

  // Close dialog helper
  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setEditingReservation(null);
    setFormData(emptyForm);
    setFormErrors({});
  }, []);

  // Open create dialog
  const openCreateDialog = useCallback(() => {
    if (!selectedOutletId) {
      setError("Please select an outlet first");
      return;
    }
    setFormData(emptyForm);
    setFormErrors({});
    setDialogMode("create");
  }, [selectedOutletId]);

  // Open edit dialog
  const openEditDialog = useCallback((reservation: ReservationRow) => {
    setEditingReservation(reservation);
    setFormData({
      table_id: reservation.table_id,
      customer_name: reservation.customer_name,
      customer_phone: reservation.customer_phone,
      guest_count: reservation.guest_count,
      reservation_at: new Date(reservation.reservation_at),
      duration_minutes: reservation.duration_minutes,
      notes: reservation.notes
    });
    setFormErrors({});
    setDialogMode("edit");
  }, []);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.customer_name.trim()) {
      errors.customer_name = "Customer name is required";
    }
    if (formData.guest_count < 1) {
      errors.guest_count = "Guest count must be at least 1";
    }
    if (!formData.reservation_at) {
      errors.reservation_at = "Reservation date/time is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    if (!selectedOutletId) {
      setError("No outlet selected");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (dialogMode === "create") {
        await createReservation(
          {
            outlet_id: selectedOutletId,
            table_id: formData.table_id || undefined,
            customer_name: formData.customer_name.trim(),
            customer_phone: formData.customer_phone?.trim() || null,
            guest_count: formData.guest_count,
            reservation_at: formData.reservation_at!.toISOString(),
            duration_minutes: formData.duration_minutes || undefined,
            notes: formData.notes?.trim() || null
          },
          accessToken
        );
        setSuccessMessage("Reservation created successfully");
      } else if (dialogMode === "edit" && editingReservation) {
        await updateReservation(
          editingReservation.reservation_id,
          {
            table_id: formData.table_id || undefined,
            customer_name: formData.customer_name.trim(),
            customer_phone: formData.customer_phone?.trim() || null,
            guest_count: formData.guest_count,
            reservation_at: formData.reservation_at!.toISOString(),
            duration_minutes: formData.duration_minutes || undefined,
            notes: formData.notes?.trim() || null
          },
          accessToken
        );
        setSuccessMessage("Reservation updated successfully");
      }

      await reservations.refetch();
      closeDialog();
    } catch (e: any) {
      setError(e.message || "Failed to save reservation");
    } finally {
      setSubmitting(false);
    }
  }, [
    dialogMode,
    formData,
    editingReservation,
    selectedOutletId,
    accessToken,
    validateForm,
    reservations,
    closeDialog
  ]);

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

  const handleAssignTable = useCallback(
    async (reservation: ReservationRow, nextTableId: number | null) => {
      setTableAssigningReservationId(reservation.reservation_id);
      setError(null);

      try {
        await updateReservation(
          reservation.reservation_id,
          {
            table_id: nextTableId
          },
          accessToken
        );
        setSuccessMessage("Reservation table assignment updated");
        await Promise.all([reservations.refetch(), tables.refetch()]);
      } catch (e: any) {
        setError(e.message || "Failed to assign table");
      } finally {
        setTableAssigningReservationId(null);
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
          <Stack gap={0}>
            <Text fw={600}>{info.row.original.customer_name}</Text>
            {info.row.original.customer_phone && (
              <Text size="xs" c="dimmed">
                {info.row.original.customer_phone}
              </Text>
            )}
          </Stack>
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
        cell: (info) => {
          const reservation = info.row.original;
          const table = reservation.table_id ? tableById.get(reservation.table_id) : null;
          const isFinal = FINAL_STATUSES.includes(reservation.status);
          const options = reservation.table_id
            ? (() => {
                const hasCurrent = assignableTableOptions.some(
                  (option) => option.value === reservation.table_id!.toString()
                );
                if (hasCurrent) {
                  return assignableTableOptions;
                }

                const currentLabel = table
                  ? `${table.code} - ${table.name} (${table.zone || "No zone"})`
                  : `Table #${reservation.table_id}`;
                return [
                  {
                    value: reservation.table_id.toString(),
                    label: currentLabel
                  },
                  ...assignableTableOptions
                ];
              })()
            : assignableTableOptions;

          if (isFinal) {
            return <Text c="dimmed">{table ? table.code : "—"}</Text>;
          }

          return (
            <Select
              size="xs"
              placeholder="No table assigned"
              data={options}
              value={reservation.table_id?.toString() || null}
              onChange={(value) => void handleAssignTable(reservation, value ? Number(value) : null)}
              clearable
              disabled={tableAssigningReservationId === reservation.reservation_id}
            />
          );
        }
      },
      {
        id: "status",
        header: "Status",
        cell: (info) => {
          const statusConfig = STATUS_OPTIONS.find((s) => s.value === info.row.original.status);
          return (
            <Badge color={statusConfig?.color || "gray"} variant="light">
              {statusConfig?.label || info.row.original.status}
            </Badge>
          );
        }
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
              disabled={FINAL_STATUSES.includes(info.row.original.status)}
            >
              Edit
            </Button>

            {!FINAL_STATUSES.includes(info.row.original.status) &&
              STATUS_TRANSITIONS[info.row.original.status]
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

            {!FINAL_STATUSES.includes(info.row.original.status) && (
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
      tableById,
      assignableTableOptions,
      handleAssignTable,
      handleStatusTransition,
      statusUpdatingReservationId,
      tableAssigningReservationId
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
                onChange={(value) => setSelectedOutletId(value ? Number(value) : null)}
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
                onChange={(value) => setSelectedOutletId(value ? Number(value) : null)}
                clearable
              />
            )}

            <Select
              label="Status"
              placeholder="All statuses"
              data={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as ReservationStatus | null)}
              clearable
            />

            <TextInput
              label="Search"
              placeholder="Search by customer name or phone"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.currentTarget.value)}
            />
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
        <PageCard title={`Reservations (${filteredReservations.length})`}>
          {reservations.loading && <Text c="dimmed">Loading reservations...</Text>}
          {!reservations.loading && filteredReservations.length === 0 && (
            <Text c="dimmed">No reservations found. Create a new reservation to get started.</Text>
          )}
          {!reservations.loading && filteredReservations.length > 0 && (
            <DataTable
              columns={columns}
              data={filteredReservations}
              emptyState="No reservations found matching your search"
            />
          )}
        </PageCard>
      )}

      {/* Create/Edit Dialog */}
      <Modal
        opened={dialogMode !== null}
        onClose={closeDialog}
        title={
          <Title order={4}>
            {dialogMode === "create" ? "Create Reservation" : "Edit Reservation"}
          </Title>
        }
        centered
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Customer Name"
            placeholder="Enter customer name"
            value={formData.customer_name}
            onChange={(e) => setFormData({ ...formData, customer_name: e.currentTarget.value })}
            error={formErrors.customer_name}
            required
          />

          <TextInput
            label="Customer Phone"
            placeholder="Enter phone number"
            value={formData.customer_phone || ""}
            onChange={(e) =>
              setFormData({ ...formData, customer_phone: e.currentTarget.value || null })
            }
          />

          <NumberInput
            label="Number of Guests"
            placeholder="Number of guests"
            value={formData.guest_count}
            onChange={(value) =>
              setFormData({
                ...formData,
                guest_count: typeof value === "number" ? value : 1
              })
            }
            min={1}
            max={100}
            error={formErrors.guest_count}
            required
          />

          <TextInput
            label="Reservation Date & Time"
            type="datetime-local"
            placeholder="Select date and time"
            value={
              formData.reservation_at
                ? formatDateTimeLocalInput(formData.reservation_at)
                : ""
            }
            onChange={(e) =>
              setFormData({
                ...formData,
                reservation_at: parseDateTimeLocalInput(e.currentTarget.value)
              })
            }
            error={formErrors.reservation_at}
            required
          />

          <NumberInput
            label="Duration (minutes)"
            placeholder="Reservation duration"
            value={formData.duration_minutes || ""}
            onChange={(value) =>
              setFormData({
                ...formData,
                duration_minutes: typeof value === "number" ? value : null
              })
            }
            min={15}
            max={480}
          />

          <Select
            label="Table (Optional)"
            placeholder="Select a table"
            data={tables.data.map((t: any) => ({
              value: t.id.toString(),
              label: `${t.code} - ${t.name} (${t.zone || "No zone"})`
            }))}
            value={formData.table_id?.toString() || null}
            onChange={(value) => setFormData({ ...formData, table_id: value ? Number(value) : null })}
            clearable
          />

          <Textarea
            label="Notes"
            placeholder="Special requests or notes"
            value={formData.notes || ""}
            onChange={(e) => setFormData({ ...formData, notes: e.currentTarget.value || null })}
            rows={3}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {dialogMode === "create" ? "Create" : "Save"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Cancel Confirmation */}
      <Modal
        opened={cancelConfirm !== null}
        onClose={() => setCancelConfirm(null)}
        title={<Title order={4}>Confirm Cancellation</Title>}
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
