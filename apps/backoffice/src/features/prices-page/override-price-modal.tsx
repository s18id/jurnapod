// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState } from "react";
import {
  Stack,
  Button,
  Group,
  NumberInput,
  Alert,
  Modal,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

export interface OverridePriceModalProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (price: number) => Promise<void>;
  defaultPrice: number;
  submitting: boolean;
}

export function OverridePriceModal({
  opened,
  onClose,
  onCreate,
  defaultPrice,
  submitting,
}: OverridePriceModalProps) {
  const [price, setPrice] = useState(String(defaultPrice));
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue <= 0) {
      setActionError("Please enter a valid price");
      return;
    }

    try {
      await onCreate(priceValue);
      setPrice(String(defaultPrice));
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create override");
    }
  };

  const handleClose = () => {
    setPrice(String(defaultPrice));
    setActionError(null);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Set Outlet Override Price" size="md">
      <Stack gap="md">
        {actionError && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {actionError}
          </Alert>
        )}

        <Text size="sm">
          Create an outlet-specific price override for this item.
        </Text>
        <Text size="sm" c="dimmed">
          Default price: {new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
          }).format(defaultPrice)}
        </Text>

        <NumberInput
          label="Override Price"
          placeholder="Enter override price"
          value={price}
          onChange={(value) => setPrice(String(value))}
          min={0}
          decimalScale={2}
          required
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Create Override
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
