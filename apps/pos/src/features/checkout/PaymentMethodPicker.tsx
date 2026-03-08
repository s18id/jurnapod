// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";

export interface PaymentMethodPickerProps {
  value: string;
  options: string[];
  onChange: (method: string) => void;
}

export function PaymentMethodPicker({ value, options, onChange }: PaymentMethodPickerProps): JSX.Element {
  return (
    <select
      id="checkout-payment-method"
      name="checkoutPaymentMethod"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #cbd5e1",
        fontSize: 16,
        minHeight: 44
      }}
    >
      {options.map((method) => (
        <option key={method} value={method}>
          {method}
        </option>
      ))}
    </select>
  );
}
