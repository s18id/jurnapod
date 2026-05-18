// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button, Group, Select } from "@mantine/core";

import type { OperationListStatus, OperationListType } from "@/hooks/use-operations-list";
import { OPERATION_LIST_STATUSES, OPERATION_LIST_TYPES } from "@/hooks/use-operations-list";

export interface OperationsFilters {
  status?: OperationListStatus;
  type?: OperationListType;
}

export interface OperationsFilterBarProps {
  filters: OperationsFilters;
  onChange: (filters: OperationsFilters) => void;
  loading?: boolean;
}

const ALL_VALUE = "all";

function formatTypeLabel(type: OperationListType): string {
  if (type === "batch_update") return "Batch update";
  return type[0]!.toUpperCase() + type.slice(1);
}

export function OperationsFilterBar({ filters, onChange, loading = false }: OperationsFilterBarProps) {
  return (
    <Group gap="sm" wrap="wrap" data-testid="operations-filter-bar">
      <Select
        label="Status"
        value={filters.status ?? ALL_VALUE}
        onChange={(value) => onChange({
          ...filters,
          status: value && value !== ALL_VALUE ? value as OperationListStatus : undefined,
        })}
        data={[
          { value: ALL_VALUE, label: "All statuses" },
          ...OPERATION_LIST_STATUSES.map((status) => ({ value: status, label: status })),
        ]}
        disabled={loading}
        data-testid="operations-status-filter"
      />
      <Select
        label="Type"
        value={filters.type ?? ALL_VALUE}
        onChange={(value) => onChange({
          ...filters,
          type: value && value !== ALL_VALUE ? value as OperationListType : undefined,
        })}
        data={[
          { value: ALL_VALUE, label: "All types" },
          ...OPERATION_LIST_TYPES.map((type) => ({ value: type, label: formatTypeLabel(type) })),
        ]}
        disabled={loading}
        data-testid="operations-type-filter"
      />
      <Button
        variant="subtle"
        onClick={() => onChange({})}
        disabled={loading || (!filters.status && !filters.type)}
        data-testid="operations-clear-filters"
      >
        Clear filters
      </Button>
    </Group>
  );
}
