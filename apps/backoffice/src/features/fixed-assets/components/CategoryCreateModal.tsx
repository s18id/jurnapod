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

type AccountOption = {
  id: number;
  code: string;
  name: string;
};

type CategoryCreateModalProps = {
  opened: boolean;
  onClose: () => void;
  accessToken: string;
  accounts: AccountOption[];
  onSuccess: () => void;
};

export function CategoryCreateModal({
  opened,
  onClose,
  accessToken,
  accounts,
  onSuccess
}: CategoryCreateModalProps) {
  const [form, setForm] = useState({
    code: "",
    name: "",
    depreciation_method: "STRAIGHT_LINE" as "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS",
    useful_life_months: "60",
    residual_value_pct: "0",
    expense_account_id: "",
    accum_depr_account_id: "",
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Category code and name are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiRequest("/accounts/fixed-asset-categories", {
        method: "POST",
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          depreciation_method: form.depreciation_method,
          useful_life_months: Number(form.useful_life_months),
          residual_value_pct: Number(form.residual_value_pct || 0),
          expense_account_id: form.expense_account_id ? Number(form.expense_account_id) : null,
          accum_depr_account_id: form.accum_depr_account_id ? Number(form.accum_depr_account_id) : null,
          is_active: form.is_active
        })
      }, accessToken);

      notifications.show({
        title: "Success",
        message: "Category created",
        color: "green"
      });

      setForm({
        code: "",
        name: "",
        depreciation_method: "STRAIGHT_LINE",
        useful_life_months: "60",
        residual_value_pct: "0",
        expense_account_id: "",
        accum_depr_account_id: "",
        is_active: true
      });
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create category");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Category"
      size="md"
    >
      <Stack gap="md">
        {error && (
          <div style={{ padding: "8px 12px", backgroundColor: "#fef2f2", borderRadius: 6 }}>
            {error}
          </div>
        )}

        <TextInput
          label="Category Code"
          placeholder="e.g., COMP"
          value={form.code}
          onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
          required
        />

        <TextInput
          label="Category Name"
          placeholder="e.g., Computer Equipment"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />

        <Select
          label="Depreciation Method"
          value={form.depreciation_method}
          onChange={(v) =>
            setForm((p) => ({
              ...p,
              depreciation_method: (v as "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS") || "STRAIGHT_LINE"
            }))
          }
          data={[
            { value: "STRAIGHT_LINE", label: "Straight Line" },
            { value: "DECLINING_BALANCE", label: "Declining Balance" },
            { value: "SUM_OF_YEARS", label: "Sum of Years" }
          ]}
        />

        <NumberInput
          label="Useful Life (months)"
          value={form.useful_life_months}
          onChange={(v) => setForm((p) => ({ ...p, useful_life_months: String(v ?? 60) }))}
        />

        <NumberInput
          label="Residual Value (%)"
          value={form.residual_value_pct}
          onChange={(v) => setForm((p) => ({ ...p, residual_value_pct: String(v ?? 0) }))}
        />

        <Select
          label="Expense Account"
          placeholder="Select expense account"
          value={form.expense_account_id}
          onChange={(v) => setForm((p) => ({ ...p, expense_account_id: v ?? "" }))}
          data={accounts.map((a) => ({
            value: String(a.id),
            label: `${a.code} - ${a.name}`
          }))}
          clearable
        />

        <Select
          label="Accumulated Depreciation Account"
          placeholder="Select accumulated depreciation account"
          value={form.accum_depr_account_id}
          onChange={(v) => setForm((p) => ({ ...p, accum_depr_account_id: v ?? "" }))}
          data={accounts.map((a) => ({
            value: String(a.id),
            label: `${a.code} - ${a.name}`
          }))}
          clearable
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
            Create Category
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
