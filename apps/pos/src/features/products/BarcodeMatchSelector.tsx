// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Modal } from "../../shared/components/Modal.js";
import { Button } from "../../shared/components/Button.js";
import { formatMoney } from "../../shared/utils/money.js";
import type { ProductItemType } from "@jurnapod/offline-db/dexie";

export interface BarcodeMatch {
  item_id: number;
  variant_id?: number;
  name: string;
  variant_name?: string | null;
  sku: string | null;
  barcode: string | null;
  price_snapshot: number;
  item_type: ProductItemType;
}

export interface BarcodeMatchSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  matches: BarcodeMatch[];
  onSelect: (match: BarcodeMatch) => void;
}

export function BarcodeMatchSelector({
  isOpen,
  onClose,
  barcode,
  matches,
  onSelect
}: BarcodeMatchSelectorProps): JSX.Element {
  const handleSelect = (match: BarcodeMatch) => {
    onSelect(match);
    onClose();
  };

  const getItemTypeLabel = (itemType: BarcodeMatch["item_type"]): string => {
    const labels: Record<ProductItemType, string> = {
      PRODUCT: "Product",
      SERVICE: "Service",
      INGREDIENT: "Ingredient",
      RECIPE: "Recipe"
    };
    return labels[itemType];
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Multiple matches for "${barcode}"`}
    >
      <div className="barcode-match-selector-content">
        <p className="barcode-match-info">
          {matches.length} items found with this barcode. Select the correct item:
        </p>

        <div className="barcode-matches-list">
          {matches.map((match) => (
            <button
              key={`${match.item_id}-${match.variant_id ?? "base"}`}
              type="button"
              className="barcode-match-option"
              onClick={() => handleSelect(match)}
            >
              <div className="match-info">
                <div className="match-name">{match.name}</div>
                {match.variant_name && (
                  <div className="match-variant">{match.variant_name}</div>
                )}
                <div className="match-details">
                  <span className="match-price">{formatMoney(match.price_snapshot)}</span>
                  {match.sku && (
                    <span className="match-sku">SKU: {match.sku}</span>
                  )}
                </div>
                <div className="match-meta">
                  <span className="match-type">{getItemTypeLabel(match.item_type)}</span>
                </div>
              </div>
              <div className="match-action">
                <span className="select-arrow">→</span>
              </div>
            </button>
          ))}
        </div>

        <div className="barcode-selector-actions">
          <Button variant="secondary" onClick={onClose} fullWidth>
            Cancel
          </Button>
        </div>
      </div>

      <style>{`
        .barcode-match-selector-content {
          padding: 0.5rem 0;
        }

        .barcode-match-info {
          margin: 0 0 1rem 0;
          padding: 0.75rem;
          background: #f1f5f9;
          border-radius: 8px;
          font-size: 0.875rem;
          color: #475569;
        }

        .barcode-matches-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          max-height: 400px;
          overflow-y: auto;
        }

        .barcode-match-option {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
        }

        .barcode-match-option:hover {
          border-color: #3b82f6;
          background: #f8fafc;
        }

        .barcode-match-option:active {
          border-color: #2563eb;
          background: #eff6ff;
        }

        .match-info {
          flex: 1;
          min-width: 0;
        }

        .match-name {
          font-weight: 600;
          font-size: 1rem;
          color: #1f2937;
          margin-bottom: 0.25rem;
          word-break: break-word;
        }

        .match-variant {
          font-size: 0.875rem;
          color: #3b82f6;
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .match-details {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.25rem;
        }

        .match-price {
          font-size: 0.875rem;
          font-weight: 600;
          color: #059669;
        }

        .match-sku {
          font-size: 0.75rem;
          color: #6b7280;
          font-family: monospace;
          background: #f3f4f6;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
        }

        .match-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .match-type {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .match-action {
          flex-shrink: 0;
        }

        .select-arrow {
          font-size: 1.25rem;
          color: #3b82f6;
          font-weight: 600;
        }

        .barcode-selector-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        @media (max-width: 639px) {
          .barcode-selector-actions {
            flex-direction: column;
          }

          .barcode-match-option {
            padding: 0.75rem;
          }

          .match-name {
            font-size: 0.9375rem;
          }

          .match-variant {
            font-size: 0.8125rem;
          }

          .match-price {
            font-size: 0.8125rem;
          }

          .match-details {
            flex-wrap: wrap;
            gap: 0.5rem;
          }
        }
      `}</style>
    </Modal>
  );
}
