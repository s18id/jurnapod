// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonItem, IonLabel, IonSelect, IonSelectOption } from "@ionic/react";

export interface PaymentMethodPickerProps {
  value: string;
  options: string[];
  onChange: (method: string) => void;
}

export function PaymentMethodPicker({ value, options, onChange }: PaymentMethodPickerProps): JSX.Element {
  return (
    <IonItem>
      <IonLabel>Method</IonLabel>
      <IonSelect
        id="checkout-payment-method"
        interface="action-sheet"
        value={value}
        onIonChange={(event) => onChange(String(event.detail.value ?? ""))}
      >
        {options.map((method) => (
          <IonSelectOption key={method} value={method}>
            {method}
          </IonSelectOption>
        ))}
      </IonSelect>
    </IonItem>
  );
}
