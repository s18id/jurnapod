// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { MIN_TOUCH_TARGET } from "../utils/constants.js";
import { getTouchOptimizedStyles } from "../utils/touch.js";
import type { InputModeType } from "../hooks/useKeyboard.js";

export interface InputProps {
  id?: string;
  name?: string;
  type?: "text" | "number" | "email" | "password" | "search" | "tel";
  value: string | number;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputMode?: InputModeType;
  pattern?: string;
  autoComplete?: string;
  autoCorrect?: "on" | "off";
  autoCapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters";
  spellCheck?: boolean;
  min?: number;
  max?: number;
  fullWidth?: boolean;
}

export function Input({
  id,
  name,
  type = "text",
  value,
  onChange,
  onEnter,
  placeholder,
  disabled = false,
  autoFocus = false,
  inputMode,
  pattern,
  autoComplete,
  autoCorrect,
  autoCapitalize,
  spellCheck,
  min,
  max,
  fullWidth = true
}: InputProps): JSX.Element {
  const touchStyles = getTouchOptimizedStyles(disabled);

  const baseStyles: React.CSSProperties = {
    width: fullWidth ? "100%" : "auto",
    padding: "12px 16px",
    fontSize: "16px", // Prevents iOS auto-zoom
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    outline: "none",
    transition: "border-color 0.15s",
    backgroundColor: disabled ? "#f3f4f6" : "#ffffff",
    ...touchStyles
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <input
      id={id}
      name={name}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode={inputMode}
      pattern={pattern}
      autoComplete={autoComplete}
      autoCorrect={autoCorrect}
      autoCapitalize={autoCapitalize}
      spellCheck={spellCheck}
      min={min}
      max={max}
      style={baseStyles}
      onFocus={(e) => {
        e.target.style.borderColor = "#3b82f6";
        // Scroll input into view on mobile
        setTimeout(() => {
          e.target.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "#d1d5db";
      }}
    />
  );
}
