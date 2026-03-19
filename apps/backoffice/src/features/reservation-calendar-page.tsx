// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import type {
  OutletTableResponse,
  ReservationCreateRequest,
  ReservationRow,
  ReservationStatus,
  ReservationUpdateRequest
} from "@jurnapod/shared";
import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import type { SessionUser } from "../lib/session";
import { useOutletsFull } from "../hooks/use-outlets";
import { useOutletTables } from "../hooks/use-outlet-tables";
import { createReservation, updateReservation } from "../hooks/use-reservations";
import {
  buildDailyUtilization,
  getReservationEndAt,
  isReservationFinalStatus,
  type ReservationCalendarViewMode,
  useReservationCalendar
} from "../hooks/use-reservation-calendar";

type ReservationCalendarPageProps = {
  user: SessionUser;
  accessToken: string;
};

type ReservationFormState = {
  tableId: number | null;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  reservationAt: Date | null;
  durationMinutes: number;
  notes: string;
};

type ReservationFormMode = "create" | "edit";

type ReservationFormExecutionResult = {
  ok: boolean;
  successMessage?: string;
  errorMessage?: string;
};

type ReservationStatusExecutionResult = {
  ok: boolean;
  status?: ReservationStatus;
  successMessage?: string;
  errorMessage?: string;
};

const STATUS_BADGE_COLORS: Record<ReservationStatus, string> = {
  BOOKED: "blue",
  CONFIRMED: "cyan",
  ARRIVED: "yellow",
  SEATED: "green",
  COMPLETED: "gray",
  CANCELLED: "red",
  NO_SHOW: "orange"
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  BOOKED: "Booked",
  CONFIRMED: "Confirmed",
  ARRIVED: "Arrived",
  SEATED: "Seated",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show"
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value,
  label
}));

const emptyFormState: ReservationFormState = {
  tableId: null,
  customerName: "",
  customerPhone: "",
  guestCount: 2,
  reservationAt: null,
  durationMinutes: 120,
  notes: ""
};

function toDatetimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDatetimeLocalValue(value: string): Date | null {
  if (!value.includes("T")) {
    return null;
  }

  const [datePart, timePart] = value.split("T");
  const [yearRaw, monthRaw, dayRaw] = datePart.split("-");
  const [hoursRaw, minutesRaw] = timePart.split(":");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if ([year, month, day, hours, minutes].some((valuePart) => Number.isNaN(valuePart))) {
    return null;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export async function executeReservationFormAction(input: {
  mode: ReservationFormMode;
  selectedOutletId: number | null;
  editingReservationId: number | null;
  formState: ReservationFormState;
  accessToken: string;
  createReservationFn?: (data: ReservationCreateRequest, accessToken: string) => Promise<ReservationRow>;
  updateReservationFn?: (reservationId: number, data: ReservationUpdateRequest, accessToken: string) => Promise<ReservationRow>;
  refetchCalendar: () => Promise<unknown>;
  refetchTables: () => Promise<unknown>;
}): Promise<ReservationFormExecutionResult> {
  if (!input.selectedOutletId) {
    return { ok: false, errorMessage: "Select an outlet before saving reservation." };
  }
  if (!input.formState.customerName.trim()) {
    return { ok: false, errorMessage: "Customer name is required." };
  }
  if (!input.formState.reservationAt) {
    return { ok: false, errorMessage: "Reservation date/time is required." };
  }

  const payload: ReservationCreateRequest = {
    outlet_id: input.selectedOutletId,
    table_id: input.formState.tableId,
    customer_name: input.formState.customerName.trim(),
    customer_phone: input.formState.customerPhone.trim() || null,
    guest_count: Math.max(1, Math.round(input.formState.guestCount)),
    reservation_at: input.formState.reservationAt.toISOString(),
    duration_minutes: Math.max(15, Math.round(input.formState.durationMinutes)),
    notes: input.formState.notes.trim() || null
  };

  const createFn = input.createReservationFn ?? createReservation;
  const updateFn = input.updateReservationFn ?? updateReservation;

  try {
    if (input.mode === "create") {
      await createFn(payload, input.accessToken);
    } else if (input.editingReservationId) {
      await updateFn(
        input.editingReservationId,
        {
          table_id: payload.table_id,
          customer_name: payload.customer_name,
          customer_phone: payload.customer_phone,
          guest_count: payload.guest_count,
          reservation_at: payload.reservation_at,
          duration_minutes: payload.duration_minutes,
          notes: payload.notes
        },
        input.accessToken
      );
    } else {
      return { ok: false, errorMessage: "Cannot edit reservation: missing reservation id." };
    }

    await Promise.all([input.refetchCalendar(), input.refetchTables()]);
    return { ok: true, successMessage: input.mode === "create" ? "Reservation created." : "Reservation updated." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save reservation";
    return { ok: false, errorMessage: message };
  }
}

export function getCheckInTargetStatus(status: ReservationStatus): ReservationStatus | null {
  if (status === "BOOKED" || status === "CONFIRMED") {
    return "ARRIVED";
  }
  if (status === "ARRIVED") {
    return "SEATED";
  }
  return null;
}

export async function executeReservationStatusAction(input: {
  row: ReservationRow;
  status: ReservationStatus;
  accessToken: string;
  updateReservationFn?: (reservationId: number, data: ReservationUpdateRequest, accessToken: string) => Promise<ReservationRow>;
  refetchCalendar: () => Promise<unknown>;
  refetchTables: () => Promise<unknown>;
}): Promise<ReservationStatusExecutionResult> {
  const updateFn = input.updateReservationFn ?? updateReservation;
  try {
    await updateFn(input.row.reservation_id, { status: input.status }, input.accessToken);
    await Promise.all([input.refetchCalendar(), input.refetchTables()]);
    return {
      ok: true,
      status: input.status,
      successMessage: `Reservation ${input.row.customer_name} set to ${STATUS_LABELS[input.status]}.`
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update reservation status";
    return { ok: false, errorMessage: message };
  }
}

export function buildReminderActionNotice(customerName: string): { notice: string; success: string } {
  return {
    notice: `Reminder noted for ${customerName}. Outbound reminder channel is not configured yet.`,
    success: "Reminder action recorded."
  };
}

export function getSuggestedTableOptions(input: {
  tables: OutletTableResponse[];
  reservations: ReservationRow[];
  guestCount: number;
  reservationAt: Date | null;
  durationMinutes: number;
  editingReservationId?: number | null;
}): Array<{ value: string; label: string }> {
  const requestedStartAt = input.reservationAt?.getTime();
  const requestedEndAt =
    requestedStartAt !== undefined
      ? requestedStartAt + Math.max(15, input.durationMinutes) * 60 * 1000
      : undefined;

  return input.tables
    .filter((table) => table.status !== "UNAVAILABLE")
    .filter((table) => (table.capacity ?? 0) >= Math.max(1, input.guestCount))
    .filter((table) => {
      if (requestedStartAt === undefined || requestedEndAt === undefined) {
        return true;
      }

      const hasConflict = input.reservations.some((reservation) => {
        if (reservation.reservation_id === input.editingReservationId) {
          return false;
        }
        if (!reservation.table_id || reservation.table_id !== table.id) {
          return false;
        }
        if (isReservationFinalStatus(reservation.status)) {
          return false;
        }

        const existingStart = new Date(reservation.reservation_at).getTime();
        const existingEnd = getReservationEndAt(reservation).getTime();
        return requestedStartAt < existingEnd && existingStart < requestedEndAt;
      });

      return !hasConflict;
    })
    .map((table) => ({
      value: table.id.toString(),
      label: `${table.code} - ${table.name} (${table.zone || "No zone"})`
    }));
}

function createFormFromReservation(row: ReservationRow): ReservationFormState {
  return {
    tableId: row.table_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? "",
    guestCount: row.guest_count,
    reservationAt: new Date(row.reservation_at),
    durationMinutes: row.duration_minutes ?? 120,
    notes: row.notes ?? ""
  };
}

function formatTimeRange(row: ReservationRow): string {
  const start = new Date(row.reservation_at);
  const end = getReservationEndAt(row);
  return `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

export function ReservationCalendarPage(props: ReservationCalendarPageProps) {
  const { user, accessToken } = props;
  const [selectedOutletId, setSelectedOutletId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ReservationCalendarViewMode>("week");
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<ReservationFormMode>("create");
  const [editingReservationId, setEditingReservationId] = useState<number | null>(null);
  const [formState, setFormState] = useState<ReservationFormState>(emptyFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [detailReservation, setDetailReservation] = useState<ReservationRow | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  const touchStartX = useRef<number | null>(null);

  const outlets = useOutletsFull(user.company_id, accessToken);
  const outletTables = useOutletTables(selectedOutletId, accessToken);
  const calendar = useReservationCalendar({
    outletId: selectedOutletId,
    anchorDate,
    viewMode,
    status: statusFilter,
    accessToken
  });

  useEffect(() => {
    if (selectedOutletId || outlets.loading || outlets.data.length === 0) {
      return;
    }
    const firstOutletId = Number(outlets.data[0]?.id ?? 0);
    if (firstOutletId > 0) {
      setSelectedOutletId(firstOutletId);
    }
  }, [outlets.loading, outlets.data, selectedOutletId]);

  const filteredReservationsByDay = useMemo(() => {
    if (!searchTerm.trim()) {
      return calendar.reservationsByDay;
    }
    const lowered = searchTerm.toLowerCase();
    return Object.fromEntries(
      Object.entries(calendar.reservationsByDay).map(([dayKey, rows]) => [
        dayKey,
        rows.filter(
          (row) =>
            row.customer_name.toLowerCase().includes(lowered) ||
            (row.customer_phone ?? "").toLowerCase().includes(lowered)
        )
      ])
    );
  }, [calendar.reservationsByDay, searchTerm]);

  const availableTables = useMemo(
    () => outletTables.data.filter((table) => table.status !== "UNAVAILABLE").length,
    [outletTables.data]
  );

  const dailyUtilization = useMemo(
    () => buildDailyUtilization(calendar.days, filteredReservationsByDay, availableTables),
    [calendar.days, filteredReservationsByDay, availableTables]
  );

  const suggestedTableOptions = useMemo(
    () =>
      getSuggestedTableOptions({
        tables: outletTables.data,
        reservations: calendar.reservations,
        guestCount: formState.guestCount,
        reservationAt: formState.reservationAt,
        durationMinutes: formState.durationMinutes,
        editingReservationId
      }),
    [
      outletTables.data,
      calendar.reservations,
      formState.guestCount,
      formState.reservationAt,
      formState.durationMinutes,
      editingReservationId
    ]
  );

  const changePeriod = useCallback(
    (direction: -1 | 1) => {
      const step = viewMode === "week" ? 7 : 1;
      const next = new Date(anchorDate);
      next.setDate(next.getDate() + direction * step);
      setAnchorDate(next);
    },
    [anchorDate, viewMode]
  );

  const openCreateModal = useCallback(() => {
    setFormMode("create");
    setEditingReservationId(null);
    setFormState({
      ...emptyFormState,
      reservationAt: new Date(anchorDate)
    });
    setFormError(null);
    setFormOpen(true);
  }, [anchorDate]);

  const openEditModal = useCallback((row: ReservationRow) => {
    setFormMode("edit");
    setEditingReservationId(row.reservation_id);
    setFormState(createFormFromReservation(row));
    setFormError(null);
    setFormOpen(true);
  }, []);

  const closeFormModal = useCallback(() => {
    setFormOpen(false);
    setFormError(null);
    setEditingReservationId(null);
  }, []);

  const submitForm = useCallback(async () => {
    setSubmitting(true);
    setFormError(null);
    setActionError(null);
    setActionSuccess(null);

    const result = await executeReservationFormAction({
      mode: formMode,
      selectedOutletId,
      editingReservationId,
      formState,
      accessToken,
      refetchCalendar: calendar.refetch,
      refetchTables: outletTables.refetch
    });

    if (result.ok) {
      setActionSuccess(result.successMessage ?? null);
      closeFormModal();
    } else {
      setFormError(result.errorMessage ?? "Failed to save reservation");
    }

    setSubmitting(false);
  }, [
    accessToken,
    calendar,
    closeFormModal,
    editingReservationId,
    formMode,
    formState,
    outletTables,
    selectedOutletId
  ]);

  const updateReservationStatus = useCallback(
    async (row: ReservationRow, status: ReservationStatus) => {
      setUpdatingStatusId(row.reservation_id);
      setActionError(null);
      setActionSuccess(null);
      setReminderNotice(null);
      const result = await executeReservationStatusAction({
        row,
        status,
        accessToken,
        refetchCalendar: calendar.refetch,
        refetchTables: outletTables.refetch
      });

      if (result.ok && result.status) {
        const nextStatus = result.status;
        setActionSuccess(result.successMessage ?? null);
        setDetailReservation((current) =>
          current && current.reservation_id === row.reservation_id ? { ...current, status: nextStatus } : current
        );
      } else {
        setActionError(result.errorMessage ?? "Failed to update reservation status");
      }

      setUpdatingStatusId(null);
    },
    [accessToken, calendar, outletTables]
  );

  const handleSendReminder = useCallback((row: ReservationRow) => {
    const reminder = buildReminderActionNotice(row.customer_name);
    setReminderNotice(reminder.notice);
    setActionSuccess(reminder.success);
  }, []);

  return (
    <Stack gap="md">
      <PageCard
        title="Reservation Calendar"
        description="Plan reservations and spot busy periods"
        actions={
          <Button onClick={openCreateModal} disabled={!selectedOutletId}>
            New Reservation
          </Button>
        }
      >
        <Stack gap="sm">
          <FilterBar>
            <Select
              label="Outlet"
              placeholder="Select outlet"
              data={outlets.data.map((outlet) => ({
                value: outlet.id.toString(),
                label: `${outlet.code} - ${outlet.name}`
              }))}
              value={selectedOutletId?.toString() ?? null}
              onChange={(value) => setSelectedOutletId(value ? Number(value) : null)}
              clearable
            />

            <DatePickerInput
              label="Anchor Date"
              value={anchorDate}
              onChange={(value) => {
                if (value instanceof Date) {
                  setAnchorDate(value);
                }
              }}
            />

            <div>
              <Text size="sm" fw={500} mb={6}>
                View
              </Text>
              <SegmentedControl
                value={viewMode}
                onChange={(value) => setViewMode(value as ReservationCalendarViewMode)}
                data={[
                  { value: "day", label: "Day" },
                  { value: "week", label: "Week" }
                ]}
              />
            </div>

            <Select
              label="Status"
              placeholder="All statuses"
              data={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(value) => setStatusFilter((value as ReservationStatus | null) ?? null)}
              clearable
            />

            <TextInput
              label="Search"
              placeholder="Customer name or phone"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
            />
          </FilterBar>

          <Group>
            <Button variant="default" onClick={() => changePeriod(-1)}>
              Prev
            </Button>
            <Button variant="default" onClick={() => setAnchorDate(new Date())}>
              Today
            </Button>
            <Button variant="default" onClick={() => changePeriod(1)}>
              Next
            </Button>
          </Group>

          {actionError && (
            <Alert color="red" title="Error">
              {actionError}
            </Alert>
          )}
          {actionSuccess && (
            <Alert color="green" title="Success">
              {actionSuccess}
            </Alert>
          )}
          {reminderNotice && (
            <Alert color="blue" title="Reminder">
              {reminderNotice}
            </Alert>
          )}
          {calendar.error && (
            <Alert color="red" title="Calendar Error">
              {calendar.error}
            </Alert>
          )}
          {!selectedOutletId && (
            <Alert color="blue" title="Select Outlet">
              Please select an outlet to view reservation calendar.
            </Alert>
          )}
        </Stack>
      </PageCard>

      {selectedOutletId && (
        <PageCard title={viewMode === "week" ? "Weekly Calendar" : "Daily Calendar"}>
          <Stack
            gap="md"
            onTouchStart={(event) => {
              touchStartX.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = touchStartX.current;
              const endX = event.changedTouches[0]?.clientX;
              if (startX === null || endX === undefined) {
                return;
              }

              const deltaX = endX - startX;
              if (Math.abs(deltaX) < 40) {
                return;
              }

              changePeriod(deltaX < 0 ? 1 : -1);
            }}
          >
            {calendar.loading ? <Text c="dimmed">Loading reservations...</Text> : null}

            <SimpleGrid cols={{ base: 1, md: viewMode === "week" ? 2 : 1, xl: viewMode === "week" ? 4 : 1 }} spacing="sm">
              {calendar.days.map((day) => {
                const rows = filteredReservationsByDay[day.key] ?? [];
                const utilization = dailyUtilization.find((entry) => entry.dayKey === day.key);
                const booked = utilization?.bookedTables ?? 0;
                const available = Math.max(1, utilization?.availableTables ?? 0);
                const percent = Math.min(100, Math.round((booked / available) * 100));

                return (
                  <Card key={day.key} withBorder>
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={600}>{day.label}</Text>
                        <Text size="xs" c="dimmed">
                          {rows.length} reservation{rows.length === 1 ? "" : "s"}
                        </Text>
                      </Group>

                      <Text size="xs" c="dimmed">
                        Booked {booked} / {utilization?.availableTables ?? 0} tables
                      </Text>
                      <Progress value={percent} color={percent >= 80 ? "red" : percent >= 50 ? "yellow" : "green"} size="sm" />

                      {rows.length === 0 ? (
                        <Text c="dimmed" size="sm">
                          No reservations
                        </Text>
                      ) : (
                        rows.map((row) => {
                          const isOverlap = calendar.overlappingReservationIds.has(row.reservation_id);
                          const tableLabel = row.table_id ? `Table #${row.table_id}` : "No table";

                          return (
                            <Button
                              key={row.reservation_id}
                              variant="light"
                              color={isOverlap ? "orange" : "blue"}
                              styles={{
                                root: {
                                  justifyContent: "space-between",
                                  height: "auto",
                                  paddingTop: 8,
                                  paddingBottom: 8,
                                  borderWidth: isOverlap ? 1 : 0,
                                  borderStyle: "solid",
                                  borderColor: isOverlap ? "var(--mantine-color-orange-5)" : undefined
                                },
                                label: {
                                  width: "100%"
                                }
                              }}
                              onClick={() => {
                                setDetailReservation(row);
                                setReminderNotice(null);
                              }}
                            >
                              <Stack gap={2} style={{ width: "100%" }}>
                                <Group justify="space-between" wrap="nowrap" gap="xs">
                                  <Text size="sm" fw={600} lineClamp={1}>
                                    {row.customer_name}
                                  </Text>
                                  <Badge color={STATUS_BADGE_COLORS[row.status]} variant="light" size="xs">
                                    {STATUS_LABELS[row.status]}
                                  </Badge>
                                </Group>
                                <Text size="xs" c="dimmed">
                                  {formatTimeRange(row)} · {row.guest_count} guests · {tableLabel}
                                </Text>
                              </Stack>
                            </Button>
                          );
                        })
                      )}
                    </Stack>
                  </Card>
                );
              })}
            </SimpleGrid>
          </Stack>
        </PageCard>
      )}

      <Modal
        opened={formOpen}
        onClose={closeFormModal}
        title={<Title order={4}>{formMode === "create" ? "Create Reservation" : "Edit Reservation"}</Title>}
        centered
        size="md"
      >
        <Stack gap="md">
          {formError && (
            <Alert color="red" title="Cannot save">
              {formError}
            </Alert>
          )}

          <TextInput
            label="Customer Name"
            value={formState.customerName}
            onChange={(event) => setFormState((current) => ({ ...current, customerName: event.currentTarget.value }))}
            required
          />

          <TextInput
            label="Customer Phone"
            value={formState.customerPhone}
            onChange={(event) => setFormState((current) => ({ ...current, customerPhone: event.currentTarget.value }))}
          />

          <NumberInput
            label="Party Size"
            value={formState.guestCount}
            min={1}
            max={100}
            onChange={(value) =>
              setFormState((current) => ({
                ...current,
                guestCount: typeof value === "number" ? value : current.guestCount
              }))
            }
            required
          />

          <TextInput
            label="Reservation Date & Time"
            type="datetime-local"
            value={formState.reservationAt ? toDatetimeLocalValue(formState.reservationAt) : ""}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                reservationAt: parseDatetimeLocalValue(event.currentTarget.value)
              }))
            }
            required
          />

          <NumberInput
            label="Duration (minutes)"
            value={formState.durationMinutes}
            min={15}
            max={480}
            onChange={(value) =>
              setFormState((current) => ({
                ...current,
                durationMinutes: typeof value === "number" ? value : current.durationMinutes
              }))
            }
          />

          <Select
            label="Suggested Table"
            placeholder="Pick available table"
            data={suggestedTableOptions}
            value={formState.tableId?.toString() ?? null}
            onChange={(value) => setFormState((current) => ({ ...current, tableId: value ? Number(value) : null }))}
            clearable
          />

          <Textarea
            label="Notes"
            value={formState.notes}
            onChange={(event) => setFormState((current) => ({ ...current, notes: event.currentTarget.value }))}
            rows={3}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={closeFormModal}>
              Cancel
            </Button>
            <Button onClick={() => void submitForm()} loading={submitting}>
              {formMode === "create" ? "Create" : "Save"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={detailReservation !== null}
        onClose={() => setDetailReservation(null)}
        title={<Title order={4}>Reservation Detail</Title>}
        centered
        size="md"
      >
        {detailReservation ? (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>{detailReservation.customer_name}</Text>
              <Badge color={STATUS_BADGE_COLORS[detailReservation.status]}>
                {STATUS_LABELS[detailReservation.status]}
              </Badge>
            </Group>
            <Text size="sm">Time: {formatTimeRange(detailReservation)}</Text>
            <Text size="sm">Guests: {detailReservation.guest_count}</Text>
            <Text size="sm">Table: {detailReservation.table_id ? `#${detailReservation.table_id}` : "Not assigned"}</Text>
            {detailReservation.notes && <Text size="sm">Notes: {detailReservation.notes}</Text>}

            <Group justify="space-between" mt="sm" wrap="wrap">
              <Button
                variant="default"
                onClick={() => openEditModal(detailReservation)}
                disabled={isReservationFinalStatus(detailReservation.status)}
              >
                Edit
              </Button>
              <Button
                color="red"
                variant="light"
                loading={updatingStatusId === detailReservation.reservation_id}
                disabled={isReservationFinalStatus(detailReservation.status)}
                onClick={() => void updateReservationStatus(detailReservation, "CANCELLED")}
              >
                Cancel
              </Button>
              <Button
                variant="light"
                loading={updatingStatusId === detailReservation.reservation_id}
                disabled={getCheckInTargetStatus(detailReservation.status) === null}
                onClick={() => {
                  const nextStatus = getCheckInTargetStatus(detailReservation.status);
                  if (nextStatus) {
                    void updateReservationStatus(detailReservation, nextStatus);
                  }
                }}
              >
                Check In
              </Button>
              <Button variant="light" color="blue" onClick={() => handleSendReminder(detailReservation)}>
                Send Reminder
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
