// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { TableOccupancyStatus } from "@jurnapod/shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Textarea,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useMemo, useState } from "react";

import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import { useOutletsFull } from "../hooks/use-outlets";
import { createReservation } from "../hooks/use-reservations";
import { type TableBoardRow, useTableBoard } from "../hooks/use-table-board";
import { apiRequest } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

export type BoardStatusFilter =
  | "ALL"
  | "AVAILABLE"
  | "OCCUPIED"
  | "RESERVED"
  | "CLEANING"
  | "OUT_OF_SERVICE";
export type TableBoardAction = "HOLD" | "SEAT" | "RELEASE" | "VIEW_SESSION" | "NEW_RESERVATION";

type BoardStatusMeta = {
  key: Exclude<BoardStatusFilter, "ALL">;
  label: string;
  color: string;
};

export function getBoardStatusMeta(occupancyStatusId: number): BoardStatusMeta {
  const normalizedStatusId = Number(occupancyStatusId);

  if (normalizedStatusId === TableOccupancyStatus.AVAILABLE) {
    return { key: "AVAILABLE", label: "Available", color: "green" };
  }
  if (normalizedStatusId === TableOccupancyStatus.OCCUPIED) {
    return { key: "OCCUPIED", label: "Occupied", color: "red" };
  }
  if (normalizedStatusId === TableOccupancyStatus.RESERVED) {
    return { key: "RESERVED", label: "Reserved", color: "yellow" };
  }
  if (normalizedStatusId === TableOccupancyStatus.CLEANING) {
    return { key: "CLEANING", label: "Cleaning", color: "orange" };
  }
  if (normalizedStatusId === TableOccupancyStatus.OUT_OF_SERVICE) {
    return { key: "OUT_OF_SERVICE", label: "Out of Service", color: "gray" };
  }
  return { key: "OCCUPIED", label: "Unknown", color: "gray" };
}

export type ReservedSoonInfo = {
  startsInMinutes: number;
  startsAt: Date;
};

function normalizeTimeZone(timeZone?: string | null): string | undefined {
  if (!timeZone || timeZone.trim().length === 0) {
    return undefined;
  }
  return timeZone;
}

export function formatReservedSoonTime(startsAt: Date, timeZone?: string | null): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: normalizeTimeZone(timeZone)
  }).format(startsAt);
}

export function getReservedSoonInfo(
  nextReservationStartAt: string | null,
  thresholdMinutes = 30,
  nowMs = Date.now()
): ReservedSoonInfo | null {
  if (!nextReservationStartAt) {
    return null;
  }

  const startsAtMs = Date.parse(nextReservationStartAt);
  if (!Number.isFinite(startsAtMs)) {
    return null;
  }

  const deltaMs = startsAtMs - nowMs;
  if (deltaMs <= 0) {
    return null;
  }

  const startsInMinutes = Math.ceil(deltaMs / 60000);
  if (startsInMinutes > thresholdMinutes) {
    return null;
  }

  return {
    startsInMinutes,
    startsAt: new Date(startsAtMs)
  };
}

export function formatDateTimeLocalInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseDateTimeLocalInput(value: string): Date | null {
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

export function parseBoardTableId(tableId: string): number | null {
  const parsed = Number(tableId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function buildExpectedVersionHeaders(version: number): Record<string, string> {
  return {
    "X-Expected-Version": String(version)
  };
}

export function normalizeActionErrorMessage(message: string): string {
  return message.toLowerCase().includes("conflict") ? `${message}. Board refreshed.` : message;
}

export type TableBoardApiRequest = (
  path: string,
  init?: RequestInit,
  accessToken?: string
) => Promise<unknown>;

type ExecuteTableBoardActionInput = {
  row: TableBoardRow;
  action: "HOLD" | "SEAT" | "RELEASE";
  selectedOutletId: number | null;
  busyTableId: string | null;
  accessToken: string;
  request: TableBoardApiRequest;
  refetchBoard: () => Promise<void>;
  setBusyTableId: (value: string | null) => void;
  setActionError: (value: string | null) => void;
  setActionSuccess: (value: string | null) => void;
};

export async function executeTableBoardAction(input: ExecuteTableBoardActionInput): Promise<void> {
  const {
    row,
    action,
    selectedOutletId,
    busyTableId,
    accessToken,
    request,
    refetchBoard,
    setBusyTableId,
    setActionError,
    setActionSuccess
  } = input;

  if (!selectedOutletId) {
    setActionError("Select an outlet first.");
    return;
  }

  if (busyTableId !== null) {
    return;
  }

  setBusyTableId(row.tableId);
  setActionError(null);
  setActionSuccess(null);

  try {
    if (action === "HOLD") {
      const heldUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await request(`/dinein/tables/${row.tableId}/hold?outletId=${selectedOutletId}`, {
        method: "POST",
        headers: buildExpectedVersionHeaders(row.version),
        body: JSON.stringify({ heldUntil })
      }, accessToken);
      setActionSuccess(`Table ${row.tableCode} is now reserved.`);
    }

    if (action === "SEAT") {
      const guestCount = Math.max(1, row.guestCount ?? 1);
      await request(`/dinein/tables/${row.tableId}/seat?outletId=${selectedOutletId}`, {
        method: "POST",
        headers: buildExpectedVersionHeaders(row.version),
        body: JSON.stringify({ guestCount })
      }, accessToken);
      setActionSuccess(`Guests seated at ${row.tableCode}.`);
    }

    if (action === "RELEASE") {
      await request(`/dinein/tables/${row.tableId}/release?outletId=${selectedOutletId}`, {
        method: "POST",
        headers: buildExpectedVersionHeaders(row.version),
        body: JSON.stringify({})
      }, accessToken);
      setActionSuccess(`Table ${row.tableCode} released.`);
    }

    await refetchBoard();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Action failed";
    setActionError(normalizeActionErrorMessage(message));
    await refetchBoard();
  } finally {
    setBusyTableId(null);
  }
}

type TableZoneGroup = {
  zone: string;
  rows: TableBoardRow[];
};

export function groupTablesByZone(rows: readonly TableBoardRow[]): TableZoneGroup[] {
  const byZone = new Map<string, TableBoardRow[]>();
  for (const row of rows) {
    const zone = row.zone && row.zone.trim().length > 0 ? row.zone : "No Zone";
    const bucket = byZone.get(zone) ?? [];
    bucket.push(row);
    byZone.set(zone, bucket);
  }
  return [...byZone.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([zone, zoneRows]) => ({ zone, rows: zoneRows }));
}

type BoardFilterInput = {
  status: BoardStatusFilter;
  zone: string | null;
  minCapacity: number | null;
  maxCapacity: number | null;
  search: string;
};

export function filterBoardTables(
  rows: readonly TableBoardRow[],
  filters: BoardFilterInput
): TableBoardRow[] {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status !== "ALL") {
      if (getBoardStatusMeta(row.occupancyStatusId).key !== filters.status) {
        return false;
      }
    }

    if (filters.zone && filters.zone !== "ALL") {
      const zone = row.zone && row.zone.trim().length > 0 ? row.zone : "No Zone";
      if (zone !== filters.zone) {
        return false;
      }
    }

    if (filters.minCapacity !== null && (row.capacity ?? 0) < filters.minCapacity) {
      return false;
    }

    if (filters.maxCapacity !== null && (row.capacity ?? 0) > filters.maxCapacity) {
      return false;
    }

    if (search.length > 0) {
      const haystack = `${row.tableCode} ${row.tableName} ${row.zone ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }

    return true;
  });
}

export function getAvailableActionsForTable(row: {
  occupancyStatusId: number;
  currentSessionId: string | null;
  availableNow?: boolean;
}): TableBoardAction[] {
  const actions: TableBoardAction[] = [];
  const statusId = Number(row.occupancyStatusId);
  const allowReservationAction =
    statusId !== TableOccupancyStatus.CLEANING && statusId !== TableOccupancyStatus.OUT_OF_SERVICE;

  if (allowReservationAction) {
    actions.push("NEW_RESERVATION");
  }

  const availableNow = row.availableNow ?? statusId === TableOccupancyStatus.AVAILABLE;
  if (availableNow) {
    actions.push("HOLD", "SEAT");
  } else if (statusId === TableOccupancyStatus.OCCUPIED) {
    actions.push("RELEASE");
  } else if (statusId === TableOccupancyStatus.RESERVED) {
    actions.push("SEAT", "RELEASE");
  }

  if (row.currentSessionId) {
    actions.push("VIEW_SESSION");
  }

  return actions;
}

type TableBoardPageProps = {
  user: SessionUser;
  accessToken: string;
};

type SessionDetail = {
  id: string;
  tableCode: string;
  tableName: string;
  statusLabel: string;
  guestCount: number | null;
  startedAt: string;
  lineCount: number;
  totalAmount: number;
};

type ViewMode = "grid" | "list";

type ReservationFormData = {
  tableId: number | null;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  reservationAt: Date | null;
  durationMinutes: number;
  notes: string;
};

const reservationDefaultForm: ReservationFormData = {
  tableId: null,
  customerName: "",
  customerPhone: "",
  guestCount: 2,
  reservationAt: null,
  durationMinutes: 120,
  notes: ""
};

export function resolveSessionModalTitle(sessionDetail: SessionDetail | null): string {
  return sessionDetail ? `Session ${sessionDetail.id}` : "Session Detail";
}

export function TableBoardPage(props: TableBoardPageProps) {
  const { user, accessToken } = props;
  const [selectedOutletId, setSelectedOutletId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [status, setStatus] = useState<BoardStatusFilter>("ALL");
  const [zone, setZone] = useState<string | null>("ALL");
  const [minCapacity, setMinCapacity] = useState<number | null>(null);
  const [maxCapacity, setMaxCapacity] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [busyTableId, setBusyTableId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sessionDetailOpen, setSessionDetailOpen] = useState(false);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [reservationForm, setReservationForm] = useState<ReservationFormData>(reservationDefaultForm);
  const [reservationFormError, setReservationFormError] = useState<string | null>(null);
  const [reservationSubmitting, setReservationSubmitting] = useState(false);

  const outlets = useOutletsFull(user.company_id, accessToken);
  const board = useTableBoard(selectedOutletId, accessToken, 8000);

  const outletOptions = useMemo(
    () =>
      outlets.data.map((outlet) => ({
        value: String(outlet.id),
        label: `${outlet.code} - ${outlet.name}`
      })),
    [outlets.data]
  );

  const selectedOutletTimezone = useMemo(() => {
    if (!selectedOutletId) {
      return null;
    }
    const selectedOutlet = outlets.data.find((outlet) => outlet.id === selectedOutletId);
    return selectedOutlet?.timezone ?? null;
  }, [outlets.data, selectedOutletId]);

  const filteredRows = useMemo(
    () =>
      filterBoardTables(board.data, {
        status,
        zone,
        minCapacity,
        maxCapacity,
        search
      }),
    [board.data, status, zone, minCapacity, maxCapacity, search]
  );

  const groupedRows = useMemo(() => groupTablesByZone(filteredRows), [filteredRows]);

  const zoneOptions = useMemo(() => {
    const uniqueZones = Array.from(
      new Set(board.data.map((row) => (row.zone && row.zone.trim().length > 0 ? row.zone : "No Zone")))
    ).sort((a, b) => a.localeCompare(b));
    return [
      { value: "ALL", label: "All zones" },
      ...uniqueZones.map((value) => ({ value, label: value }))
    ];
  }, [board.data]);

  const doAction = async (row: TableBoardRow, action: "HOLD" | "SEAT" | "RELEASE") => {
    await executeTableBoardAction({
      row,
      action,
      selectedOutletId,
      busyTableId,
      accessToken,
      request: apiRequest,
      refetchBoard: board.refetch,
      setBusyTableId,
      setActionError,
      setActionSuccess
    });
  };

  const openNewReservationModal = (row: TableBoardRow) => {
    if (!selectedOutletId) {
      setActionError("Select an outlet first.");
      return;
    }

    const tableId = parseBoardTableId(row.tableId);

    const reservationSoon = getReservedSoonInfo(row.nextReservationStartAt, 30);
    const reservationAt = reservationSoon?.startsAt ?? new Date(Date.now() + 30 * 60 * 1000);

    setReservationForm({
      tableId,
      customerName: "",
      customerPhone: "",
      guestCount: Math.max(1, row.guestCount ?? 2),
      reservationAt,
      durationMinutes: 120,
      notes: ""
    });
    setReservationFormError(null);
    setActionError(null);
    setReservationModalOpen(true);
  };

  const closeReservationModal = () => {
    setReservationModalOpen(false);
    setReservationForm(reservationDefaultForm);
    setReservationFormError(null);
  };

  const submitNewReservation = async () => {
    if (reservationSubmitting) {
      return;
    }
    if (!selectedOutletId) {
      setReservationFormError("Select an outlet first.");
      return;
    }
    if (!reservationForm.customerName.trim()) {
      setReservationFormError("Customer name is required.");
      return;
    }
    if (!reservationForm.reservationAt) {
      setReservationFormError("Reservation date/time is required.");
      return;
    }
    if (reservationForm.guestCount < 1) {
      setReservationFormError("Guest count must be at least 1.");
      return;
    }

    setReservationSubmitting(true);
    setReservationFormError(null);
    setActionError(null);
    setActionSuccess(null);
    setBusyTableId("__reservation__");
    try {
      await createReservation(
        {
          outlet_id: selectedOutletId,
          table_id: reservationForm.tableId ?? undefined,
          customer_name: reservationForm.customerName.trim(),
          customer_phone: reservationForm.customerPhone.trim() || null,
          guest_count: reservationForm.guestCount,
          reservation_at: reservationForm.reservationAt.toISOString(),
          duration_minutes: reservationForm.durationMinutes || undefined,
          notes: reservationForm.notes.trim() || null
        },
        accessToken
      );
      setActionSuccess("Reservation created successfully.");
      closeReservationModal();
      await board.refetch();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create reservation";
      setReservationFormError(`${message}. Check table availability and reservation time, then retry.`);
      await board.refetch();
    } finally {
      setBusyTableId(null);
      setReservationSubmitting(false);
    }
  };

  const loadSession = async (row: TableBoardRow) => {
    if (!selectedOutletId || !row.currentSessionId) {
      return;
    }
    setSessionDetailOpen(true);
    setSessionDetailLoading(true);
    setSessionDetail(null);
    setBusyTableId(row.tableId);
    setActionError(null);
    try {
      const payload = await apiRequest<{ success: boolean; data: SessionDetail }>(
        `/dinein/sessions/${row.currentSessionId}?outletId=${selectedOutletId}`,
        {},
        accessToken
      );
      setSessionDetail(payload.data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load session";
      setActionError(message);
    } finally {
      setBusyTableId(null);
      setSessionDetailLoading(false);
    }
  };

  const renderActions = (row: TableBoardRow) => {
    const actions = getAvailableActionsForTable(row);
    if (actions.length === 0) {
      return <Text size="xs" c="dimmed">No actions</Text>;
    }
    return (
      <Menu withinPortal>
        <Menu.Target>
          <Button size="xs" variant="light" loading={busyTableId === row.tableId} disabled={busyTableId !== null}>Actions</Button>
        </Menu.Target>
        <Menu.Dropdown>
          {actions.includes("NEW_RESERVATION") && (
            <Menu.Item disabled={busyTableId !== null} onClick={() => openNewReservationModal(row)}>New Reservation</Menu.Item>
          )}
          {actions.includes("HOLD") && (
            <Menu.Item disabled={busyTableId !== null} onClick={() => void doAction(row, "HOLD")}>Hold</Menu.Item>
          )}
          {actions.includes("SEAT") && (
            <Menu.Item disabled={busyTableId !== null} onClick={() => void doAction(row, "SEAT")}>Seat</Menu.Item>
          )}
          {actions.includes("RELEASE") && (
            <Menu.Item disabled={busyTableId !== null} onClick={() => void doAction(row, "RELEASE")}>Release</Menu.Item>
          )}
          {actions.includes("VIEW_SESSION") && (
            <Menu.Item disabled={busyTableId !== null} onClick={() => void loadSession(row)}>View Session</Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    );
  };

  return (
    <Stack gap="md">
      <PageCard
        title="Table Board"
        description="Live occupancy board for dine-in operations"
        actions={
          <Group gap="xs">
            <SegmentedControl
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              data={[
                { value: "grid", label: "Grid" },
                { value: "list", label: "List" }
              ]}
            />
            <Button variant="default" onClick={() => void board.refetch()} loading={board.loading}>
              Refresh
            </Button>
          </Group>
        }
      >
        <Stack gap="sm">
          <FilterBar>
            <Select
              label="Outlet"
              placeholder="Select outlet"
              data={outletOptions}
              value={selectedOutletId ? String(selectedOutletId) : null}
              onChange={(value) => setSelectedOutletId(value ? Number(value) : null)}
            />

            <Select
              label="Status"
              value={status}
              data={[
                { value: "ALL", label: "All statuses" },
                { value: "AVAILABLE", label: "Available" },
                { value: "OCCUPIED", label: "Occupied" },
                { value: "RESERVED", label: "Reserved" },
                { value: "CLEANING", label: "Cleaning" },
                { value: "OUT_OF_SERVICE", label: "Out of Service" }
              ]}
              onChange={(value) => setStatus((value as BoardStatusFilter) || "ALL")}
            />

            <Select
              label="Zone"
              value={zone}
              data={zoneOptions}
              onChange={setZone}
            />

            <NumberInput
              label="Min Capacity"
              value={minCapacity ?? undefined}
              min={1}
              max={100}
              onChange={(value) => setMinCapacity(typeof value === "number" ? value : null)}
            />

            <NumberInput
              label="Max Capacity"
              value={maxCapacity ?? undefined}
              min={1}
              max={100}
              onChange={(value) => setMaxCapacity(typeof value === "number" ? value : null)}
            />

            <TextInput
              label="Search"
              placeholder="Code, name, zone"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </FilterBar>

          {board.lastUpdatedAt && (
            <Text size="sm" c="dimmed">Live refresh every 8s - last updated {board.lastUpdatedAt.toLocaleTimeString()}</Text>
          )}

          {actionError && <Alert color="red" title="Action failed">{actionError}</Alert>}
          {actionSuccess && <Alert color="green" title="Action success">{actionSuccess}</Alert>}

          {board.error && <Alert color="red" title="Board error">{board.error}</Alert>}
          {!selectedOutletId && <Alert color="blue" title="Select Outlet">Select an outlet to load table board.</Alert>}
          {selectedOutletId && board.loading && <Text c="dimmed">Loading table board...</Text>}
          {selectedOutletId && !board.loading && filteredRows.length === 0 && (
            <Text c="dimmed">No tables found for current filters.</Text>
          )}
        </Stack>
      </PageCard>

      {viewMode === "grid" && groupedRows.map((group) => (
        <PageCard key={group.zone} title={`${group.zone} (${group.rows.length})`}>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {group.rows.map((row) => {
              const statusMeta = getBoardStatusMeta(row.occupancyStatusId);
              const reservedSoon = getReservedSoonInfo(row.nextReservationStartAt, 30);
              return (
                <Card key={row.tableId} withBorder radius="md" padding="md">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Title order={5}>{row.tableCode}</Title>
                      <Badge color={statusMeta.color} variant="light">{statusMeta.label}</Badge>
                    </Group>
                    <Text size="sm">{row.tableName}</Text>
                    <Text size="xs" c="dimmed">
                      Capacity {row.capacity ?? "-"} | Guests {row.guestCount ?? 0}
                    </Text>
                    <Text size="xs" c="dimmed">Session {row.currentSessionId ?? "-"}</Text>
                    {reservedSoon && (
                      <Alert color="yellow" title="Reserved soon" variant="light">
                        Starts in {reservedSoon.startsInMinutes} min ({formatReservedSoonTime(reservedSoon.startsAt, selectedOutletTimezone)})
                      </Alert>
                    )}
                    {board.recentChangeIds.has(row.tableId) && (
                      <Badge size="xs" color="teal" variant="dot">Recently changed</Badge>
                    )}
                    {renderActions(row)}
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </PageCard>
      ))}

      {viewMode === "list" && (
        <PageCard title={`Table List (${filteredRows.length})`}>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Table</Table.Th>
                <Table.Th>Zone</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Capacity</Table.Th>
                <Table.Th>Guests</Table.Th>
                <Table.Th>Session</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredRows.map((row) => {
                const statusMeta = getBoardStatusMeta(row.occupancyStatusId);
                const reservedSoon = getReservedSoonInfo(row.nextReservationStartAt, 30);
                return (
                  <Table.Tr key={row.tableId}>
                    <Table.Td>
                      <Group gap="xs">
                        <Text fw={600}>{row.tableCode}</Text>
                        {board.recentChangeIds.has(row.tableId) && (
                          <Badge size="xs" color="teal" variant="dot">Updated</Badge>
                        )}
                        {reservedSoon && (
                          <Badge size="xs" color="yellow" variant="light">
                            Reserved in {reservedSoon.startsInMinutes}m
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>{row.zone || "No Zone"}</Table.Td>
                    <Table.Td><Badge color={statusMeta.color} variant="light">{statusMeta.label}</Badge></Table.Td>
                    <Table.Td>{row.capacity ?? "-"}</Table.Td>
                    <Table.Td>{row.guestCount ?? 0}</Table.Td>
                    <Table.Td>{row.currentSessionId ?? "-"}</Table.Td>
                    <Table.Td>{renderActions(row)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </PageCard>
      )}

      <Modal
        opened={reservationModalOpen}
        onClose={() => {
          if (reservationSubmitting) {
            return;
          }
          closeReservationModal();
        }}
        title={<Title order={4}>New Reservation</Title>}
        centered
        size="md"
      >
        <Stack gap="sm">
          {reservationFormError && <Alert color="red" title="Reservation failed">{reservationFormError}</Alert>}
          <Text size="sm" c="dimmed">
            Table: {reservationForm.tableId ? `#${reservationForm.tableId}` : "No preselected table"}
          </Text>
          <TextInput
            label="Customer Name"
            value={reservationForm.customerName}
            onChange={(event) => {
              setReservationForm((prev) => ({ ...prev, customerName: event.currentTarget.value }));
            }}
            required
          />
          <NumberInput
            label="Guest Count"
            value={reservationForm.guestCount}
            min={1}
            max={100}
            onChange={(value) => {
              setReservationForm((prev) => ({
                ...prev,
                guestCount: typeof value === "number" ? Math.max(1, value) : 1
              }));
            }}
          />
          <TextInput
            label="Reservation Date & Time"
            type="datetime-local"
            value={reservationForm.reservationAt ? formatDateTimeLocalInput(reservationForm.reservationAt) : ""}
            onChange={(event) => {
              setReservationForm((prev) => ({
                ...prev,
                reservationAt: parseDateTimeLocalInput(event.currentTarget.value)
              }));
            }}
            required
          />
          <NumberInput
            label="Duration (minutes)"
            value={reservationForm.durationMinutes}
            min={15}
            max={480}
            onChange={(value) => {
              setReservationForm((prev) => ({
                ...prev,
                durationMinutes: typeof value === "number" ? Math.max(15, value) : 120
              }));
            }}
          />
          <TextInput
            label="Phone"
            value={reservationForm.customerPhone}
            onChange={(event) => {
              setReservationForm((prev) => ({ ...prev, customerPhone: event.currentTarget.value }));
            }}
          />
          <Textarea
            label="Notes"
            value={reservationForm.notes}
            onChange={(event) => {
              setReservationForm((prev) => ({ ...prev, notes: event.currentTarget.value }));
            }}
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeReservationModal} disabled={reservationSubmitting}>Cancel</Button>
            <Button onClick={() => void submitNewReservation()} loading={reservationSubmitting}>Create Reservation</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={sessionDetailOpen}
        onClose={() => {
          setSessionDetailOpen(false);
          setSessionDetailLoading(false);
          setSessionDetail(null);
        }}
        title={<Title order={4}>{resolveSessionModalTitle(sessionDetail)}</Title>}
        centered
        size="md"
      >
        <Stack gap="xs">
          {sessionDetailLoading && <Text c="dimmed">Loading session detail...</Text>}
          {!sessionDetailLoading && sessionDetail && (
            <>
              <Text>Table: {sessionDetail.tableCode} - {sessionDetail.tableName}</Text>
              <Text>Status: {sessionDetail.statusLabel}</Text>
              <Text>Guests: {sessionDetail.guestCount ?? 0}</Text>
              <Text>Started: {new Date(sessionDetail.startedAt).toLocaleString()}</Text>
              <Text>Lines: {sessionDetail.lineCount}</Text>
              <Text>Total Amount: {sessionDetail.totalAmount}</Text>
            </>
          )}
          {!sessionDetailLoading && !sessionDetail && (
            <Text c="dimmed">No session details available.</Text>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setSessionDetailOpen(false);
                setSessionDetailLoading(false);
                setSessionDetail(null);
              }}
            >
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
