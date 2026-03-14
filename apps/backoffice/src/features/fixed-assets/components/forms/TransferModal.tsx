// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Modal, Stack, TextInput, Button, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useEffect, useState } from "react";

type FixedAsset = {
  id: number;
  name: string;
  outlet_id: number | null;
};

type Outlet = {
  id: number;
  code: string;
  name: string;
};

type TransferModalProps = {
  opened: boolean;
  onClose: () => void;
  asset: FixedAsset | undefined;
  outlets: Outlet[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
};

export function TransferModal({ opened, onClose, asset, outlets, onSubmit }: TransferModalProps) {
  const [form, setForm] = useState({
    to_outlet_id: "",
    transfer_date: "",
    notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setForm({
        to_outlet_id: String(asset?.outlet_id ?? ""),
        transfer_date: new Date().toISOString().slice(0, 10),
        notes: ""
      });
      setFormError(null);
    }
  }, [opened, asset]);

  async function handleSubmit() {
    if (!form.to_outlet_id) {
      setFormError("Please select a target outlet");
      return;
    }
    if (!form.transfer_date) {
      setFormError("Please select a transfer date");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit({
        to_outlet_id: Number(form.to_outlet_id),
        transfer_date: form.transfer_date,
        notes: form.notes
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Transfer Asset" size="md">
      <Stack gap="md">
        {formError && (
          <Text c="red" size="sm">{formError}</Text>
        )}
        <Select
          label="To Outlet"
          value={form.to_outlet_id}
          onChange={(v) => setForm(p => ({ ...p, to_outlet_id: v ?? "" }))}
          data={outlets.map(o => ({ value: String(o.id), label: `${o.code} - ${o.name}` }))}
          required
        />
        <DatePickerInput
          label="Transfer Date"
          value={form.transfer_date ? new Date(form.transfer_date) : null}
          onChange={(v) => setForm(p => ({ ...p, transfer_date: v?.toISOString().slice(0, 10) ?? "" }))}
        />
        <TextInput
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving}>Record Transfer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
