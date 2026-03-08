// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useState } from "react";
import { ThreeWayConfirmationModal } from "../../shared/components/ConfirmationModal.js";

export interface NavigationGuardModalProps {
  isOpen: boolean;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
}

export function NavigationGuardModal({
  isOpen,
  onSave,
  onDiscard,
  onCancel,
  title = "Unsaved Changes",
  message = "You have unsaved changes. What would you like to do?"
}: NavigationGuardModalProps): JSX.Element {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThreeWayConfirmationModal
      isOpen={isOpen}
      onClose={onCancel}
      onSave={handleSave}
      onDiscard={onDiscard}
      title={title}
      message={message}
      saveText={isSaving ? "Saving..." : "Save & Continue"}
      discardText="Discard Changes"
      cancelText="Stay on Page"
    />
  );
}
