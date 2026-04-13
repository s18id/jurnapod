// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button, Group, Select, TextInput } from "@mantine/core";
import { useEffect, useState, useCallback } from "react";
import type { SessionUser } from "../../../lib/session";
import { apiRequest } from "../../../lib/api-client";

import type { ReceivablesAgeingFilters } from "../../../types/reports/receivables-ageing";

interface AgeingFiltersProps {
  filters: ReceivablesAgeingFilters;
  onFiltersChange: (filters: ReceivablesAgeingFilters) => void;
  user: SessionUser;
  isLoading?: boolean;
}

interface CustomerOption {
  value: string;
  label: string;
}

export function AgeingFilters({ filters, onFiltersChange, user, isLoading }: AgeingFiltersProps) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const asOfDate = filters.asOfDate;
  const outletId = filters.outletId !== null ? String(filters.outletId) : "";
  const customerId = filters.customerId !== null ? String(filters.customerId) : "";

  // Fetch customers for dropdown
  useEffect(() => {
    if (!user.company_id) return;

    apiRequest<{ data: Array<{ id: number; name: string }> }>(
      `/customers?company_id=${user.company_id}`,
      {}
    )
      .then((response) => {
        const customerOptions = response.data.map((c) => ({
          value: String(c.id),
          label: c.name,
        }));
        setCustomers(customerOptions);
      })
      .catch(() => {
        // Silently fail - customers are optional
        setCustomers([]);
      });
  }, [user.company_id]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const customerValue = formData.get("customerId") as string;
    onFiltersChange({
      asOfDate: formData.get("asOfDate") as string,
      outletId: formData.get("outletId") ? Number(formData.get("outletId")) : null,
      customerId: customerValue ? Number(customerValue) : null,
    });
  }, [onFiltersChange]);

  const handleReset = useCallback(() => {
    const defaultFilters: ReceivablesAgeingFilters = {
      asOfDate: new Date().toISOString().slice(0, 10),
      outletId: null,
      customerId: null,
    };
    onFiltersChange(defaultFilters);
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
          defaultValue={asOfDate}
        />
        <Select
          label="Outlet"
          name="outletId"
          data={outletOptions}
          clearable
          placeholder="All Outlets"
          style={{ minWidth: 180 }}
          defaultValue={outletId}
        />
        <Select
          label="Customer"
          name="customerId"
          data={[{ value: "", label: "All Customers" }, ...customers]}
          clearable
          placeholder="All Customers"
          searchable
          style={{ minWidth: 200 }}
          defaultValue={customerId}
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