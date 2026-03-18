// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useCallback, useEffect } from "react";
import { Stack, TextInput, Select, Button, Text, Badge, Group, Alert } from "@mantine/core";
import { IconBarcode, IconCheck, IconTrash, IconAlertCircle } from "@tabler/icons-react";
import { apiRequest, ApiError } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

export type BarcodeType = 'EAN13' | 'UPCA' | 'CODE128' | 'CUSTOM';

interface ItemBarcodeManagerProps {
  user: SessionUser;
  accessToken: string;
  itemId: number;
  itemName: string;
  currentBarcode?: string | null;
  currentBarcodeType?: string | null;
  onBarcodeUpdate?: () => void;
}

const barcodeTypeOptions = [
  { value: 'EAN13', label: 'EAN-13 (13 digits)' },
  { value: 'UPCA', label: 'UPC-A (12 digits)' },
  { value: 'CODE128', label: 'Code 128 (Alphanumeric)' },
  { value: 'CUSTOM', label: 'Custom Format' },
];

export function ItemBarcodeManager({
  user,
  accessToken,
  itemId,
  itemName,
  currentBarcode,
  currentBarcodeType,
  onBarcodeUpdate,
}: ItemBarcodeManagerProps) {
  const [barcode, setBarcode] = useState(currentBarcode || '');
  const [barcodeType, setBarcodeType] = useState<BarcodeType>((currentBarcodeType as BarcodeType) || 'CUSTOM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset when props change
  useEffect(() => {
    setBarcode(currentBarcode || '');
    setBarcodeType((currentBarcodeType as BarcodeType) || 'CUSTOM');
    setError(null);
    setSuccess(null);
  }, [currentBarcode, currentBarcodeType]);

  const detectBarcodeType = useCallback((value: string): BarcodeType => {
    const clean = value.trim();
    if (/^\d{13}$/.test(clean)) return 'EAN13';
    if (/^\d{12}$/.test(clean)) return 'UPCA';
    if (/^[A-Za-z0-9\-._\s]+$/.test(clean) && clean.length >= 1 && clean.length <= 48) return 'CODE128';
    return 'CUSTOM';
  }, []);

  const handleBarcodeChange = (value: string) => {
    setBarcode(value);
    setError(null);
    setSuccess(null);
    
    // Auto-detect type if user hasn't manually selected
    if (value.trim()) {
      const detected = detectBarcodeType(value);
      setBarcodeType(detected);
    }
  };

  const handleSave = async () => {
    if (!barcode.trim()) {
      setError("Barcode cannot be empty");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiRequest(
        `/inventory/items/${itemId}/barcode`,
        {
          method: "PATCH",
          body: JSON.stringify({
            barcode: barcode.trim(),
            barcode_type: barcodeType,
          }),
        },
        accessToken
      );

      setSuccess("Barcode saved successfully");
      onBarcodeUpdate?.();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 || err.status === 400) {
          // Use backend message (includes item name for conflicts)
          setError(err.message || "Invalid barcode or already in use");
        } else {
          setError("Failed to save barcode");
        }
      } else {
        setError("Failed to save barcode");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiRequest(
        `/inventory/items/${itemId}/barcode`,
        {
          method: "DELETE",
        },
        accessToken
      );

      setBarcode('');
      setBarcodeType('CUSTOM');
      setSuccess("Barcode removed successfully");
      onBarcodeUpdate?.();
    } catch (err) {
      setError("Failed to remove barcode");
    } finally {
      setLoading(false);
    }
  };

  const getFormatHint = () => {
    switch (barcodeType) {
      case 'EAN13':
        return "EAN-13: Exactly 13 digits with valid checksum";
      case 'UPCA':
        return "UPC-A: Exactly 12 digits with valid checksum";
      case 'CODE128':
        return "Code 128: 1-48 alphanumeric characters";
      case 'CUSTOM':
        return "Custom: Any format, max 100 characters";
      default:
        return "";
    }
  };

  return (
    <Stack gap="md">
      <Group gap="xs">
        <IconBarcode size={20} />
        <Text fw={500}>Barcode Management</Text>
      </Group>

      <Text size="sm" c="dimmed">
        Item: {itemName}
      </Text>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          {error}
        </Alert>
      )}

      {success && (
        <Alert icon={<IconCheck size={16} />} color="green" variant="light">
          {success}
        </Alert>
      )}

      {currentBarcode && (
        <Group gap="xs">
          <Text size="sm">Current:</Text>
          <Badge variant="light" size="lg">
            {currentBarcode}
          </Badge>
          <Badge variant="outline" size="sm">
            {currentBarcodeType || 'CUSTOM'}
          </Badge>
        </Group>
      )}

      <TextInput
        label="Barcode"
        placeholder="Enter barcode (e.g., 4006381333931)"
        value={barcode}
        onChange={(e) => handleBarcodeChange(e.target.value)}
        disabled={loading}
        maxLength={100}
      />

      <Select
        label="Barcode Type"
        value={barcodeType}
        onChange={(value) => setBarcodeType((value as BarcodeType) || 'CUSTOM')}
        data={barcodeTypeOptions}
        disabled={loading}
      />

      <Text size="xs" c="dimmed">
        {getFormatHint()}
      </Text>

      <Group justify="space-between" mt="md">
        <Button
          variant="light"
          color="red"
          onClick={handleRemove}
          disabled={loading || !currentBarcode}
          leftSection={<IconTrash size={16} />}
        >
          Remove
        </Button>

        <Button
          onClick={handleSave}
          loading={loading}
          disabled={!barcode.trim() || barcode === currentBarcode}
          leftSection={<IconCheck size={16} />}
        >
          Save Barcode
        </Button>
      </Group>
    </Stack>
  );
}
