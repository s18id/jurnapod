// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonInput } from "@ionic/react";
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
    boxSizing: "border-box",
    fontSize: "16px", // Prevents iOS auto-zoom
    ["--padding-start" as string]: "16px",
    ["--padding-end" as string]: "16px",
    ["--padding-top" as string]: "12px",
    ["--padding-bottom" as string]: "12px",
    ["--background" as string]: disabled ? "#f3f4f6" : "#ffffff",
    ["--border-radius" as string]: "8px",
    ["--border-color" as string]: "#d1d5db",
    ...touchStyles
  } as React.CSSProperties;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLIonInputElement>) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <IonInput
      id={id}
      type={type}
      value={value}
      onIonInput={(e) => onChange((e.detail.value ?? "").toString())}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputmode={inputMode}
      pattern={pattern}
      autocomplete={autoComplete as any}
      autocorrect={autoCorrect}
      autocapitalize={autoCapitalize}
      spellcheck={spellCheck}
      min={min}
      max={max}
      clearInput={false}
      style={baseStyles}
    />
  );
}
