// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReservationRow } from "@jurnapod/shared";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useOutletTables } from "../hooks/use-outlet-tables";
import { useTableSuggestions } from "../hooks/use-reservation-groups";
import { createReservation, updateReservation } from "../hooks/use-reservations";

import { TableMultiSelect } from "./TableMultiSelect";
import { TableSuggestions } from "./TableSuggestions";

type ReservationFormMode = "create" | "edit" | "edit-group";

type ReservationFormState = {
  tableId: number | null;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  reservationAt: Date | null;
  durationMinutes: number;
  notes: string;
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

function toDatetimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDatetimeLocalValue(value: string): Date | null {
  if (!value || !value.includes("T")) {
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
  if ([year, month, day, hours, minutes].some((v) => Number.isNaN(v))) {
    return null;
  }
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

interface ReservationFormModalProps {
  opened: boolean;
  onClose: () => void;
  mode: ReservationFormMode;
  reservation?: ReservationRow | null;
  outletId: number;
  accessToken: string;
  /** Enable multi-table (large party) support */
  enableMultiTable?: boolean;
  /** Show table suggestions based on guest count */
  showTableSuggestions?: boolean;
  /** Default duration in minutes */
  defaultDurationMinutes?: number;
  /** Called on successful create/update */
  onSuccess?: () => void;
  /** Called when tables should be refetched */
  onRefetchTables?: () => void;
}

export function ReservationFormModal({
  opened,
  onClose,
  mode,
  reservation,
  outletId,
  accessToken,
  enableMultiTable = false,
  showTableSuggestions = false,
  defaultDurationMinutes = 120,
  onSuccess,
  onRefetchTables
}: ReservationFormModalProps) {
  const tables = useOutletTables(outletId, accessToken);

  const [formState, setFormState] = useState<ReservationFormState>(emptyFormState);
  const [isMultiTable, setIsMultiTable] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Build suggestion query
  const suggestionQuery = useMemo(() => {
    if (!showTableSuggestions || !formState.reservationAt || !formState.guestCount || !outletId) {
      return null;
    }
    return {
      outlet_id: outletId,
      guest_count: formState.guestCount,
      reservation_at: formState.reservationAt.toISOString(),
      duration_minutes: formState.durationMinutes
    };
  }, [showTableSuggestions, formState.reservationAt, formState.guestCount, formState.durationMinutes, outletId]);

  const { suggestions: fetchedSuggestions, loading: suggestionsLoading } = useTableSuggestions(
    suggestionQuery,
    accessToken
  );

  // Initialize form when opening
  useEffect(() => {
    if (!opened) return;

    if (mode === "edit" && reservation) {
      setFormState({
        customerName: reservation.customer_name,
        customerPhone: reservation.customer_phone ?? "",
        guestCount: reservation.guest_count,
        reservationAt: new Date(reservation.reservation_at),
        durationMinutes: reservation.duration_minutes ?? defaultDurationMinutes,
        tableId: reservation.table_id,
        notes: reservation.notes ?? ""
      });
      setIsMultiTable(false);
      setSelectedTableIds([]);
    } else {
      setFormState({
        ...emptyFormState,
        durationMinutes: defaultDurationMinutes
      });
      setIsMultiTable(false);
      setSelectedTableIds([]);
    }
  }, [opened, mode, reservation, defaultDurationMinutes]);

  // Build table options
  const tableOptions = useMemo(() => {
    return tables.data
      .filter((table) => table.status !== "UNAVAILABLE")
      .map((table) => ({
        value: table.id.toString(),
        label: `${table.code} - ${table.name}${table.zone ? ` (${table.zone})` : ""}`
      }));
  }, [tables.data]);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    // Validation
    if (!formState.customerName.trim()) {
      setFormError("Customer name is required");
      return;
    }
    if (!formState.reservationAt) {
      setFormError("Reservation date/time is required");
      return;
    }

    // Multi-table validation
    if (enableMultiTable && isMultiTable && selectedTableIds.length < 2) {
      setFormError("Select at least 2 tables for a large party reservation");
      return;
    }

    // Single-table validation
    if (!isMultiTable && !formState.tableId) {
      setFormError("Select a table for the reservation");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "create") {
        const payload = {
          outlet_id: outletId,
          customer_name: formState.customerName.trim(),
          customer_phone: formState.customerPhone.trim() || null,
          guest_count: Math.max(1, Math.round(formState.guestCount)),
          table_id: isMultiTable ? undefined : formState.tableId,
          reservation_at: formState.reservationAt.toISOString(),
          duration_minutes: Math.max(15, Math.round(formState.durationMinutes)),
          notes: formState.notes.trim() || null,
          status: "BOOKED" as const
        };

        await createReservation(payload, accessToken);
      } else if (mode === "edit" && reservation) {
        const payload = {
          customer_name: formState.customerName.trim(),
          customer_phone: formState.customerPhone.trim() || null,
          guest_count: Math.max(1, Math.round(formState.guestCount)),
          table_id: isMultiTable ? undefined : formState.tableId,
          reservation_at: formState.reservationAt.toISOString(),
          duration_minutes: Math.max(15, Math.round(formState.durationMinutes)),
          notes: formState.notes.trim() || null
        };

        await updateReservation(reservation.reservation_id, payload, accessToken);
      }

      onSuccess?.();
      onRefetchTables?.();
      onClose();
    } catch (e: any) {
      setFormError(e.message || "Failed to save reservation");
    } finally {
      setSubmitting(false);
    }
  }, [formState, mode, reservation, outletId, accessToken, isMultiTable, selectedTableIds, enableMultiTable, onSuccess, onRefetchTables, onClose]);

  const title = mode === "create"
    ? "Create Reservation"
    : mode === "edit-group"
    ? "Edit Group"
    : "Edit Reservation";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={4}>{title}</Title>}
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
          onChange={(event) =>
            setFormState((current) => ({ ...current, customerName: event.currentTarget.value }))
          }
          required
        />

        <TextInput
          label="Customer Phone"
          value={formState.customerPhone}
          onChange={(event) =>
            setFormState((current) => ({ ...current, customerPhone: event.currentTarget.value }))
          }
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

        {enableMultiTable && (
          <Checkbox
            label="Large party (multiple tables)"
            description="For parties requiring 2+ tables"
            checked={isMultiTable}
            onChange={(event) => {
              setIsMultiTable(event.currentTarget.checked);
              if (!event.currentTarget.checked) {
                setSelectedTableIds([]);
              }
            }}
          />
        )}

        {enableMultiTable && isMultiTable ? (
          <>
            <Text size="sm" fw={500}>
              Table Suggestions for {formState.guestCount} guests
            </Text>
            {showTableSuggestions && (
              <TableSuggestions
                suggestions={fetchedSuggestions}
                onSelect={setSelectedTableIds}
                loading={suggestionsLoading}
              />
            )}
            <TableMultiSelect
              availableTables={tables.data}
              selectedTableIds={selectedTableIds}
              onChange={setSelectedTableIds}
              guestCount={formState.guestCount}
            />
          </>
        ) : (
          <Select
            label="Table"
            placeholder="Select available table"
            data={tableOptions}
            value={formState.tableId?.toString() ?? null}
            onChange={(value) =>
              setFormState((current) => ({
                ...current,
                tableId: value ? Number(value) : null
              }))
            }
            clearable
            disabled={tables.loading}
          />
        )}

        <Textarea
          label="Notes"
          value={formState.notes}
          onChange={(event) =>
            setFormState((current) => ({ ...current, notes: event.currentTarget.value }))
          }
          rows={3}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={submitting}>
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
