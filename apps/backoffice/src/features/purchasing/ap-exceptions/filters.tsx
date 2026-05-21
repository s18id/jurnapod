// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button, Card, Group, Select, TextInput } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";

import type { ApExceptionFilterState, ApExceptionStatusFilter, ApExceptionTypeFilter } from "./types";

export const AP_EXCEPTION_TYPE_OPTIONS = ["DISPUTE", "VARIANCE", "MISMATCH", "DUPLICATE"] as const;
export const AP_EXCEPTION_STATUS_OPTIONS = ["OPEN", "ASSIGNED", "RESOLVED", "DISMISSED"] as const;
export const AP_EXCEPTION_LIMIT_OPTIONS = [10, 20, 50, 100] as const;

interface ApExceptionFiltersProps {
  filters: ApExceptionFilterState;
  onChange: (patch: Partial<ApExceptionFilterState>) => void;
  onRefresh: () => void;
  loading?: boolean;
}

export function ApExceptionFilters({ filters, onChange, onRefresh, loading }: ApExceptionFiltersProps) {
  return (
    <Card withBorder radius="md" p="md">
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Select
          label="Type"
          value={filters.type}
          data={[{ value: "", label: "All types" }, ...AP_EXCEPTION_TYPE_OPTIONS.map((type) => ({ value: type, label: type }))]}
          onChange={(value) => onChange({ type: (value ?? "") as ApExceptionTypeFilter })}
          allowDeselect={false}
        />
        <Select
          label="Status"
          value={filters.status}
          data={[{ value: "", label: "All statuses" }, ...AP_EXCEPTION_STATUS_OPTIONS.map((status) => ({ value: status, label: status }))]}
          onChange={(value) => onChange({ status: (value ?? "") as ApExceptionStatusFilter })}
          allowDeselect={false}
        />
        <TextInput
          label="Supplier ID"
          value={filters.supplierId}
          onChange={(event) => onChange({ supplierId: event.currentTarget.value })}
          inputMode="numeric"
        />
        <TextInput
          label="Search"
          value={filters.search}
          onChange={(event) => onChange({ search: event.currentTarget.value })}
          placeholder="Exception key or source"
          style={{ minWidth: 220 }}
        />
        <Select
          label="Limit"
          value={String(filters.limit)}
          data={AP_EXCEPTION_LIMIT_OPTIONS.map((limit) => ({ value: String(limit), label: String(limit) }))}
          onChange={(value) => onChange({ limit: Number(value ?? 20) })}
          allowDeselect={false}
          w={100}
        />
        <Button variant="light" leftSection={<IconRefresh size={14} />} onClick={onRefresh} loading={loading}>
          Refresh
        </Button>
      </Group>
    </Card>
  );
}
