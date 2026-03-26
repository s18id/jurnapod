// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  OutletTableResponse,
  ReservationCreateRequest,
  ReservationGroupDetail,
  ReservationRow,
  ReservationStatus,
  ReservationUpdateRequest,
  TableSuggestion
} from "@jurnapod/shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import { TableMultiSelect } from "../components/TableMultiSelect";
import { TableSuggestions } from "../components/TableSuggestions";
import { useOutletTables } from "../hooks/use-outlet-tables";
import { useOutletsFull } from "../hooks/use-outlets";
import {
  DEFAULT_RESERVATION_DURATION_MINUTES,
  buildDailyUtilization,
  buildReservationTimelineByDay,
  formatReservationTimeWithDayOffset,
  getReservationDurationMinutes,
  getReservationEndAt,
  isReservationFinalStatus,
  type ReservationCalendarViewMode,
  useReservationCalendar
} from "../hooks/use-reservation-calendar";
import { cancelReservationGroup, createReservationGroup, getReservationGroup, updateReservationGroup, useTableSuggestions } from "../hooks/use-reservation-groups";
import { createReservation, updateReservation } from "../hooks/use-reservations";
import { apiRequest } from "../lib/api-client";
import {
  getCheckInTargetStatus as getCheckInTargetStatusShared,
  getReservationStatusLabel,
  RESERVATION_STATUS_META,
  RESERVATION_STATUS_OPTIONS
} from "../lib/reservation-status";
import { getStoredCompanyTimezone, refreshSessionUser, type SessionUser } from "../lib/session";

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

type ReservationFormMode = "create" | "edit" | "edit-group";

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

const emptyFormState: ReservationFormState = {
  tableId: null,
  customerName: "",
  customerPhone: "",
  guestCount: 2,
  reservationAt: null,
  durationMinutes: 120,
  notes: ""
};

const COMPANY_SETTING_RESERVATION_DURATION_KEY = "feature.reservation.default_duration_minutes";

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
  editingGroupId?: number | null;
  formState: ReservationFormState;
  accessToken: string;
  isMultiTable?: boolean;
  selectedTableIds?: number[];
  createReservationFn?: (data: ReservationCreateRequest, accessToken: string) => Promise<ReservationRow>;
  createReservationGroupFn?: (data: {
    outlet_id: number;
    customer_name: string;
    customer_phone: string | null;
    guest_count: number;
    table_ids: number[];
    reservation_at: string;
    duration_minutes: number;
    notes: string | null;
  }, accessToken: string) => Promise<{ group_id: number; reservation_ids: number[] }>;
  updateReservationGroupFn?: (groupId: number, data: {
    customer_name?: string;
    customer_phone?: string | null;
    guest_count?: number;
    reservation_at?: string;
    duration_minutes?: number;
    notes?: string | null;
    table_ids?: number[];
  }, accessToken: string) => Promise<{ group_id: number; reservation_ids: number[]; updated_tables: number[]; removed_tables: number[] }>;
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

  const isMultiTable = input.isMultiTable ?? false;
  const selectedTableIds = input.selectedTableIds ?? [];

  // Multi-table validation
  if (isMultiTable && selectedTableIds.length < 2) {
    return { ok: false, errorMessage: "Select at least 2 tables for a large party reservation." };
  }

  // Single-table validation
  if (!isMultiTable && !input.formState.tableId) {
    return { ok: false, errorMessage: "Select a table for the reservation." };
  }

  const createFn = input.createReservationFn ?? createReservation;
  const createGroupFn = input.createReservationGroupFn ?? createReservationGroup;
  const updateFn = input.updateReservationFn ?? updateReservation;

  try {
    if (input.mode === "create") {
      if (isMultiTable && selectedTableIds.length >= 2) {
        // Create multi-table reservation group
        const groupPayload = {
          outlet_id: input.selectedOutletId,
          customer_name: input.formState.customerName.trim(),
          customer_phone: input.formState.customerPhone.trim() || null,
          guest_count: Math.max(2, Math.round(input.formState.guestCount)),
          table_ids: selectedTableIds,
          reservation_at: input.formState.reservationAt.toISOString(),
          duration_minutes: Math.max(15, Math.round(input.formState.durationMinutes)),
          notes: input.formState.notes.trim() || null
        };
        await createGroupFn(groupPayload, input.accessToken);
      } else {
        // Create single-table reservation
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
        await createFn(payload, input.accessToken);
      }
    } else if (input.mode === "edit-group" && input.editingGroupId) {
      // Group edit: update the entire group
      const updateGroupFn = input.updateReservationGroupFn ?? updateReservationGroup;
      const updatePayload: {
        customer_name?: string;
        customer_phone?: string | null;
        guest_count?: number;
        reservation_at?: string;
        duration_minutes?: number;
        notes?: string | null;
        table_ids?: number[];
      } = {
        customer_name: input.formState.customerName.trim(),
        customer_phone: input.formState.customerPhone.trim() || null,
        guest_count: Math.max(2, Math.round(input.formState.guestCount)),
        reservation_at: input.formState.reservationAt.toISOString(),
        duration_minutes: Math.max(15, Math.round(input.formState.durationMinutes)),
        notes: input.formState.notes.trim() || null
      };

      // Only include table_ids if in multi-table mode with selections
      if (input.isMultiTable && input.selectedTableIds && input.selectedTableIds.length >= 2) {
        updatePayload.table_ids = input.selectedTableIds;
      }

      await updateGroupFn(input.editingGroupId, updatePayload, input.accessToken);
    } else if (input.editingReservationId) {
      // Individual reservation edit (not part of a group edit)
      const editPayload = {
        table_id: input.formState.tableId,
        customer_name: input.formState.customerName.trim(),
        customer_phone: input.formState.customerPhone.trim() || null,
        guest_count: Math.max(1, Math.round(input.formState.guestCount)),
        reservation_at: input.formState.reservationAt.toISOString(),
        duration_minutes: Math.max(15, Math.round(input.formState.durationMinutes)),
        notes: input.formState.notes.trim() || null
      };
      await updateFn(input.editingReservationId, editPayload, input.accessToken);
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
  return getCheckInTargetStatusShared(status);
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
      successMessage: `Reservation ${input.row.customer_name} set to ${getReservationStatusLabel(input.status)}.`
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
  defaultDurationMinutes?: number | null;
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
        const existingEnd = getReservationEndAt(reservation, input.defaultDurationMinutes).getTime();
        return requestedStartAt < existingEnd && existingStart < requestedEndAt;
      });

      return !hasConflict;
    })
    .map((table) => ({
      value: table.id.toString(),
      label: `${table.code} - ${table.name} (${table.zone || "No zone"})`
    }));
}

function createFormFromReservation(row: ReservationRow, defaultDurationMinutes?: number | null): ReservationFormState {
  return {
    tableId: row.table_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? "",
    guestCount: row.guest_count,
    reservationAt: new Date(row.reservation_at),
    durationMinutes: getReservationDurationMinutes(row, defaultDurationMinutes),
    notes: row.notes ?? ""
  };
}

function formatMinuteLabel(minute: number): string {
  const hours = Math.floor(minute / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (minute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function buildTimelineBlockStyle(startMinute: number, endMinute: number): { left: string; width: string } {
  const dayMinutes = 24 * 60;
  const boundedStart = Math.min(dayMinutes, Math.max(0, startMinute));
  const boundedEnd = Math.min(dayMinutes, Math.max(boundedStart + 1, endMinute));
  const leftPercent = (boundedStart / dayMinutes) * 100;
  const widthPercent = ((boundedEnd - boundedStart) / dayMinutes) * 100;

  return {
    left: `${leftPercent}%`,
    width: `${Math.max(widthPercent, 2)}%`
  };
}

export function buildTimelineLaneTableIds(
  masterTableIds: number[],
  dayTimeline: Record<number, unknown> | undefined
): number[] {
  const usedTableIds = new Set<number>();
  for (const tableIdRaw of Object.keys(dayTimeline ?? {})) {
    const tableId = Number(tableIdRaw);
    const blocks = (dayTimeline?.[tableId] as unknown[] | undefined) ?? [];
    if (blocks.length > 0) {
      usedTableIds.add(tableId);
    }
  }

  if (usedTableIds.size === 0) {
    return [];
  }

  const masterSet = new Set(masterTableIds);
  const sorted = [...usedTableIds].sort((a, b) => a - b);
  const known = sorted.filter((id) => masterSet.has(id));
  const unlisted = sorted.filter((id) => !masterSet.has(id));
  return [...known, ...unlisted];
}

export function resolveCalendarTimezone(outletTimezone?: string | null, companyTimezone?: string | null): string | null {
  if (outletTimezone && outletTimezone.trim()) {
    return outletTimezone;
  }
  if (companyTimezone && companyTimezone.trim()) {
    return companyTimezone;
  }
  return null;
}

export function resolveCalendarTimezoneInfo(
  outletTimezone?: string | null,
  companyTimezone?: string | null
): { timezone: string | null; source: "outlet" | "company" | "missing" } {
  if (outletTimezone && outletTimezone.trim()) {
    return { timezone: outletTimezone, source: "outlet" };
  }
  if (companyTimezone && companyTimezone.trim()) {
    return { timezone: companyTimezone, source: "company" };
  }
  return { timezone: null, source: "missing" };
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
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [formState, setFormState] = useState<ReservationFormState>(emptyFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isMultiTable, setIsMultiTable] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [suggestions, setSuggestions] = useState<TableSuggestion[]>([]);

  const [detailReservation, setDetailReservation] = useState<ReservationRow | null>(null);
  const [detailGroup, setDetailGroup] = useState<ReservationGroupDetail | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState<number>(DEFAULT_RESERVATION_DURATION_MINUTES);
  const [sessionCompanyTimezone, setSessionCompanyTimezone] = useState<string | null>(
    user.company_timezone ?? getStoredCompanyTimezone()
  );
  const [timezoneRefreshAttempted, setTimezoneRefreshAttempted] = useState(false);

  // Fetch group details when opening a grouped reservation
  useEffect(() => {
    if (!detailReservation?.reservation_group_id) {
      setDetailGroup(null);
      return;
    }

    setDetailGroup(null);

    getReservationGroup(detailReservation.reservation_group_id, accessToken)
      .then((group) => {
        setDetailGroup(group);
      })
      .catch(() => {
        setDetailGroup(null);
      })
      .finally(() => undefined);
  }, [detailReservation?.reservation_group_id, accessToken]);

  const touchStartX = useRef<number | null>(null);

  const outlets = useOutletsFull(user.company_id, accessToken);
  const selectedOutlet = useMemo(
    () => outlets.data.find((outlet) => Number(outlet.id) === selectedOutletId) ?? null,
    [outlets.data, selectedOutletId]
  );

  useEffect(() => {
    if (user.company_timezone && user.company_timezone.trim()) {
      setSessionCompanyTimezone(user.company_timezone);
      return;
    }

    const stored = getStoredCompanyTimezone();
    if (stored) {
      setSessionCompanyTimezone(stored);
    }
  }, [user.company_timezone]);

  useEffect(() => {
    if (timezoneRefreshAttempted || selectedOutlet?.timezone || sessionCompanyTimezone || !selectedOutletId) {
      return;
    }

    setTimezoneRefreshAttempted(true);
    refreshSessionUser(accessToken)
      .then((nextUser) => {
        if (nextUser.company_timezone && nextUser.company_timezone.trim()) {
          setSessionCompanyTimezone(nextUser.company_timezone);
        }
      })
      .catch(() => undefined);
  }, [timezoneRefreshAttempted, selectedOutlet?.timezone, sessionCompanyTimezone, selectedOutletId, accessToken]);

  const calendarTimezoneInfo = useMemo(
    () => resolveCalendarTimezoneInfo(selectedOutlet?.timezone, sessionCompanyTimezone),
    [selectedOutlet?.timezone, sessionCompanyTimezone]
  );
  const selectedOutletTimezone = calendarTimezoneInfo.timezone;
  const outletTables = useOutletTables(selectedOutletId, accessToken);

  useEffect(() => {
    async function loadCompanyReservationDefaults() {
      try {
        const response = await apiRequest<{
          success: true;
          data: { settings: Array<{ key: string; value: number | boolean | string; value_type: string }> };
        }>(
          `/settings/company-config?keys=${encodeURIComponent(COMPANY_SETTING_RESERVATION_DURATION_KEY)}`,
          {},
          accessToken
        );
        const row = response.data.settings.find((setting) => setting.key === COMPANY_SETTING_RESERVATION_DURATION_KEY);
        const parsed = Number(row?.value ?? DEFAULT_RESERVATION_DURATION_MINUTES);
        if (Number.isFinite(parsed)) {
          setDefaultDurationMinutes(Math.min(480, Math.max(15, Math.round(parsed))));
          return;
        }
      } catch {
        // fall through to default below
      }

      setDefaultDurationMinutes(DEFAULT_RESERVATION_DURATION_MINUTES);
    }

    loadCompanyReservationDefaults().catch(() => {
      setDefaultDurationMinutes(DEFAULT_RESERVATION_DURATION_MINUTES);
    });
  }, [accessToken]);

  // Reset multi-table selections when mode changes
  useEffect(() => {
    if (!isMultiTable) {
      setSelectedTableIds([]);
      setSuggestions([]);
    }
  }, [isMultiTable]);

  // Fetch suggestions when multi-table mode and reservation time is set
  const suggestionQuery = useMemo(() => {
    if (!isMultiTable || !formState.reservationAt || !selectedOutletId) {
      return null;
    }
    return {
      outlet_id: selectedOutletId,
      guest_count: formState.guestCount,
      reservation_at: formState.reservationAt.toISOString(),
      duration_minutes: formState.durationMinutes
    };
  }, [isMultiTable, formState.reservationAt, formState.guestCount, formState.durationMinutes, selectedOutletId]);

  const { suggestions: fetchedSuggestions } = useTableSuggestions(
    suggestionQuery,
    accessToken
  );

  useEffect(() => {
    setSuggestions(fetchedSuggestions);
  }, [fetchedSuggestions]);

  const calendar = useReservationCalendar({
    outletId: selectedOutletTimezone ? selectedOutletId : null,
    anchorDate,
    viewMode,
    timeZone: selectedOutletTimezone ?? undefined,
    defaultDurationMinutes,
    status: statusFilter,
    accessToken
  });

  // Listen for cross-page invalidation events
  useEffect(() => {
    const handleInvalidation = () => {
      calendar.refetch();
    };
    window.addEventListener("reservation-invalidation", handleInvalidation);
    return () => window.removeEventListener("reservation-invalidation", handleInvalidation);
  }, [calendar]);

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

  const filteredReservations = useMemo(
    () => Object.values(filteredReservationsByDay).flat(),
    [filteredReservationsByDay]
  );

  const timelineByDay = useMemo(
    () =>
      buildReservationTimelineByDay(
        calendar.days,
        filteredReservations,
        selectedOutletTimezone,
        defaultDurationMinutes
      ),
    [calendar.days, filteredReservations, selectedOutletTimezone, defaultDurationMinutes]
  );

  const tableLabelById = useMemo(
    () =>
      Object.fromEntries(
        outletTables.data.map((table) => [table.id, `${table.code} - ${table.name}`])
      ) as Record<number, string>,
    [outletTables.data]
  );

  const timelineTableIds = useMemo(
    () => outletTables.data.map((table) => table.id).sort((a, b) => a - b),
    [outletTables.data]
  );

  const suggestedTableOptions = useMemo(
    () =>
      getSuggestedTableOptions({
        tables: outletTables.data,
        reservations: calendar.reservations,
        guestCount: formState.guestCount,
        reservationAt: formState.reservationAt,
        durationMinutes: formState.durationMinutes,
        defaultDurationMinutes,
        editingReservationId
      }),
    [
      outletTables.data,
      calendar.reservations,
      formState.guestCount,
      formState.reservationAt,
      formState.durationMinutes,
      defaultDurationMinutes,
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
      durationMinutes: defaultDurationMinutes,
      reservationAt: new Date(anchorDate)
    });
    setFormError(null);
    setIsMultiTable(false);
    setSelectedTableIds([]);
    setSuggestions([]);
    setFormOpen(true);
  }, [anchorDate, defaultDurationMinutes]);

  const openEditModal = useCallback(async (row: ReservationRow) => {
    setFormError(null);
    setFormError(null);

    // Check if this reservation is part of a group
    if (row.reservation_group_id) {
      // Load full group details for group editing
      try {
        const groupDetail = await getReservationGroup(row.reservation_group_id, accessToken);
        const firstReservation = groupDetail.reservations[0];
        if (firstReservation) {
          // Calculate duration from reservation_at (API only provides reservation_at, not _ts fields)
          const startTs = new Date(firstReservation.reservation_at).getTime();
          const endTs = startTs + (defaultDurationMinutes ?? 120) * 60 * 1000;
          const durationMinutes = Math.round((endTs - startTs) / 60 / 1000);

          setFormMode("edit-group");
          setEditingGroupId(row.reservation_group_id);
          setEditingReservationId(row.reservation_id);
          setFormState({
            tableId: null,
            customerName: row.customer_name || "Group Reservation",
            customerPhone: row.customer_phone || "",
            guestCount: groupDetail.total_guest_count,
            reservationAt: new Date(firstReservation.reservation_at),
            durationMinutes: durationMinutes,
            notes: row.notes || ""
          });
          // Pre-select all tables from the group
          setIsMultiTable(true);
          setSelectedTableIds(groupDetail.reservations.map(r => r.table_id));
        }
      } catch {
        // Fall back to individual edit if group load fails
        setFormMode("edit");
        setEditingGroupId(null);
        setEditingReservationId(row.reservation_id);
        setFormState(createFormFromReservation(row, defaultDurationMinutes));
        setIsMultiTable(false);
        setSelectedTableIds([]);
      }
    } else {
      // Regular individual edit
      setFormMode("edit");
      setEditingGroupId(null);
      setEditingReservationId(row.reservation_id);
      setFormState(createFormFromReservation(row, defaultDurationMinutes));
      setIsMultiTable(false);
      setSelectedTableIds([]);
    }

    setFormOpen(true);
  }, [accessToken, defaultDurationMinutes]);

  const closeFormModal = useCallback(() => {
    setFormOpen(false);
    setFormError(null);
    setEditingReservationId(null);
    setEditingGroupId(null);
    setIsMultiTable(false);
    setSelectedTableIds([]);
    setSuggestions([]);
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
      editingGroupId,
      formState,
      accessToken,
      isMultiTable,
      selectedTableIds,
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
    editingGroupId,
    editingReservationId,
    formMode,
    formState,
    isMultiTable,
    outletTables,
    selectedOutletId,
    selectedTableIds
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

  const cancelGroup = useCallback(
    async (row: ReservationRow) => {
      if (!row.reservation_group_id) return;

      setUpdatingStatusId(row.reservation_id);
      setActionError(null);
      setActionSuccess(null);

      try {
        await cancelReservationGroup(row.reservation_group_id, accessToken);
        setActionSuccess(`Group #${row.reservation_group_id} cancelled.`);
        setDetailReservation(null);
        setDetailGroup(null);
        await calendar.refetch();
        await outletTables.refetch();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to cancel group";
        setActionError(message);
      } finally {
        setUpdatingStatusId(null);
      }
    },
    [accessToken, calendar, outletTables]
  );

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
              data={RESERVATION_STATUS_OPTIONS}
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

          <Text size="xs" c="dimmed">
            Timezone: {selectedOutletTimezone ?? "Not configured"} (
            {calendarTimezoneInfo.source === "outlet"
              ? "from outlet"
              : calendarTimezoneInfo.source === "company"
                ? "from company"
                : "missing"}
            )
          </Text>

          {!selectedOutletTimezone ? (
            <Alert color="red" title="Timezone required">
              Company timezone is required for reservation calendar boundaries. Set outlet timezone or company timezone
              first.
            </Alert>
          ) : null}

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

                      {viewMode === "week" ? (
                        rows.length === 0 ? (
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
                                    <Group gap={4}>
                                      {row.reservation_group_id && (
                                        <Badge color="violet" variant="light" size="xs">
                                          Group
                                        </Badge>
                                      )}
                                      <Badge color={RESERVATION_STATUS_META[row.status].badgeColor} variant="light" size="xs">
                                        {getReservationStatusLabel(row.status)}
                                      </Badge>
                                    </Group>
                                  </Group>
                                   <Text size="xs" c="dimmed">
                                     {formatReservationTimeWithDayOffset(row, defaultDurationMinutes, selectedOutletTimezone)} · {row.guest_count} guests · {tableLabel}
                                   </Text>
                                </Stack>
                              </Button>
                            );
                          })
                        )
                      ) : (
                        <Stack gap="sm">
                          {buildTimelineLaneTableIds(timelineTableIds, timelineByDay[day.key]).map((tableId) => {
                            const blocks = timelineByDay[day.key]?.[tableId] ?? [];
                            const tableLabel = tableLabelById[tableId] ?? `Table #${tableId} (unlisted)`;

                            return (
                              <Stack key={tableId} gap={4}>
                                <Group justify="space-between" wrap="nowrap" gap="xs">
                                  <Text size="xs" fw={600}>
                                    {tableLabel}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {blocks.length} booking{blocks.length === 1 ? "" : "s"}
                                  </Text>
                                </Group>

                                <div
                                  style={{
                                    position: "relative",
                                    height: 44,
                                    border: "1px solid var(--mantine-color-gray-3)",
                                    borderRadius: 8,
                                    background:
                                      "linear-gradient(to right, transparent 0%, transparent 24.9%, var(--mantine-color-gray-1) 25%, transparent 25.1%, transparent 49.9%, var(--mantine-color-gray-1) 50%, transparent 50.1%, transparent 74.9%, var(--mantine-color-gray-1) 75%, transparent 75.1%)"
                                  }}
                                >
                                  {blocks.map((block) => {
                                    const isOverlap = calendar.overlappingReservationIds.has(block.reservationId);
                                    const style = buildTimelineBlockStyle(block.startMinute, block.endMinute);

                                    return (
                                      <Button
                                        key={block.reservationId}
                                        variant="filled"
                                        color={isOverlap ? "orange" : "blue"}
                                        size="compact-xs"
                                        styles={{
                                          root: {
                                            position: "absolute",
                                            top: 4,
                                            bottom: 4,
                                            ...style,
                                            minWidth: 16,
                                            paddingLeft: 6,
                                            paddingRight: 6,
                                            borderWidth: isOverlap ? 1 : 0,
                                            borderStyle: "solid",
                                            borderColor: isOverlap ? "var(--mantine-color-orange-3)" : undefined
                                          },
                                          label: {
                                            justifyContent: "flex-start",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap"
                                          }
                                        }}
                                        onClick={() => {
                                          setDetailReservation(block.row);
                                          setReminderNotice(null);
                                        }}
                                      >
                                        {block.customerName}{block.row.reservation_group_id ? " (G)" : ""}
                                      </Button>
                                    );
                                  })}
                                </div>

                                <Group justify="space-between" gap={4} wrap="nowrap">
                                  <Text size="10px" c="dimmed">
                                    00:00
                                  </Text>
                                  <Text size="10px" c="dimmed">
                                    06:00
                                  </Text>
                                  <Text size="10px" c="dimmed">
                                    12:00
                                  </Text>
                                  <Text size="10px" c="dimmed">
                                    18:00
                                  </Text>
                                  <Text size="10px" c="dimmed">
                                    24:00
                                  </Text>
                                </Group>

                                <Text size="xs" c="dimmed">
                                  {blocks.length === 0
                                    ? "Available all day"
                                    : blocks
                                        .map((block) => `${formatMinuteLabel(block.startMinute)}-${formatMinuteLabel(block.endMinute)}`)
                                        .join(" | ")}
                                </Text>
                              </Stack>
                            );
                          })}

                          {rows
                            .filter((row) => !row.table_id || isReservationFinalStatus(row.status))
                            .map((row) => {
                              const tableLabel = row.table_id ? `Table #${row.table_id}` : "No table";
                              return (
                                <Button
                                  key={`list-${row.reservation_id}`}
                                  variant="light"
                                  color="gray"
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
                                      <Group gap={4}>
                                        {row.reservation_group_id && (
                                          <Badge color="violet" variant="light" size="xs">
                                            Group
                                          </Badge>
                                        )}
                                        <Badge color={RESERVATION_STATUS_META[row.status].badgeColor} variant="light" size="xs">
                                          {getReservationStatusLabel(row.status)}
                                        </Badge>
                                      </Group>
                                    </Group>
                                     <Text size="xs" c="dimmed">
                                       {formatReservationTimeWithDayOffset(row, defaultDurationMinutes, selectedOutletTimezone)} · {row.guest_count} guests · {tableLabel}
                                     </Text>
                                </Stack>
                                </Button>
                              );
                            })}
                        </Stack>
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
        title={<Title order={4}>
          {formMode === "create" ? "Create Reservation" : 
           formMode === "edit-group" ? `Edit Group #${editingGroupId}` : 
           "Edit Reservation"}
        </Title>}
        centered
        size="md"
      >
        <Stack gap="md">
          {formError && (
            <Alert color="red" title="Cannot save">
              {formError}
            </Alert>
          )}

          {/* Show "Part of Group" notice when editing individual reservation in a group */}
          {formMode === "edit" && detailReservation?.reservation_group_id && (
            <Alert color="violet" variant="light" title="Part of Group">
              <Stack gap="xs">
                <Text size="sm">
                  This reservation is part of Group #{detailReservation.reservation_group_id}.
                  Editing it will only affect this single reservation, not the entire group.
                </Text>
                {detailGroup && detailGroup.reservations.length > 1 && (
                  <>
                    <Text size="sm" fw={500}>
                      Other tables in this group:
                    </Text>
                    <Group gap="xs">
                      {detailGroup.reservations
                        .filter(r => r.reservation_id !== detailReservation.reservation_id)
                        .map(r => (
                          <Badge key={r.reservation_id} color="violet" variant="light" size="sm">
                            {r.table_code} - {r.table_name}
                          </Badge>
                        ))}
                    </Group>
                  </>
                )}
              </Stack>
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

          <Checkbox
            label="Large party (multiple tables)"
            description={
              formMode === "edit-group"
                ? "This group requires multiple tables (cannot be changed)"
                : "For parties requiring 2+ tables"
            }
            checked={isMultiTable}
            onChange={(event) => setIsMultiTable(event.currentTarget.checked)}
            disabled={formMode === "edit-group"}
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

          {isMultiTable ? (
            <>
              <Text size="sm" fw={500}>
                Table Suggestions for {formState.guestCount} guests
              </Text>
              <TableSuggestions
                suggestions={suggestions}
                onSelect={setSelectedTableIds}
              />
              <TableMultiSelect
                availableTables={outletTables.data}
                selectedTableIds={selectedTableIds}
                onChange={setSelectedTableIds}
                guestCount={formState.guestCount}
              />
            </>
          ) : (
            <Select
              label="Suggested Table"
              placeholder="Pick available table"
              data={suggestedTableOptions}
              value={formState.tableId?.toString() ?? null}
              onChange={(value) => setFormState((current) => ({ ...current, tableId: value ? Number(value) : null }))}
              clearable
            />
          )}

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
        onClose={() => {
          setDetailReservation(null);
          setDetailGroup(null);
        }}
        title={<Title order={4}>Reservation Detail</Title>}
        centered
        size="md"
      >
        {detailReservation ? (
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap="xs">
                <Text fw={600}>{detailReservation.customer_name}</Text>
                {detailReservation.reservation_group_id && (
                  <Badge color="violet" variant="light" size="xs">
                    Group #{detailReservation.reservation_group_id}
                  </Badge>
                )}
              </Group>
              <Badge color={RESERVATION_STATUS_META[detailReservation.status].badgeColor}>
                {getReservationStatusLabel(detailReservation.status)}
              </Badge>
            </Group>
            <Text size="sm">Time: {formatReservationTimeWithDayOffset(detailReservation, defaultDurationMinutes, selectedOutletTimezone)}</Text>
            <Text size="sm">
              Duration: {getReservationDurationMinutes(detailReservation, defaultDurationMinutes)} min
              {detailReservation.duration_minutes == null ? " (default)" : ""}
            </Text>
            <Text size="sm">Guests: {detailReservation.guest_count}</Text>
            {detailGroup && detailGroup.reservations.length > 1 ? (
              <Stack gap={4}>
                <Text size="sm">
                  Tables ({detailGroup.reservations.length}):
                </Text>
                {detailGroup.reservations.map((r) => (
                  <Group key={r.reservation_id} gap="xs">
                    <Badge color="violet" variant="light" size="xs">
                      #{r.table_code}
                    </Badge>
                    <Text size="xs">{r.table_name}</Text>
                    <Badge color={RESERVATION_STATUS_META[r.status as ReservationStatus]?.badgeColor ?? "gray"} variant="light" size="xs">
                      {r.status}
                    </Badge>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm">Table: {detailReservation.table_id ? `#${detailReservation.table_id}` : "Not assigned"}</Text>
            )}
            {detailReservation.notes && <Text size="sm">Notes: {detailReservation.notes}</Text>}

            <Group justify="space-between" mt="sm" wrap="wrap">
              {detailReservation.reservation_group_id ? (
                <>
                  <Button
                    color="violet"
                    variant="light"
                    loading={updatingStatusId === detailReservation.reservation_id}
                    disabled={isReservationFinalStatus(detailReservation.status)}
                    onClick={() => void cancelGroup(detailReservation)}
                  >
                    Cancel Group
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
                </>
              ) : (
                <>
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
                </>
              )}
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
