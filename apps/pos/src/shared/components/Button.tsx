// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { MIN_TOUCH_TARGET } from "../utils/constants.js";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
  style?: React.CSSProperties;
}

export function Button({
  variant = "primary",
  size = "medium",
  disabled = false,
  onClick,
  children,
  type = "button",
  style
}: ButtonProps): JSX.Element {
  const variantStyles = {
    primary: {
      background: "#3b82f6",
      color: "#ffffff",
      border: "none"
    },
    secondary: {
      background: "#f3f4f6",
      color: "#1f2937",
      border: "1px solid #d1d5db"
    },
    danger: {
      background: "#ef4444",
      color: "#ffffff",
      border: "none"
    }
  };

  const sizeStyles = {
    small: {
      padding: "8px 16px",
      fontSize: "14px",
      minHeight: `${MIN_TOUCH_TARGET}px`
    },
    medium: {
      padding: "12px 24px",
      fontSize: "16px",
      minHeight: `${MIN_TOUCH_TARGET}px`
    },
    large: {
      padding: "16px 32px",
      fontSize: "18px",
      minHeight: `${MIN_TOUCH_TARGET + 4}px`
    }
  };

  const baseStyles: React.CSSProperties = {
    borderRadius: "8px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all 0.15s",
    touchAction: "manipulation",
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...style
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={baseStyles}
    >
      {children}
    </button>
  );
}
