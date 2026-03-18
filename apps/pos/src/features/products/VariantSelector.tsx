// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useState, useMemo } from "react";
import { IonBadge } from "@ionic/react";
import { Modal } from "../../shared/components/Modal.js";
import { Button } from "../../shared/components/Button.js";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";
import { formatMoney } from "../../shared/utils/money.js";

export interface Variant {
  variant_id: number;
  variant_name: string;
  price: number;
  stock_quantity: number;
}

export interface VariantSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  product: RuntimeProductCatalogItem | null;
  variants: Variant[];
  onAddToCart: (product: RuntimeProductCatalogItem, variantId: number, allowOutOfStockOverride?: boolean) => void;
  allowOutOfStockOverride?: boolean;
}

export function VariantSelector({
  isOpen,
  onClose,
  product,
  variants,
  onAddToCart,
  allowOutOfStockOverride = false
}: VariantSelectorProps): JSX.Element {
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [confirmOutOfStock, setConfirmOutOfStock] = useState(false);

  const hasVariants = variants.length > 0;

  const sortedVariants = useMemo(() => {
    return [...variants].sort((a, b) => a.variant_name.localeCompare(b.variant_name));
  }, [variants]);

  const handleClose = () => {
    setSelectedVariantId(null);
    setConfirmOutOfStock(false);
    onClose();
  };

  const selectedVariant = selectedVariantId ? variants.find(v => v.variant_id === selectedVariantId) : null;
  const isSelectedOutOfStock = selectedVariant ? selectedVariant.stock_quantity <= 0 : false;

  const handleAddToCart = () => {
    if (product && selectedVariantId) {
      const effectiveOverride = allowOutOfStockOverride && confirmOutOfStock;
      onAddToCart(product, selectedVariantId, effectiveOverride);
      handleClose();
    }
  };

  const getStockBadge = (stockQuantity: number): { color: string; text: string } => {
    if (stockQuantity <= 0) {
      return { color: "danger", text: "Out of Stock" };
    }
    if (stockQuantity <= 5) {
      return { color: "warning", text: `${stockQuantity} left` };
    }
    return { color: "success", text: `${stockQuantity} in stock` };
  };

  const basePrice = product?.price_snapshot ?? 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={product?.name ?? "Select Variant"}>
      <div className="variant-selector-content">
        {!hasVariants ? (
          <div className="no-variants-message">
            <p>No variants available for this product.</p>
          </div>
        ) : (
          <>
            <div className="variants-list">
              {sortedVariants.map((variant) => {
                const isSelected = selectedVariantId === variant.variant_id;
                const isOutOfStock = variant.stock_quantity <= 0;
                const stockBadge = getStockBadge(variant.stock_quantity);
                const priceDiff = variant.price - basePrice;
                const hasPriceOverride = priceDiff !== 0;

                return (
                  <button
                    key={variant.variant_id}
                    id={`variant-option-${variant.variant_id}`}
                    name={`variantOption-${variant.variant_id}`}
                    type="button"
                    className={`variant-option ${isSelected ? "selected" : ""} ${isOutOfStock ? "out-of-stock" : ""}`}
                    onClick={() => setSelectedVariantId(variant.variant_id)}
                  >
                    <div className="variant-info">
                      <div className="variant-name">{variant.variant_name}</div>
                      <div className="variant-price-row">
                        <span className="variant-price">{formatMoney(variant.price)}</span>
                        {hasPriceOverride && (
                          <span className={`price-diff ${priceDiff > 0 ? "positive" : "negative"}`}>
                            {priceDiff > 0 ? "+" : ""}
                            {formatMoney(priceDiff)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="variant-stock">
                      <IonBadge color={stockBadge.color as "danger" | "warning" | "success"}>
                        {stockBadge.text}
                      </IonBadge>
                    </div>
                    {isSelected && (
                      <div className="selected-indicator">
                        <span>✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {allowOutOfStockOverride && isSelectedOutOfStock && (
              <div className="out-of-stock-confirm">
                <label className="confirm-label">
                  <input
                    type="checkbox"
                    checked={confirmOutOfStock}
                    onChange={(e) => setConfirmOutOfStock(e.target.checked)}
                  />
                  <span>Confirm: Sell out-of-stock variant</span>
                </label>
              </div>
            )}

            <div className="variant-selector-actions">
              <Button variant="secondary" onClick={handleClose} fullWidth>
                Cancel
              </Button>
              <Button
                id="variant-add-to-cart"
                name="variantAddToCart"
                variant={isSelectedOutOfStock ? "danger" : "primary"}
                onClick={handleAddToCart}
                fullWidth
                disabled={!selectedVariantId || (allowOutOfStockOverride && isSelectedOutOfStock && !confirmOutOfStock)}
              >
                {selectedVariantId ? (isSelectedOutOfStock ? "Override Stock" : "Add to Cart") : "Select a Variant"}
              </Button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .variant-selector-content {
          padding: 0.5rem 0;
        }

        .no-variants-message {
          padding: 2rem;
          text-align: center;
          color: #6b7280;
        }

        .variants-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          max-height: 400px;
          overflow-y: auto;
        }

        .variant-option {
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

        .variant-option:hover:not(.disabled) {
          border-color: #3b82f6;
          background: #f8fafc;
        }

        .variant-option.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .variant-option.out-of-stock {
          border-color: #fca5a5;
          background: #fef2f2;
        }

        .variant-option.out-of-stock:hover {
          border-color: #f87171;
          background: #fee2e2;
        }

        .out-of-stock-confirm {
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 8px;
        }

        .confirm-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #991b1b;
          cursor: pointer;
        }

        .confirm-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .variant-info {
          flex: 1;
          min-width: 0;
        }

        .variant-name {
          font-weight: 600;
          font-size: 1rem;
          color: #1f2937;
          margin-bottom: 0.25rem;
          word-break: break-word;
        }

        .variant-price-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .variant-price {
          font-size: 0.875rem;
          font-weight: 600;
          color: #059669;
        }

        .price-diff {
          font-size: 0.75rem;
          font-weight: 500;
        }

        .price-diff.positive {
          color: #dc2626;
        }

        .price-diff.negative {
          color: #059669;
        }

        .variant-stock {
          flex-shrink: 0;
        }

        .selected-indicator {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #3b82f6;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          flex-shrink: 0;
        }

        .variant-selector-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        @media (max-width: 639px) {
          .variant-selector-actions {
            flex-direction: column-reverse;
          }

          .variant-option {
            padding: 0.75rem;
          }

          .variant-name {
            font-size: 0.9375rem;
          }

          .variant-price {
            font-size: 0.8125rem;
          }
        }
      `}</style>
    </Modal>
  );
}
