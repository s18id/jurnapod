// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonList, IonText } from "@ionic/react";
import { CartLine, type CartLineData } from "./CartLine.js";

export interface CartListProps {
  lines: CartLineData[];
  onUpdateLine: (itemId: number, patch: { qty?: number; discount_amount?: number }) => void;
  onQuickReduceLine?: (itemId: number) => void;
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
      {lines.map((line) => (
        <IonItemSliding key={line.product.item_id}>
          <IonItem lines="none">
            <CartLine
              line={line}
              onQuantityChange={(qty) => onUpdateLine(line.product.item_id, { qty })}
              onDiscountChange={(discount) => onUpdateLine(line.product.item_id, { discount_amount: discount })}
            />
          </IonItem>
          {onQuickReduceLine ? (
            <IonItemOptions side="end">
              <IonItemOption
                color="danger"
                onClick={() => {
                  onQuickReduceLine(line.product.item_id);
                }}
              >
                Reduce 1
              </IonItemOption>
            </IonItemOptions>
          ) : null}
        </IonItemSliding>
      ))}
    </IonList>
  );
}
