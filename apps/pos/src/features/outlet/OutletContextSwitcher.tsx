// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useMemo, useState } from "react";
import { Button, Modal } from "../../shared/components/index.js";

interface OutletOption {
  outlet_id: number;
  label: string;
}

export interface OutletContextSwitcherProps {
  outletOptions: OutletOption[];
  activeOutletId: number;
  onConfirmSwitch: (outletId: number) => void;
  compact?: boolean;
  hasActiveTable?: boolean;
  serviceType?: "TAKEAWAY" | "DINE_IN";
}

export function OutletContextSwitcher({
  outletOptions,
  activeOutletId,
  onConfirmSwitch,
  compact = false,
  hasActiveTable = false,
  serviceType = "TAKEAWAY"
}: OutletContextSwitcherProps): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingOutletId, setPendingOutletId] = useState(activeOutletId);

  const activeOutletLabel = useMemo(
    () => outletOptions.find((option) => option.outlet_id === activeOutletId)?.label ?? `Outlet ${activeOutletId}`,
    [activeOutletId, outletOptions]
  );

  const pendingOutletLabel = useMemo(
    () => outletOptions.find((option) => option.outlet_id === pendingOutletId)?.label ?? `Outlet ${pendingOutletId}`,
    [pendingOutletId, outletOptions]
  );

  const hasMultipleOutlets = outletOptions.length > 1;

  const openModal = () => {
    setPendingOutletId(activeOutletId);
    setIsModalOpen(true);
  };

  const handleConfirm = () => {
    onConfirmSwitch(pendingOutletId);
    setIsModalOpen(false);
  };

  return (
    <>
      <section
        style={{
          marginBottom: compact ? 0 : 16,
          padding: compact ? 8 : 12,
          borderRadius: compact ? 999 : 12,
          border: compact ? "1px solid #cbd5e1" : "1px solid #dbeafe",
          background: compact ? "#f8fafc" : "#eff6ff"
        }}
      >
        {!compact ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", letterSpacing: "0.04em" }}>
            ACTIVE OUTLET
          </div>
        ) : null}
        <div
          style={{
            marginTop: compact ? 0 : 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12
          }}
        >
          <div
            style={{
              fontSize: compact ? 12 : 14,
              fontWeight: 700,
              color: "#1e293b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            {compact ? `Outlet: ${activeOutletLabel}` : activeOutletLabel}
          </div>
          <Button variant="secondary" size="small" onClick={openModal} disabled={!hasMultipleOutlets}>
            {compact ? "Switch" : "Switch outlet"}
          </Button>
        </div>
      </section>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Switch outlet">
        <p style={{ marginTop: 0, marginBottom: 12, color: "#334155", fontSize: 14 }}>
          Switching outlet is a destructive context change.
        </p>
        <ul style={{ marginTop: 0, marginBottom: 16, paddingLeft: 18, color: "#334155", fontSize: 13 }}>
          <li>Current cart and order draft will be cleared.</li>
          <li>Payment draft will be reset.</li>
          {hasActiveTable && serviceType === "DINE_IN" && (
            <li style={{ fontWeight: 600, color: "#dc2626" }}>
              Active dine-in table will be released.
            </li>
          )}
          <li>Product context will reload for the selected outlet.</li>
          <li>You will continue from the products screen.</li>
        </ul>

        <label htmlFor="pending-outlet-select" style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#0f172a" }}>
          Switch to
        </label>
        <select
          id="pending-outlet-select"
          value={pendingOutletId}
          onChange={(event) => setPendingOutletId(Number(event.target.value))}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            fontSize: 14,
            marginBottom: 16
          }}
        >
          {outletOptions.map((option) => (
            <option key={option.outlet_id} value={option.outlet_id}>
              {option.label}
            </option>
          ))}
        </select>

        <div style={{ marginBottom: 14, fontSize: 13, color: "#475569" }}>
          Selected outlet: <strong>{pendingOutletLabel}</strong>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={pendingOutletId === activeOutletId}>
            Confirm switch
          </Button>
        </div>
      </Modal>
    </>
  );
}
