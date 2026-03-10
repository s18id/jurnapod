// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";

export type AlertTone = "error" | "warning" | "info" | "success";

export interface InlineAlertProps {
  title: string;
  message?: string;
  tone?: AlertTone;
  onRetry?: () => void;
  retryText?: string;
}

export function InlineAlert({
  title,
  message,
  tone = "error",
  onRetry,
  retryText = "Retry"
}: InlineAlertProps): JSX.Element {
  const toneStyles: Record<AlertTone, { bg: string; border: string; text: string; textMuted: string; buttonBg: string; buttonBorder: string }> = {
    error: {
      bg: "#fef2f2",
      border: "#fecaca",
      text: "#dc2626",
      textMuted: "#7f1d1d",
      buttonBg: "#fee2e2",
      buttonBorder: "#fca5a5"
    },
    warning: {
      bg: "#fffbeb",
      border: "#fcd34d",
      text: "#d97706",
      textMuted: "#92400e",
      buttonBg: "#fef3c7",
      buttonBorder: "#fbbf24"
    },
    info: {
      bg: "#eff6ff",
      border: "#bfdbfe",
      text: "#2563eb",
      textMuted: "#1e40af",
      buttonBg: "#dbeafe",
      buttonBorder: "#93c5fd"
    },
    success: {
      bg: "#f0fdf4",
      border: "#86efac",
      text: "#16a34a",
      textMuted: "#166534",
      buttonBg: "#dcfce7",
      buttonBorder: "#86efac"
    }
  };

  const style = toneStyles[tone];

  return (
    <div
      style={{
        marginBottom: 12,
        padding: 12,
        borderRadius: 8,
        background: style.bg,
        border: `1px solid ${style.border}`
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: style.text }}>
        {title}
      </div>
      {message && (
        <div style={{ fontSize: 12, color: style.textMuted, marginTop: 4 }}>
          {message}
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 8,
            fontSize: 12,
            fontWeight: 600,
            color: style.text,
            background: style.buttonBg,
            border: `1px solid ${style.buttonBorder}`,
            borderRadius: 6,
            padding: "6px 12px",
            cursor: "pointer"
          }}
        >
          {retryText}
        </button>
      )}
    </div>
  );
}
