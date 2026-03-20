// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";

interface DirtyConfirmDialogProps {
  opened: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * Confirmation dialog for unsaved changes.
 * Used when user tries to close a modal/form with unsaved changes.
 */
export function DirtyConfirmDialog({
  opened,
  onConfirm,
  onCancel,
  title = "Unsaved Changes",
  message = "You have unsaved changes. Are you sure you want to discard them?",
  confirmText = "Discard",
  cancelText = "Keep Editing"
}: DirtyConfirmDialogProps) {
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={title}
      centered
      size="sm"
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Stack gap="md">
        <Text size="sm">{message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button color="red" onClick={onConfirm}>
            {confirmText}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
