// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonSearchbar } from "@ionic/react";
import { SEARCH_DEBOUNCE_MS } from "../../shared/utils/constants.js";

export interface ProductSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProductSearch({ value, onChange }: ProductSearchProps): JSX.Element {
  return (
    <div style={{ marginTop: 16 }}>
      <label htmlFor="product-search" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
        Product search
      </label>
      <IonSearchbar
        id="product-search"
        value={value}
        debounce={SEARCH_DEBOUNCE_MS}
        onIonInput={(event) => onChange((event.detail.value ?? "").toString())}
        placeholder="Search by name, SKU, or scan barcode"
        inputmode="search"
      />
    </div>
  );
}
