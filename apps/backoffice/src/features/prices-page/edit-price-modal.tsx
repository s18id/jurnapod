// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState } from "react";
import {
  Stack,
  Button,
  Group,
  NumberInput,
  Checkbox,
  Alert,
  Modal,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

export interface EditPriceModalProps {
  opened: boolean;
  onClose: () => void;
  onUpdate: (price: number, isActive: boolean) => Promise<void>;
  itemName: string;
  currentPrice: number;
  currentIsActive: boolean;
  submitting: boolean;
}

export function EditPriceModal({
  opened,
  onClose,
  onUpdate,
  itemName,
  currentPrice,
  currentIsActive,
  submitting,
}: EditPriceModalProps) {
  const [price, setPrice] = useState(currentPrice);
  const [isActive, setIsActive] = useState(currentIsActive);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (price <= 0) {
      setActionError("Price must be greater than 0");
      return;
    }

    try {
      await onUpdate(price, isActive);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update price");
    }
  };

  const handleClose = () => {
    setPrice(currentPrice);
    setIsActive(currentIsActive);
    setActionError(null);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Edit Price" size="md">
      <Stack gap="md">
        {actionError && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {actionError}
          </Alert>
        )}

        <Text size="sm" fw={500}>
          {itemName}
        </Text>

        <NumberInput
          label="Price"
          placeholder="Enter price"
          value={price}
          onChange={(value) => setPrice(Number(value) || 0)}
          min={0}
          decimalScale={2}
          required
        />

        <Checkbox
          label="Active"
          checked={isActive}
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Save Changes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
