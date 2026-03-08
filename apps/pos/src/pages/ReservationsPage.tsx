// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IonActionSheet,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonDatetime,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea
} from "@ionic/react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
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

function toIsoDateTime(value: string): string {
  if (!value) {
    return value;
  }

  if (value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value)) {
    return value;
  }

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
  const [actionSheetReservation, setActionSheetReservation] = useState<RuntimeReservation | null>(null);
  const autoSyncScopesRef = useRef<Set<string>>(new Set());
  const [form, setForm] = useState<CreateReservationForm>(() => ({
    customer_name: "",
    customer_phone: "",
    guest_count: "",
    reservation_at: "",
    duration_minutes: "",
    table_id: "",
    notes: ""
  }));

  useEffect(() => {
    let disposed = false;

    async function loadData() {
      let [tables, reservations] = await Promise.all([
        context.runtime.getOutletTables(scope),
        context.runtime.getOutletReservations(scope)
      ]);

      const scopeKey = `${scope.company_id}:${scope.outlet_id}`;
      const shouldAutoSync =
        context.runtime.isOnline() &&
        (tables.length === 0 || reservations.length === 0) &&
        !autoSyncScopesRef.current.has(scopeKey);

      if (shouldAutoSync) {
        autoSyncScopesRef.current.add(scopeKey);
        try {
          await context.sync.pull(scope);
          [tables, reservations] = await Promise.all([
            context.runtime.getOutletTables(scope),
            context.runtime.getOutletReservations(scope)
          ]);
        } catch (error) {
          console.error("Failed to auto-sync tables/reservations:", error);
        }
      }

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

  const statusActionButtons = useMemo(() => {
    if (!actionSheetReservation) {
      return [];
    }

    const nextStatusButtons = statusActionMap[actionSheetReservation.status].map((nextStatus) => ({
      text: nextStatus.replace("_", " "),
      role: (nextStatus === "CANCELLED" || nextStatus === "NO_SHOW") ? "destructive" : undefined,
      handler: () => {
        void (async () => {
          try {
            const updated = await context.runtime.updateReservationStatus(
              scope,
              actionSheetReservation.reservation_id,
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
      }
    }));

    const buttons: Array<{ text: string; role?: string; handler?: () => void }> = [];

    if (actionSheetReservation.table_id) {
      buttons.push({
        text: "Continue order",
        handler: () => {
          activateReservationOrderContext(actionSheetReservation);
          navigate(routes.products.path);
        }
      });
    }

    buttons.push(...nextStatusButtons);
    buttons.push({ text: "Cancel", role: "cancel" });
    return buttons;
  }, [actionSheetReservation, context.runtime, navigate, scope]);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Reservations</h1>
        <p style={{ margin: "8px 0 0", color: "#475569", fontSize: 13 }}>
          Create, check-in, seat, or close outlet reservations.
        </p>
      </header>

      <IonCard>
        <IonCardContent>
          <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Create reservation</h2>
          <IonList inset>
            <IonItem>
              <IonLabel position="stacked">Customer name</IonLabel>
              <IonInput
                id="reservation-customer-name"
                value={form.customer_name}
                onIonInput={(event) => setForm((previous) => ({ ...previous, customer_name: String(event.detail.value ?? "") }))}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Customer phone</IonLabel>
              <IonInput
                id="reservation-customer-phone"
                type="tel"
                value={form.customer_phone}
                onIonInput={(event) => setForm((previous) => ({ ...previous, customer_phone: String(event.detail.value ?? "") }))}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Guest count</IonLabel>
              <IonInput
                id="reservation-guest-count"
                type="number"
                min={1}
                value={form.guest_count}
                onIonInput={(event) => setForm((previous) => ({ ...previous, guest_count: String(event.detail.value ?? "") }))}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Duration (minutes)</IonLabel>
              <IonInput
                id="reservation-duration-minutes"
                type="number"
                min={15}
                value={form.duration_minutes}
                onIonInput={(event) => setForm((previous) => ({ ...previous, duration_minutes: String(event.detail.value ?? "") }))}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Reservation date & time</IonLabel>
              <IonDatetime
                id="reservation-datetime"
                presentation="date-time"
                preferWheel
                value={form.reservation_at || undefined}
                onIonChange={(event) => setForm((previous) => ({ ...previous, reservation_at: String(event.detail.value ?? "") }))}
              />
            </IonItem>
            <IonItem>
              <IonLabel>Assign table</IonLabel>
              <IonSelect
                id="reservation-table-id"
                interface="popover"
                value={form.table_id}
                onIonChange={(event) => setForm((previous) => ({ ...previous, table_id: String(event.detail.value ?? "") }))}
              >
                <IonSelectOption value="">No table assigned</IonSelectOption>
                {availableTables.map((table) => (
                  <IonSelectOption key={table.table_id} value={String(table.table_id)}>
                    {table.code} ({table.status})
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Notes</IonLabel>
              <IonTextarea
                id="reservation-notes"
                value={form.notes}
                autoGrow
                onIonInput={(event) => setForm((previous) => ({ ...previous, notes: String(event.detail.value ?? "") }))}
              />
            </IonItem>
          </IonList>

          <IonButton
            id="reservation-create"
            expand="block"
            disabled={submitInFlight}
            onClick={() => {
              void (async () => {
                setSubmitInFlight(true);
                setErrorMessage(null);
                try {
                  if (!form.customer_name.trim()) {
                    throw new Error("Customer name is required");
                  }

                  const guestCount = Number(form.guest_count);
                  if (!Number.isInteger(guestCount) || guestCount <= 0) {
                    throw new Error("Guest count must be a positive integer");
                  }

                  if (!form.reservation_at) {
                    throw new Error("Reservation time is required");
                  }

                  const created = await context.runtime.createOutletReservation(scope, {
                    customer_name: form.customer_name,
                    customer_phone: form.customer_phone || null,
                    guest_count: guestCount,
                    reservation_at: toIsoDateTime(form.reservation_at),
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
          </IonButton>
          {errorMessage ? (
            <IonText color="danger" style={{ fontSize: 13, fontWeight: 600 }}>
              <p role="alert" style={{ margin: "8px 0 0" }}>{errorMessage}</p>
            </IonText>
          ) : null}
        </IonCardContent>
      </IonCard>

      {activeReservation ? (
        <IonCard style={{ border: "1px solid #93c5fd", background: "#eff6ff" }}>
          <IonCardContent>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a" }}>ACTIVE RESERVATION CONTEXT</div>
            <div style={{ marginTop: 4, fontSize: 14, color: "#0f172a", fontWeight: 700 }}>
              {activeReservation.customer_name} • {activeReservation.status}
            </div>
          </IonCardContent>
        </IonCard>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        {sortedReservations.map((reservation) => {
          const isFinalState = (["COMPLETED", "CANCELLED", "NO_SHOW"] as RuntimeReservationStatus[]).includes(reservation.status);

          return (
            <IonCard key={reservation.reservation_id} style={{ border: "1px solid #e2e8f0" }}>
              <IonCardContent>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{reservation.customer_name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#334155" }}>
                      {reservation.guest_count} guest(s) • {formatReservationTime(reservation.reservation_at)}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                      Table {reservation.table_id ?? "-"}
                    </div>
                  </div>
                  <IonButton
                    id={`reservation-set-active-${reservation.reservation_id}`}
                    fill={activeReservationId === reservation.reservation_id ? "solid" : "outline"}
                    color={activeReservationId === reservation.reservation_id ? "primary" : "medium"}
                    size="small"
                    onClick={() => activateReservationOrderContext(reservation)}
                  >
                    {activeReservationId === reservation.reservation_id ? "Active" : "Set active"}
                  </IonButton>
                </div>

                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <IonBadge color="tertiary">{reservation.status}</IonBadge>
                  {!isFinalState ? (
                    <IonButton
                      id={`reservation-actions-${reservation.reservation_id}`}
                      size="small"
                      fill="outline"
                      color="medium"
                      onClick={() => {
                        setActionSheetReservation(reservation);
                      }}
                    >
                      Actions
                    </IonButton>
                  ) : null}
                </div>

                {!isFinalState ? (
                  <div style={{ marginTop: 10 }}>
                    <IonItem lines="none" style={{ paddingInlineStart: 0 }}>
                      <IonLabel>Assign table</IonLabel>
                      <IonSelect
                        id={`reservation-table-assign-${reservation.reservation_id}`}
                        interface="popover"
                        value={reservation.table_id ? String(reservation.table_id) : ""}
                        onIonChange={(event) => {
                          const nextTableId = event.detail.value ? Number(event.detail.value) : null;
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
                      >
                        <IonSelectOption value="">No table assigned</IonSelectOption>
                        {availableTables.map((table) => (
                          <IonSelectOption key={table.table_id} value={String(table.table_id)}>
                            {table.code} ({table.status})
                          </IonSelectOption>
                        ))}
                      </IonSelect>
                    </IonItem>
                  </div>
                ) : null}
              </IonCardContent>
            </IonCard>
          );
        })}
      </div>

      <IonActionSheet
        isOpen={actionSheetReservation !== null}
        header={actionSheetReservation ? `Actions: ${actionSheetReservation.customer_name}` : undefined}
        buttons={statusActionButtons}
        onDidDismiss={() => {
          setActionSheetReservation(null);
        }}
      />
    </div>
  );
}
