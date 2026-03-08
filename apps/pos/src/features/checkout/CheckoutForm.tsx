// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonButton, IonInput, IonItem, IonLabel, IonText } from "@ionic/react";
import { PaymentMethodPicker } from "./PaymentMethodPicker.js";
import { QuickAmountButtons } from "./QuickAmountButtons.js";
import { CartSummary } from "../cart/CartSummary.js";
import type { CartTotals } from "../../shared/utils/money.js";
import { normalizeMoney } from "../../shared/utils/money.js";

export interface CheckoutFormProps {
  paymentMethod: string;
  paymentMethods: string[];
  taxConfig: {
    rate: number;
    inclusive: boolean;
  };
  totals: CartTotals;
  paymentMethodAllowed: boolean;
  canComplete: boolean;
  completeInFlight: boolean;
  onPaymentMethodChange: (method: string) => void;
  onPaidAmountChange: (amount: number) => void;
  onComplete: () => void;
}

export function CheckoutForm({
  paymentMethod,
  paymentMethods,
  taxConfig,
  totals,
  paymentMethodAllowed,
  canComplete,
  completeInFlight,
  onPaymentMethodChange,
  onPaidAmountChange,
  onComplete
}: CheckoutFormProps): JSX.Element {
  return (
    <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Payment</div>
      <div style={{ marginBottom: 8, fontSize: 12, color: "#475569" }}>
        Allowed methods: {paymentMethods.join(", ")} (tax: {taxConfig.rate}% /{" "}
        {taxConfig.inclusive ? "inclusive" : "exclusive"})
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <PaymentMethodPicker
          value={paymentMethod}
          options={paymentMethods}
          onChange={onPaymentMethodChange}
        />
        <IonItem>
          <IonLabel position="stacked">Paid amount</IonLabel>
          <IonInput
            id="checkout-paid-amount"
            type="number"
            value={totals.paid_total}
            min={0}
            inputmode="decimal"
            onIonInput={(event) => onPaidAmountChange(normalizeMoney(Number(event.detail.value) || 0))}
          />
        </IonItem>
      </div>

      <QuickAmountButtons total={totals.grand_total} onSelectAmount={onPaidAmountChange} />

      <CartSummary totals={totals} />

      {!paymentMethodAllowed ? (
        <IonText color="danger" style={{ marginTop: 8, display: "block", fontSize: 12 }}>
          Selected payment method is not allowed for this outlet. It will be corrected on next refresh.
        </IonText>
      ) : null}

      <IonButton
        id="checkout-complete-sale"
        color="primary"
        expand="block"
        onClick={onComplete}
        disabled={!canComplete || completeInFlight}
        style={{ marginTop: 18, width: "100%" }}
      >
        {completeInFlight ? "Completing sale..." : "Complete sale offline"}
      </IonButton>
    </div>
  );
}
