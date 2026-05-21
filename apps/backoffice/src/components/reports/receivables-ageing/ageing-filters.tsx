// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button, Group, Select, TextInput } from "@mantine/core";
import { useCallback } from "react";
import type { SessionUser } from "../../../lib/session";

import { DEFAULT_FILTERS, type ReceivablesAgeingFilters } from "../../../types/reports/receivables-ageing";

interface AgeingFiltersProps {
  filters: ReceivablesAgeingFilters;
  onFiltersChange: (filters: ReceivablesAgeingFilters) => void;
  user: SessionUser;
  isLoading?: boolean;
}

export function buildNextReceivablesAgeingFilters(
  filters: ReceivablesAgeingFilters,
  patch: Partial<ReceivablesAgeingFilters>
): ReceivablesAgeingFilters {
  return { ...filters, ...patch };
}

export function AgeingFilters({ filters, onFiltersChange, user, isLoading }: AgeingFiltersProps) {
  const asOfDate = filters.asOfDate;
  const outletId = filters.outletId !== null ? String(filters.outletId) : "";

  const handleAsOfDateChange = useCallback((value: string) => {
    onFiltersChange(buildNextReceivablesAgeingFilters(filters, { asOfDate: value }));
  }, [filters, onFiltersChange]);

  const handleOutletChange = useCallback((value: string | null) => {
    onFiltersChange(buildNextReceivablesAgeingFilters(filters, { outletId: value ? Number(value) : null }));
  }, [filters, onFiltersChange]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  const handleReset = useCallback(() => {
    onFiltersChange(DEFAULT_FILTERS);
  }, [onFiltersChange]);

  const outletOptions = [
    { value: "", label: "All Outlets" },
    ...user.outlets.map((outlet) => ({
      value: String(outlet.id),
      label: `${outlet.code} - ${outlet.name}`,
    })),
  ];

  return (
    <form onSubmit={handleSubmit}>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          label="As-of Date"
          type="date"
          name="asOfDate"
          style={{ minWidth: 160 }}
          value={asOfDate}
          onChange={(event) => handleAsOfDateChange(event.currentTarget.value)}
        />
        <Select
          label="Outlet"
          name="outletId"
          data={outletOptions}
          clearable
          placeholder="All Outlets"
          style={{ minWidth: 180 }}
          value={outletId}
          onChange={handleOutletChange}
        />
        <Button type="submit" loading={isLoading}>
          Apply Filters
        </Button>
        <Button variant="light" onClick={handleReset}>
          Reset
        </Button>
      </Group>
    </form>
  );
}
