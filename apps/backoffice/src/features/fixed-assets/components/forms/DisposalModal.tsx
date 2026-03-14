// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Modal, Stack, TextInput, NumberInput, Button, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useEffect, useState } from "react";

type Account = {
  id: number;
  code: string;
  name: string;
};

type DisposalModalProps = {
  opened: boolean;
  onClose: () => void;
  accounts: Account[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
};

export function DisposalModal({ opened, onClose, accounts, onSubmit }: DisposalModalProps) {
  const [form, setForm] = useState({
    disposal_date: "",
    disposal_type: "SALE" as "SALE" | "SCRAP",
    proceeds: 0,
    disposal_cost: 0,
    cash_account_id: "",
    asset_account_id: "",
    accum_depr_account_id: "",
    accum_impairment_account_id: "",
    gain_account_id: "",
    loss_account_id: "",
    disposal_expense_account_id: "",
    notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setForm({
        disposal_date: new Date().toISOString().slice(0, 10),
        disposal_type: "SALE",
        proceeds: 0,
        disposal_cost: 0,
        cash_account_id: "",
        asset_account_id: "",
        accum_depr_account_id: "",
        accum_impairment_account_id: "",
        gain_account_id: "",
        loss_account_id: "",
        disposal_expense_account_id: "",
        notes: ""
      });
      setFormError(null);
    }
  }, [opened]);

  async function handleSubmit() {
    if (!form.cash_account_id || !form.asset_account_id || !form.accum_depr_account_id) {
      setFormError("Please select cash, asset, and accumulated depreciation accounts");
      return;
    }
    if (!form.disposal_date) {
      setFormError("Please select a disposal date");
      return;
    }
    if (form.disposal_type === "SALE" && form.proceeds < 0) {
      setFormError("Proceeds cannot be negative");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit({
        disposal_date: form.disposal_date,
        disposal_type: form.disposal_type,
        proceeds: form.disposal_type === "SALE" ? form.proceeds : undefined,
        disposal_cost: form.disposal_cost,
        cash_account_id: Number(form.cash_account_id),
        asset_account_id: Number(form.asset_account_id),
        accum_depr_account_id: Number(form.accum_depr_account_id),
        accum_impairment_account_id: form.accum_impairment_account_id ? Number(form.accum_impairment_account_id) : undefined,
        gain_account_id: form.gain_account_id ? Number(form.gain_account_id) : undefined,
        loss_account_id: form.loss_account_id ? Number(form.loss_account_id) : undefined,
        disposal_expense_account_id: form.disposal_expense_account_id ? Number(form.disposal_expense_account_id) : undefined,
        notes: form.notes
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Dispose Asset" size="lg">
      <Stack gap="md">
        {formError && (
          <Text c="red" size="sm">{formError}</Text>
        )}
        <DatePickerInput
          label="Disposal Date"
          value={form.disposal_date ? new Date(form.disposal_date) : null}
          onChange={(v) => setForm(p => ({ ...p, disposal_date: v?.toISOString().slice(0, 10) ?? "" }))}
        />
        <Select
          label="Disposal Type"
          value={form.disposal_type}
          onChange={(v) => setForm(p => ({ ...p, disposal_type: (v as "SALE" | "SCRAP") || "SALE" }))}
          data={[
            { value: "SALE", label: "Sale" },
            { value: "SCRAP", label: "Scrap" }
          ]}
        />
        {form.disposal_type === "SALE" && (
          <NumberInput
            label="Proceeds"
            value={form.proceeds}
            onChange={(v) => setForm(p => ({ ...p, proceeds: Number(v) ?? 0 }))}
          />
        )}
        <NumberInput
          label="Disposal Cost"
          value={form.disposal_cost}
          onChange={(v) => setForm(p => ({ ...p, disposal_cost: Number(v) ?? 0 }))}
        />
        <Select
          label="Cash Account"
          value={form.cash_account_id}
          onChange={(v) => setForm(p => ({ ...p, cash_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          required
        />
        <Select
          label="Asset Account"
          value={form.asset_account_id}
          onChange={(v) => setForm(p => ({ ...p, asset_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          required
        />
        <Select
          label="Accumulated Depreciation Account"
          value={form.accum_depr_account_id}
          onChange={(v) => setForm(p => ({ ...p, accum_depr_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          required
        />
        <Select
          label="Accumulated Impairment Account"
          value={form.accum_impairment_account_id}
          onChange={(v) => setForm(p => ({ ...p, accum_impairment_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          clearable
        />
        <Select
          label="Gain Account"
          value={form.gain_account_id}
          onChange={(v) => setForm(p => ({ ...p, gain_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          clearable
        />
        <Select
          label="Loss Account"
          value={form.loss_account_id}
          onChange={(v) => setForm(p => ({ ...p, loss_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          clearable
        />
        <Select
          label="Disposal Expense Account"
          value={form.disposal_expense_account_id}
          onChange={(v) => setForm(p => ({ ...p, disposal_expense_account_id: v ?? "" }))}
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
          <Button color="red" onClick={handleSubmit} loading={saving}>Dispose Asset</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
