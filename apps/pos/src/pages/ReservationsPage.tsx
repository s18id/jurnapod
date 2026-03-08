// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useMemo, useState } from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { Button, Card, Input } from "../shared/components/index.js";
import type { RuntimeReservation, RuntimeReservationStatus } from "../services/runtime-service.js";
import { usePosAppState } from "../router/pos-app-state.js";
import { useNavigate } from "react-router-dom";
import { routes } from "../router/routes.js";

interface ReservationsPageProps {
  context: WebBootstrapContext;
}

interface CreateReservationForm {
  customer_name: string;
  customer_phone: string;
  guest_count: string;
  reservation_at: string;
  duration_minutes: string;
  table_id: string;
  notes: string;
}

const statusActionMap: Record<RuntimeReservationStatus, RuntimeReservationStatus[]> = {
  BOOKED: ["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
  ARRIVED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function formatReservationTime(value: string): string {
  return new Date(value).toLocaleString();
}

export function ReservationsPage({ context }: ReservationsPageProps): JSX.Element {
  const navigate = useNavigate();
  const {
    scope,
    outletTables,
    setOutletTables,
    outletReservations,
    setOutletReservations,
    activeReservationId,
    setActiveReservationId,
    setDineInContext,
    setOrderStatus
  } = usePosAppState();
  const [submitInFlight, setSubmitInFlight] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<CreateReservationForm>(() => ({
    customer_name: "",
    customer_phone: "",
    guest_count: "2",
    reservation_at: toDateTimeLocal(new Date(Date.now() + 30 * 60_000).toISOString()),
    duration_minutes: "90",
    table_id: "",
    notes: ""
  }));

  useEffect(() => {
    let disposed = false;

    async function loadData() {
      const [tables, reservations] = await Promise.all([
        context.runtime.getOutletTables(scope),
        context.runtime.getOutletReservations(scope)
      ]);

      if (disposed) {
        return;
      }

      setOutletTables(tables);
      setOutletReservations(reservations);
    }

    void loadData();
    return () => {
      disposed = true;
    };
  }, [context.runtime, scope, setOutletReservations, setOutletTables]);

  const sortedReservations = useMemo(
    () => [...outletReservations].sort((left, right) => left.reservation_at.localeCompare(right.reservation_at)),
    [outletReservations]
  );

  const availableTables = useMemo(
    () => outletTables.filter((table) => table.status !== "OCCUPIED" && table.status !== "UNAVAILABLE"),
    [outletTables]
  );

  const activeReservation =
    outletReservations.find((reservation) => reservation.reservation_id === activeReservationId) ?? null;

  const activateReservationOrderContext = (reservation: RuntimeReservation) => {
    setActiveReservationId(reservation.reservation_id);
    setDineInContext({
      tableId: reservation.table_id,
      reservationId: reservation.reservation_id,
      guestCount: reservation.guest_count,
      notes: reservation.notes
    });
    setOrderStatus("OPEN");
  };

  const upsertReservation = (updated: RuntimeReservation | null) => {
    if (!updated) {
      return;
    }

    setOutletReservations((previous) => {
      const index = previous.findIndex((row) => row.reservation_id === updated.reservation_id);
      if (index < 0) {
        return [...previous, updated];
      }
      const next = [...previous];
      next[index] = updated;
      return next;
    });
  };

  const refreshTables = async () => {
    const tables = await context.runtime.getOutletTables(scope);
    setOutletTables(tables);
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Reservations</h1>
        <p style={{ margin: "8px 0 0", color: "#475569", fontSize: 13 }}>
          Create, check-in, seat, or close outlet reservations.
        </p>
      </header>

      <Card>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Create reservation</h2>
        <div style={{ display: "grid", gap: 8 }}>
          <Input
            id="reservation-customer-name"
            name="reservationCustomerName"
            value={form.customer_name}
            placeholder="Customer name"
            onChange={(value) => setForm((previous) => ({ ...previous, customer_name: value }))}
          />
          <Input
            id="reservation-customer-phone"
            name="reservationCustomerPhone"
            type="tel"
            value={form.customer_phone}
            placeholder="Customer phone"
            onChange={(value) => setForm((previous) => ({ ...previous, customer_phone: value }))}
          />
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <Input
              id="reservation-guest-count"
              name="reservationGuestCount"
              type="number"
              value={form.guest_count}
              placeholder="Guest count"
              onChange={(value) => setForm((previous) => ({ ...previous, guest_count: value }))}
              min={1}
            />
            <Input
              id="reservation-duration-minutes"
              name="reservationDurationMinutes"
              type="number"
              value={form.duration_minutes}
              placeholder="Duration (min)"
              onChange={(value) => setForm((previous) => ({ ...previous, duration_minutes: value }))}
              min={15}
            />
          </div>
          <input
            id="reservation-datetime"
            name="reservationDateTime"
            type="datetime-local"
            value={form.reservation_at}
            onChange={(event) => setForm((previous) => ({ ...previous, reservation_at: event.target.value }))}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 16
            }}
          />
          <select
            id="reservation-table-id"
            name="reservationTableId"
            value={form.table_id}
            onChange={(event) => setForm((previous) => ({ ...previous, table_id: event.target.value }))}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 16,
              background: "#ffffff"
            }}
          >
            <option value="">No table assigned</option>
            {availableTables.map((table) => (
              <option key={table.table_id} value={String(table.table_id)}>
                {table.code} ({table.status})
              </option>
            ))}
          </select>
          <Input
            id="reservation-notes"
            name="reservationNotes"
            value={form.notes}
            placeholder="Notes"
            onChange={(value) => setForm((previous) => ({ ...previous, notes: value }))}
          />
          <Button
            id="reservation-create"
            name="reservationCreate"
            variant="primary"
            fullWidth
            disabled={submitInFlight}
            onClick={() => {
              void (async () => {
                setSubmitInFlight(true);
                setErrorMessage(null);
                try {
                  const created = await context.runtime.createOutletReservation(scope, {
                    customer_name: form.customer_name,
                    customer_phone: form.customer_phone || null,
                    guest_count: Number(form.guest_count),
                    reservation_at: fromDateTimeLocal(form.reservation_at),
                    duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
                    table_id: form.table_id ? Number(form.table_id) : null,
                    notes: form.notes || null
                  });
                  upsertReservation(created);
                  activateReservationOrderContext(created);
                  await refreshTables();
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "Failed to create reservation");
                } finally {
                  setSubmitInFlight(false);
                }
              })();
            }}
          >
            {submitInFlight ? "Creating..." : "Create reservation"}
          </Button>
          {errorMessage ? (
            <p role="alert" style={{ margin: 0, color: "#991b1b", fontSize: 13, fontWeight: 600 }}>
              {errorMessage}
            </p>
          ) : null}
        </div>
      </Card>

      {activeReservation ? (
        <Card style={{ border: "1px solid #93c5fd", background: "#eff6ff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a" }}>ACTIVE RESERVATION CONTEXT</div>
          <div style={{ marginTop: 4, fontSize: 14, color: "#0f172a", fontWeight: 700 }}>
            {activeReservation.customer_name} • {activeReservation.status}
          </div>
        </Card>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        {sortedReservations.map((reservation) => (
          <Card key={reservation.reservation_id} style={{ border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{reservation.customer_name}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#334155" }}>
                  {reservation.guest_count} guest(s) • {formatReservationTime(reservation.reservation_at)}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                  Table {reservation.table_id ?? "-"} • {reservation.status}
                </div>
              </div>
              <Button
                id={`reservation-set-active-${reservation.reservation_id}`}
                name={`reservationSetActive-${reservation.reservation_id}`}
                variant={activeReservationId === reservation.reservation_id ? "primary" : "secondary"}
                size="small"
                onClick={() => activateReservationOrderContext(reservation)}
              >
                {activeReservationId === reservation.reservation_id ? "Active" : "Set active"}
              </Button>
            </div>

            {!(["COMPLETED", "CANCELLED", "NO_SHOW"] as RuntimeReservationStatus[]).includes(reservation.status) ? (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {reservation.table_id ? (
                    <Button
                      id={`reservation-continue-order-${reservation.reservation_id}`}
                      name={`reservationContinueOrder-${reservation.reservation_id}`}
                      size="small"
                      variant="primary"
                      onClick={() => {
                        activateReservationOrderContext(reservation);
                        navigate(routes.products.path);
                      }}
                    >
                      Continue order
                    </Button>
                  ) : null}
                  {statusActionMap[reservation.status].map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      id={`reservation-status-${reservation.reservation_id}-${nextStatus.toLowerCase()}`}
                      name={`reservationStatus-${reservation.reservation_id}-${nextStatus.toLowerCase()}`}
                      size="small"
                      variant={nextStatus === "CANCELLED" || nextStatus === "NO_SHOW" ? "danger" : "secondary"}
                      onClick={() => {
                        void (async () => {
                          try {
                            const updated = await context.runtime.updateReservationStatus(
                              scope,
                              reservation.reservation_id,
                              nextStatus
                            );
                            upsertReservation(updated);
                            if (updated && nextStatus === "SEATED") {
                              activateReservationOrderContext(updated);
                            }
                            await refreshTables();
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : "Failed to update reservation");
                          }
                        })();
                      }}
                    >
                      {nextStatus.replace("_", " ")}
                    </Button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    id={`reservation-table-assign-${reservation.reservation_id}`}
                    name={`reservationTableAssign-${reservation.reservation_id}`}
                    value={reservation.table_id ? String(reservation.table_id) : ""}
                    onChange={(event) => {
                      const nextTableId = event.target.value ? Number(event.target.value) : null;
                      void (async () => {
                        try {
                          const updated = await context.runtime.assignReservationTable(
                            scope,
                            reservation.reservation_id,
                            nextTableId
                          );
                          upsertReservation(updated);
                          await refreshTables();
                        } catch (error) {
                          setErrorMessage(error instanceof Error ? error.message : "Failed to assign table");
                        }
                      })();
                    }}
                    style={{
                      minWidth: 180,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      background: "#ffffff"
                    }}
                  >
                    <option value="">No table assigned</option>
                    {availableTables.map((table) => (
                      <option key={table.table_id} value={String(table.table_id)}>
                        {table.code} ({table.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
