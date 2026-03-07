// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Input } from "../../shared/components/index.js";
import { SEARCH_DEBOUNCE_MS } from "../../shared/utils/constants.js";

export interface ProductSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProductSearch({ value, onChange }: ProductSearchProps): JSX.Element {
  const [localValue, setLocalValue] = React.useState(value);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onChange(localValue);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [localValue, onChange]);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div style={{ marginTop: 16 }}>
      <label htmlFor="product-search" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
        Product search
      </label>
      <Input
        id="product-search"
        value={localValue}
        onChange={setLocalValue}
        placeholder="Search by name or SKU"
        inputMode="search"
      />
    </div>
  );
}
