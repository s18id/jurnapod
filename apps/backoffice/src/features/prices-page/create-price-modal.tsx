// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState } from "react";
import {
  Stack,
  Button,
  Group,
  Select,
  NumberInput,
  Checkbox,
  Alert,
  Modal,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import type { Item } from "../../hooks/use-items";

export interface PriceFormData {
  item_id: number;
  price: number;
  is_active: boolean;
  is_company_default?: boolean;
}

export interface CreatePriceModalProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (data: PriceFormData) => Promise<void>;
  items: Item[];
  isCompanyDefault: boolean;
  submitting: boolean;
}

export function CreatePriceModal({
  opened,
  onClose,
  onCreate,
  items,
  isCompanyDefault,
  submitting,
}: CreatePriceModalProps) {
  const [formData, setFormData] = useState<PriceFormData>({
    item_id: 0,
    price: 0,
    is_active: true,
    is_company_default: isCompanyDefault,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const itemOptions = items.map((item) => ({
    value: String(item.id),
    label: `${item.name} (${item.sku ?? "No SKU"})`,
  }));

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (formData.item_id <= 0) {
      errors.item_id = "Item is required";
    }

    if (formData.price <= 0) {
      errors.price = "Price must be greater than 0";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      await onCreate(formData);
      // Reset form on success
      setFormData({
        item_id: 0,
        price: 0,
        is_active: true,
        is_company_default: isCompanyDefault,
      });
      setFormErrors({});
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create price");
    }
  };

  const handleClose = () => {
    setFormData({
      item_id: 0,
      price: 0,
      is_active: true,
      is_company_default: isCompanyDefault,
    });
    setFormErrors({});
    setActionError(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={isCompanyDefault ? "Create Default Price" : "Create Price"}
      size="md"
    >
      <Stack gap="md">
        {actionError && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {actionError}
          </Alert>
        )}

        <Select
          label="Item"
          placeholder="Select an item"
          value={formData.item_id ? String(formData.item_id) : ""}
          onChange={(value) =>
            setFormData((prev) => ({
              ...prev,
              item_id: value ? Number(value) : 0,
            }))
          }
          data={itemOptions}
          error={formErrors.item_id}
          required
          searchable
        />

        <NumberInput
          label="Price"
          placeholder="Enter price"
          value={formData.price}
          onChange={(value) =>
            setFormData((prev) => ({
              ...prev,
              price: Number(value) || 0,
            }))
          }
          min={0}
          decimalScale={2}
          error={formErrors.price}
          required
        />

        <Checkbox
          label="Set as company default (applies to all outlets)"
          checked={formData.is_company_default}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              is_company_default: e.currentTarget.checked,
            }))
          }
        />

        <Checkbox
          label="Active"
          checked={formData.is_active}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              is_active: e.currentTarget.checked,
            }))
          }
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Create Price
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
