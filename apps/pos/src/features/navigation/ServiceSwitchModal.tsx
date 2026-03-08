// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useState, useMemo } from "react";
import { Modal } from "../../shared/components/Modal.js";
import { Button } from "../../shared/components/Button.js";
import type { RuntimeOutletTable } from "../../services/runtime-service.js";
import type { OrderServiceType } from "../cart/useCart.js";

export interface ServiceSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromServiceType: OrderServiceType;
  toServiceType: OrderServiceType;
  onConfirm: (selectedTableId?: number) => void;
  availableTables?: RuntimeOutletTable[];
  hasActiveItems: boolean;
}

export function ServiceSwitchModal({
  isOpen,
  onClose,
  fromServiceType,
  toServiceType,
  onConfirm,
  availableTables = [],
  hasActiveItems
}: ServiceSwitchModalProps): JSX.Element {
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  const isDineInSwitch = toServiceType === "DINE_IN";
  const isTakeawaySwitch = toServiceType === "TAKEAWAY";

  const availableTablesForSelection = useMemo(
    () => availableTables.filter((t) => t.status === "AVAILABLE"),
    [availableTables]
  );

  const handleConfirm = () => {
    if (isDineInSwitch && !selectedTableId) {
      // Don't allow confirmation without table selection for dine-in
      return;
    }
    onConfirm(selectedTableId ?? undefined);
    setSelectedTableId(null);
  };

  const handleClose = () => {
    setSelectedTableId(null);
    onClose();
  };

  const title = `Switch to ${toServiceType === "TAKEAWAY" ? "Takeaway" : "Dine-In"}?`;

  const getMessage = () => {
    if (isTakeawaySwitch && hasActiveItems) {
      return "Switching to takeaway will release the current table. The order will continue as takeaway.";
    }
    if (isDineInSwitch && hasActiveItems) {
      return "Switching to dine-in requires selecting a table. The order will be transferred to the selected table.";
    }
    if (isDineInSwitch) {
      return "Please select a table to start a dine-in order.";
    }
    return "Are you sure you want to switch service modes?";
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="service-switch-modal-content">
        <p className="service-switch-message">{getMessage()}</p>

        {isDineInSwitch && (
          <div className="table-selection">
            <h3 className="table-selection-title">Select a Table</h3>
            {availableTablesForSelection.length === 0 ? (
              <p className="no-tables-message">
                No available tables. Please free up a table or use takeaway mode.
              </p>
            ) : (
              <div className="table-grid">
                {availableTablesForSelection.map((table) => (
                  <button
                    key={table.table_id}
                    type="button"
                    className={`table-button ${selectedTableId === table.table_id ? "selected" : ""}`}
                    onClick={() => setSelectedTableId(table.table_id)}
                  >
                    <div className="table-number">T{table.table_id}</div>
                    <div className="table-capacity">{table.capacity ?? 4} seats</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="service-switch-actions">
          <Button variant="secondary" onClick={handleClose} fullWidth>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            fullWidth
            disabled={isDineInSwitch && !selectedTableId}
          >
            {isDineInSwitch && !selectedTableId
              ? "Select a Table"
              : "Confirm Switch"}
          </Button>
        </div>
      </div>

      <style>{`
        .service-switch-modal-content {
          padding: 1rem 0;
        }

        .service-switch-message {
          margin: 0 0 1.5rem;
          font-size: 1rem;
          line-height: 1.5;
          color: #374151;
        }

        .table-selection {
          margin-bottom: 1.5rem;
        }

        .table-selection-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0 0 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .no-tables-message {
          padding: 1rem;
          background: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 8px;
          color: #92400e;
          font-size: 0.875rem;
          margin: 0;
        }

        .table-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 0.75rem;
        }

        .table-button {
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 1rem 0.75rem;
          cursor: pointer;
          transition: all 0.2s ease;
          min-height: 80px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .table-button:hover {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .table-button.selected {
          border-color: #3b82f6;
          background: #3b82f6;
          color: white;
        }

        .table-number {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
        }

        .table-capacity {
          font-size: 0.75rem;
          opacity: 0.8;
        }

        .table-button.selected .table-capacity {
          opacity: 1;
        }

        .service-switch-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }

        @media (max-width: 639px) {
          .service-switch-actions {
            flex-direction: column-reverse;
          }

          .table-grid {
            grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
          }
        }
      `}</style>
    </Modal>
  );
}
