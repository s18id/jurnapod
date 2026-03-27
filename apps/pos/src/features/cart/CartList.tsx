// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonList, IonText } from "@ionic/react";
import { CartLine, type CartLineData } from "./CartLine.js";
import { getCartLineKey } from "./useCart.js";

export interface CartListProps {
  lines: CartLineData[];
  onUpdateLine: (itemId: number, variantId: number | undefined, patch: { qty?: number; discount_amount?: number }) => void;
  onQuickReduceLine?: (itemId: number, variantId: number | undefined) => void;
}

function getLineKey(line: CartLineData): string {
  return getCartLineKey(line.product.item_id, line.product.variant_id);
}

export function CartList({ lines, onUpdateLine, onQuickReduceLine }: CartListProps): JSX.Element {
  if (lines.length === 0) {
    return (
      <IonItem lines="none">
        <IonText color="medium">Cart is empty.</IonText>
      </IonItem>
    );
  }

  return (
    <IonList style={{ display: "grid", gap: 10 }}>
      {lines.map((line) => {
        const lineKey = getLineKey(line);
        return (
          <IonItemSliding key={lineKey}>
            <IonItem lines="none">
              <CartLine
                line={line}
                onQuantityChange={(qty) => onUpdateLine(line.product.item_id, line.product.variant_id, { qty })}
                onDiscountChange={(discount) => onUpdateLine(line.product.item_id, line.product.variant_id, { discount_amount: discount })}
              />
            </IonItem>
            {onQuickReduceLine ? (
              <IonItemOptions side="end">
                <IonItemOption
                  color="danger"
                  onClick={() => {
                    onQuickReduceLine(line.product.item_id, line.product.variant_id);
                  }}
                >
                  Reduce 1
                </IonItemOption>
              </IonItemOptions>
            ) : null}
          </IonItemSliding>
        );
      })}
    </IonList>
  );
}
