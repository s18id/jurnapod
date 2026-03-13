// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonButton, IonIcon, IonInput, IonItem, IonLabel, IonText } from "@ionic/react";
import { addCircle, removeCircle } from "ionicons/icons";
import { PaymentMethodPicker } from "./PaymentMethodPicker.js";
import { QuickAmountButtons } from "./QuickAmountButtons.js";
import { CartSummary } from "../cart/CartSummary.js";
import type { CartTotals, PaymentEntry } from "../../shared/utils/money.js";
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
  payments: PaymentEntry[];
  onPaymentsChange: (payments: PaymentEntry[]) => void;
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
  payments,
  onPaymentsChange,
  onComplete
}: CheckoutFormProps): JSX.Element {
  const remainingAmount = normalizeMoney(totals.grand_total - totals.paid_total);
  const isExact = remainingAmount === 0;
  const isOverpaid = remainingAmount < 0;

  const handlePaymentMethodChange = (index: number, method: string) => {
    const updated = [...payments];
    updated[index] = { ...updated[index], method };
    onPaymentsChange(updated);
  };

  const handlePaymentAmountChange = (index: number, amount: number) => {
    const updated = [...payments];
    updated[index] = { ...updated[index], amount: normalizeMoney(amount) };
    onPaymentsChange(updated);
  };

  const handleAddPayment = () => {
    const usedMethods = new Set(payments.map(p => p.method));
    const availableMethod = paymentMethods.find(m => !usedMethods.has(m)) ?? paymentMethods[0] ?? "CASH";
    onPaymentsChange([...payments, { method: availableMethod, amount: 0 }]);
  };

  const handleRemovePayment = (index: number) => {
    if (payments.length <= 1) return;
    const updated = payments.filter((_, i) => i !== index);
    onPaymentsChange(updated);
  };

  const handlePayRemaining = () => {
    if (remainingAmount <= 0) return;
    const updated = [...payments];
    updated[payments.length - 1] = { 
      ...updated[payments.length - 1], 
      amount: normalizeMoney(updated[payments.length - 1].amount + remainingAmount) 
    };
    onPaymentsChange(updated);
  };

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Payment</div>
      <div style={{ marginBottom: 8, fontSize: 12, color: "#475569" }}>
        Allowed methods: {paymentMethods.join(", ")} (tax: {taxConfig.rate}% /{" "}
        {taxConfig.inclusive ? "inclusive" : "exclusive"})
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {payments.map((payment, index) => (
          <div key={index} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <PaymentMethodPicker
                value={payment.method}
                options={paymentMethods}
                onChange={(method) => handlePaymentMethodChange(index, method)}
              />
            </div>
            <IonItem style={{ flex: 1 }}>
              <IonLabel position="stacked">Amount</IonLabel>
              <IonInput
                type="number"
                value={payment.amount}
                min={0}
                inputmode="decimal"
                onIonInput={(event) => handlePaymentAmountChange(index, Number(event.detail.value) || 0)}
              />
            </IonItem>
            {payments.length > 1 && (
              <IonButton
                fill="clear"
                color="danger"
                onClick={() => handleRemovePayment(index)}
                style={{ marginTop: 16 }}
              >
                <IonIcon icon={removeCircle} slot="icon-only" />
              </IonButton>
            )}
          </div>
        ))}
      </div>

      {paymentMethods.length > payments.length && (
        <IonButton
          fill="clear"
          onClick={handleAddPayment}
          style={{ marginTop: 8 }}
        >
          <IonIcon icon={addCircle} slot="start" />
          Add Payment Method
        </IonButton>
      )}

      <QuickAmountButtons 
        total={remainingAmount > 0 ? remainingAmount : totals.grand_total} 
        onSelectAmount={(amount) => {
          if (remainingAmount > 0 && amount >= remainingAmount) {
            handlePayRemaining();
          } else {
            handlePaymentAmountChange(payments.length - 1, amount);
          }
        }} 
      />

      <CartSummary totals={totals} />

      {isOverpaid && (
        <IonText color="danger" style={{ marginTop: 8, display: "block", fontSize: 12 }}>
          Overpayment: Rp {normalizeMoney(-remainingAmount).toLocaleString("id-ID")}
        </IonText>
      )}

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
        disabled={!canComplete || completeInFlight || !isExact}
        style={{ marginTop: 18, width: "100%" }}
      >
        {completeInFlight ? "Completing sale..." : "Complete sale offline"}
      </IonButton>
    </div>
  );
}
