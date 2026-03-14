// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Modal,
  Stack,
  TextInput,
  Select,
  NumberInput,
  Switch,
  Button,
  Group
} from "@mantine/core";
import { useState } from "react";
import { apiRequest, ApiError } from "../../../lib/api-client";
import { notifications } from "@mantine/notifications";

type CategoryOption = {
  id: number;
  code: string;
  name: string;
};

type OutletOption = {
  id: number;
  code: string;
  name: string;
};

type AssetCreateModalProps = {
  opened: boolean;
  onClose: () => void;
  accessToken: string;
  categories: CategoryOption[];
  outlets: OutletOption[];
  onSuccess: () => void;
};

export function AssetCreateModal({
  opened,
  onClose,
  accessToken,
  categories,
  outlets,
  onSuccess
}: AssetCreateModalProps) {
  const [form, setForm] = useState({
    name: "",
    asset_tag: "",
    category_id: "",
    serial_number: "",
    outlet_id: "",
    purchase_date: "",
    purchase_cost: "",
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError("Asset name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiRequest("/accounts/fixed-assets", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          asset_tag: form.asset_tag.trim() || null,
          category_id: form.category_id ? Number(form.category_id) : null,
          serial_number: form.serial_number.trim() || null,
          outlet_id: form.outlet_id ? Number(form.outlet_id) : null,
          purchase_date: form.purchase_date.trim() || null,
          purchase_cost: form.purchase_cost.trim() ? Number(form.purchase_cost) : null,
          is_active: form.is_active
        })
      }, accessToken);

      notifications.show({
        title: "Success",
        message: "Asset created",
        color: "green"
      });

      setForm({
        name: "",
        asset_tag: "",
        category_id: "",
        serial_number: "",
        outlet_id: "",
        purchase_date: "",
        purchase_cost: "",
        is_active: true
      });
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create asset");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Asset"
      size="md"
    >
      <Stack gap="md">
        {error && (
          <div style={{ padding: "8px 12px", backgroundColor: "#fef2f2", borderRadius: 6 }}>
            {error}
          </div>
        )}

        <TextInput
          label="Asset Name"
          placeholder="Enter asset name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />

        <TextInput
          label="Asset Tag"
          placeholder="e.g., FA-001"
          value={form.asset_tag}
          onChange={(e) => setForm((p) => ({ ...p, asset_tag: e.target.value }))}
        />

        <Select
          label="Category"
          placeholder="Select category"
          value={form.category_id}
          onChange={(v) => setForm((p) => ({ ...p, category_id: v ?? "" }))}
          data={categories.map((c) => ({
            value: String(c.id),
            label: `${c.code} - ${c.name}`
          }))}
          clearable
        />

        <TextInput
          label="Serial Number"
          placeholder="Enter serial number"
          value={form.serial_number}
          onChange={(e) => setForm((p) => ({ ...p, serial_number: e.target.value }))}
        />

        <Select
          label="Outlet"
          placeholder="Select outlet"
          value={form.outlet_id}
          onChange={(v) => setForm((p) => ({ ...p, outlet_id: v ?? "" }))}
          data={[
            { value: "", label: "Unassigned" },
            ...outlets.map((o) => ({
              value: String(o.id),
              label: `${o.code} - ${o.name}`
            }))
          ]}
          clearable
        />

        <TextInput
          label="Purchase Date"
          placeholder="YYYY-MM-DD"
          value={form.purchase_date}
          onChange={(e) => setForm((p) => ({ ...p, purchase_date: e.target.value }))}
        />

        <NumberInput
          label="Purchase Cost"
          placeholder="0"
          value={form.purchase_cost}
          onChange={(v) => setForm((p) => ({ ...p, purchase_cost: String(v ?? "") }))}
        />

        <Switch
          label="Active"
          checked={form.is_active}
          onChange={(e) => setForm((p) => ({ ...p, is_active: e.currentTarget.checked }))}
        />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Create Asset
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
