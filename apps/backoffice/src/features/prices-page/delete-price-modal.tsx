// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState } from "react";
import {
  Stack,
  Button,
  Group,
  Alert,
  Modal,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

export interface DeletePriceModalProps {
  opened: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
  isDefault: boolean;
  submitting: boolean;
}

export function DeletePriceModal({
  opened,
  onClose,
  onDelete,
  isDefault,
  submitting,
}: DeletePriceModalProps) {
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      await onDelete();
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete price");
    }
  };

  const handleClose = () => {
    setActionError(null);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Confirm Delete" size="sm">
      <Stack gap="md">
        {actionError && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {actionError}
          </Alert>
        )}

        <Text>Are you sure you want to delete this price?</Text>
        <Text size="sm" c="dimmed">
          {isDefault
            ? "This will remove the company default price."
            : "This will remove the outlet-specific price override."}
        </Text>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button color="red" onClick={handleSubmit} loading={submitting}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
