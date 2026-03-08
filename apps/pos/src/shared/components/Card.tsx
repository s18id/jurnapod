// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonCard, IonCardContent } from "@ionic/react";

export interface CardProps {
  children: React.ReactNode;
  padding?: "none" | "small" | "medium" | "large";
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Card({
  children,
  padding = "medium",
  className,
  style,
  onClick
}: CardProps): JSX.Element {
  const paddingMap = {
    none: "0",
    small: "8px",
    medium: "16px",
    large: "24px"
  };

  const baseStyles: React.CSSProperties = {
    borderRadius: "12px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
    cursor: onClick ? "pointer" : "default",
    transition: "box-shadow 0.15s, transform 0.15s",
    ...style
  };

  return (
    <IonCard
      className={className}
      style={baseStyles}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <IonCardContent style={{ padding: paddingMap[padding] }}>{children}</IonCardContent>
    </IonCard>
  );
}
