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

type ImpairmentModalProps = {
  opened: boolean;
  onClose: () => void;
  accounts: Account[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
};

export function ImpairmentModal({ opened, onClose, accounts, onSubmit }: ImpairmentModalProps) {
  const [form, setForm] = useState({
    impairment_date: "",
    impairment_amount: 0,
    reason: "",
    expense_account_id: "",
    accum_impairment_account_id: ""
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setForm({
        impairment_date: new Date().toISOString().slice(0, 10),
        impairment_amount: 0,
        reason: "",
        expense_account_id: "",
        accum_impairment_account_id: ""
      });
      setFormError(null);
    }
  }, [opened]);

  async function handleSubmit() {
    if (!form.expense_account_id || !form.accum_impairment_account_id) {
      setFormError("Please select both expense and accumulated impairment accounts");
      return;
    }
    if (form.impairment_amount <= 0) {
      setFormError("Impairment amount must be greater than zero");
      return;
    }
    if (!form.reason.trim()) {
      setFormError("Please provide a reason for the impairment");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit({
        impairment_date: form.impairment_date,
        impairment_amount: form.impairment_amount,
        reason: form.reason,
        expense_account_id: Number(form.expense_account_id),
        accum_impairment_account_id: Number(form.accum_impairment_account_id)
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Record Impairment" size="md">
      <Stack gap="md">
        {formError && (
          <Text c="red" size="sm">{formError}</Text>
        )}
        <DatePickerInput
          label="Impairment Date"
          value={form.impairment_date ? new Date(form.impairment_date) : null}
          onChange={(v) => setForm(p => ({ ...p, impairment_date: v?.toISOString().slice(0, 10) ?? "" }))}
        />
        <NumberInput
          label="Impairment Amount"
          value={form.impairment_amount}
          onChange={(v) => setForm(p => ({ ...p, impairment_amount: Number(v) ?? 0 }))}
        />
        <TextInput
          label="Reason"
          value={form.reason}
          onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))}
          required
        />
        <Select
          label="Expense Account"
          value={form.expense_account_id}
          onChange={(v) => setForm(p => ({ ...p, expense_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          required
        />
        <Select
          label="Accumulated Impairment Account"
          value={form.accum_impairment_account_id}
          onChange={(v) => setForm(p => ({ ...p, accum_impairment_account_id: v ?? "" }))}
          data={accounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          required
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button color="orange" onClick={handleSubmit} loading={saving}>Record Impairment</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
