// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useRef } from "react";
import { MOBILE_BREAKPOINT } from "../utils/constants.js";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true
}: ModalProps): JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const overlayStyles: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center",
    zIndex: 9999,
    animation: "fadeIn 0.15s ease-out"
  };

  const modalStyles: React.CSSProperties = {
    backgroundColor: "#ffffff",
    borderRadius: isMobile ? "16px 16px 0 0" : "12px",
    width: isMobile ? "100%" : "auto",
    maxWidth: isMobile ? "100%" : "480px",
    maxHeight: isMobile ? "90vh" : "80vh",
    overflow: "auto",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    animation: isMobile ? "slideUp 0.2s ease-out" : "scaleIn 0.15s ease-out"
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #e5e7eb"
  };

  const titleStyles: React.CSSProperties = {
    fontSize: "18px",
    fontWeight: 600,
    color: "#111827",
    margin: 0
  };

  const closeButtonStyles: React.CSSProperties = {
    background: "none",
    border: "none",
    fontSize: "24px",
    color: "#6b7280",
    cursor: "pointer",
    padding: "4px",
    lineHeight: 1,
    minWidth: "32px",
    minHeight: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px"
  };

  const contentStyles: React.CSSProperties = {
    padding: "20px"
  };

  return (
    <div
      ref={overlayRef}
      style={overlayStyles}
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}
      </style>
      <div style={modalStyles}>
        {(title || showCloseButton) && (
          <div style={headerStyles}>
            {title ? <h2 style={titleStyles}>{title}</h2> : <div />}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                style={closeButtonStyles}
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div style={contentStyles}>
          {children}
        </div>
      </div>
    </div>
  );
}
