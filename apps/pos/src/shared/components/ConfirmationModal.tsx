// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Modal } from "./Modal.js";
import { Button } from "./Button.js";

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger";
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary"
}: ConfirmationModalProps): JSX.Element {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="confirmation-modal-content">
        <p className="confirmation-modal-message">{message}</p>
        <div className="confirmation-modal-actions">
          <Button
            variant="secondary"
            onClick={onClose}
            fullWidth
          >
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            fullWidth
          >
            {confirmText}
          </Button>
        </div>
      </div>

      <style>{`
        .confirmation-modal-content {
          padding: 1rem 0;
        }

        .confirmation-modal-message {
          margin: 0 0 1.5rem;
          font-size: 1rem;
          line-height: 1.5;
          color: #374151;
        }

        .confirmation-modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }

        @media (max-width: 639px) {
          .confirmation-modal-actions {
            flex-direction: column-reverse;
          }
        }
      `}</style>
    </Modal>
  );
}

export interface ThreeWayConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
  title: string;
  message: string;
  saveText?: string;
  discardText?: string;
  cancelText?: string;
}

export function ThreeWayConfirmationModal({
  isOpen,
  onClose,
  onSave,
  onDiscard,
  title,
  message,
  saveText = "Save",
  discardText = "Discard",
  cancelText = "Cancel"
}: ThreeWayConfirmationModalProps): JSX.Element {
  const handleSave = () => {
    onSave();
    onClose();
  };

  const handleDiscard = () => {
    onDiscard();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="confirmation-modal-content">
        <p className="confirmation-modal-message">{message}</p>
        <div className="three-way-actions">
          <Button
            variant="secondary"
            onClick={onClose}
            fullWidth
          >
            {cancelText}
          </Button>
          <Button
            variant="danger"
            onClick={handleDiscard}
            fullWidth
          >
            {discardText}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            fullWidth
          >
            {saveText}
          </Button>
        </div>
      </div>

      <style>{`
        .three-way-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }

        @media (max-width: 639px) {
          .three-way-actions {
            flex-direction: column-reverse;
          }
        }
      `}</style>
    </Modal>
  );
}
