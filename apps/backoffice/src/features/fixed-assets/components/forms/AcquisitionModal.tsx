// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Modal, Stack, TextInput, NumberInput, Button, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useEffect, useState } from "react";

type FixedAsset = {
  id: number;
  name: string;
  category_id: number | null;
  purchase_date: string | null;
  purchase_cost: number | null;
};

type Category = {
  id: number;
  code: string;
  name: string;
  useful_life_months: number;
  residual_value_pct: number;
  expense_account_id: number | null;
};

type Account = {
  id: number;
  code: string;
  name: string;
};

type AcquisitionModalProps = {
  opened: boolean;
  onClose: () => void;
  asset: FixedAsset | undefined;
  accounts: Account[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
};

export function AcquisitionModal({ opened, onClose, asset, accounts, onSubmit }: AcquisitionModalProps) {
  const [form, setForm] = useState({
    event_date: "",
    cost: 0,
    useful_life_months: 60,
    salvage_value: 0,
    asset_account_id: "",
    offset_account_id: "",
    expense_account_id: "",
    notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setForm({
        event_date: asset?.purchase_date?.slice(0, 10) ?? "",
        cost: asset?.purchase_cost ?? 0,
        useful_life_months: 60,
        salvage_value: 0,
        asset_account_id: "",
        offset_account_id: "",
        expense_account_id: "",
        notes: ""
      });
      setFormError(null);
    }
  }, [opened, asset]);

  async function handleSubmit() {
    if (!form.asset_account_id || !form.offset_account_id) {
      setFormError("Please select both asset account and offset account");
      return;
    }
    if (!form.event_date) {
      setFormError("Please select an acquisition date");
      return;
    }
    if (form.cost <= 0) {
      setFormError("Cost must be greater than zero");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit({
        event_date: form.event_date,
        cost: form.cost,
        useful_life_months: form.useful_life_months,
        salvage_value: form.salvage_value,
        asset_account_id: Number(form.asset_account_id),
        offset_account_id: Number(form.offset_account_id),
        expense_account_id: form.expense_account_id ? Number(form.expense_account_id) : undefined,
        notes: form.notes
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Record Acquisition" size="md">
      <Stack gap="md">
        {formError && (
          <Text c="red" size="sm">{formError}</Text>
        )}
        <DatePickerInput
          label="Acquisition Date"
          value={form.event_date ? new Date(form.event_date) : null}
          onChange={(v) => setForm(p => ({ ...p, event_date: v?.toISOString().slice(0, 10) ?? "" }))}
        />
        <NumberInput
          label="Cost"
          value={form.cost}
          onChange={(v) => setForm(p => ({ ...p, cost: Number(v) ?? 0 }))}
        />
        <NumberInput
          label="Useful Life (months)"
          value={form.useful_life_months}
          onChange={(v) => setForm(p => ({ ...p, useful_life_months: Number(v) ?? 60 }))}
        />
        <NumberInput
          label="Salvage Value"
          value={form.salvage_value}
          onChange={(v) => setForm(p => ({ ...p, salvage_value: Number(v) ?? 0 }))}
        />
        <Select
          label="Asset Account (Debit)"
          value={form.asset_account_id}
          onChange={(v) => setForm(p => ({ ...p, asset_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          required
        />
        <Select
          label="Offset Account (Credit)"
          value={form.offset_account_id}
          onChange={(v) => setForm(p => ({ ...p, offset_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          required
        />
        <Select
          label="Expense Account"
          value={form.expense_account_id}
          onChange={(v) => setForm(p => ({ ...p, expense_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          clearable
        />
        <TextInput
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving}>Record Acquisition</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
