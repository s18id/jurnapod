// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { MIN_TOUCH_TARGET } from "../utils/constants.js";

export interface InputProps {
  type?: "text" | "number" | "email" | "password" | "search";
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputMode?: "text" | "numeric" | "email" | "search";
}

export function Input({
  type = "text",
  value,
  onChange,
  placeholder,
  disabled = false,
  autoFocus = false,
  inputMode
}: InputProps): JSX.Element {
  const baseStyles: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    fontSize: "16px", // Prevents iOS auto-zoom
    minHeight: `${MIN_TOUCH_TARGET}px`,
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    outline: "none",
    transition: "border-color 0.15s",
    backgroundColor: disabled ? "#f3f4f6" : "#ffffff"
  };

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode={inputMode}
      style={baseStyles}
      onFocus={(e) => {
        e.target.style.borderColor = "#3b82f6";
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "#d1d5db";
      }}
    />
  );
}
