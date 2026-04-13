// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Table, Text, Box, Group } from "@mantine/core";
import { IconChevronUp, IconChevronDown, IconMinus } from "@tabler/icons-react";
import { useMemo } from "react";

import type { AggregatedCustomer, SortConfig, ReceivablesAgeingSortColumn } from "../../../types/reports/receivables-ageing";
import { formatMoney } from "../../../hooks/use-receivables-ageing";

interface AgeingTableProps {
  customers: AggregatedCustomer[];
  sortConfig: SortConfig;
  onSort: (column: ReceivablesAgeingSortColumn) => void;
}

interface SortableHeaderProps {
  label: string;
  column: ReceivablesAgeingSortColumn;
  currentSort: SortConfig;
  onSort: (column: ReceivablesAgeingSortColumn) => void;
  numeric?: boolean;
}

function SortableHeader({ label, column, currentSort, onSort, numeric = false }: SortableHeaderProps) {
  const isActive = currentSort.column === column;
  const direction = isActive ? currentSort.direction : null;

  return (
    <Table.Th
      style={{ cursor: "pointer", userSelect: "none", textAlign: numeric ? "right" : "left" }}
      onClick={() => onSort(column)}
    >
      <Group gap={4} justify={numeric ? "flex-end" : "flex-start"} wrap="nowrap">
        <Text size="sm" fw={600}>
          {label}
        </Text>
        {direction === "asc" && <IconChevronUp size={14} />}
        {direction === "desc" && <IconChevronDown size={14} />}
        {!direction && <IconMinus size={14} style={{ opacity: 0.3 }} />}
      </Group>
    </Table.Th>
  );
}

interface MoneyCellProps {
  value: number;
}

function MoneyCell({ value }: MoneyCellProps) {
  return (
    <Text size="sm" ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatMoney(value)}
    </Text>
  );
}

export function AgeingTable({ customers, sortConfig, onSort }: AgeingTableProps) {
  // Sort customers based on sort config
  const sortedCustomers = useMemo(() => {
    const sorted = [...customers];
    sorted.sort((a, b) => {
      const aVal = a[sortConfig.column];
      const bVal = b[sortConfig.column];

      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return sortConfig.direction === "asc" ? cmp : -cmp;
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        const diff = aVal - bVal;
        return sortConfig.direction === "asc" ? diff : -diff;
      }

      return 0;
    });
    return sorted;
  }, [customers, sortConfig]);

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    return customers.reduce(
      (acc, customer) => ({
        current: acc.current + customer.current,
        bucket_1_30: acc.bucket_1_30 + customer.bucket_1_30,
        bucket_31_60: acc.bucket_31_60 + customer.bucket_31_60,
        bucket_61_90: acc.bucket_61_90 + customer.bucket_61_90,
        bucket_90_plus: acc.bucket_90_plus + customer.bucket_90_plus,
        total_outstanding: acc.total_outstanding + customer.total_outstanding,
      }),
      { current: 0, bucket_1_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0, total_outstanding: 0 }
    );
  }, [customers]);

  if (customers.length === 0) {
    return (
      <Box ta="center" py="xl">
        <Text c="dimmed" size="sm">
          No outstanding receivables found.
        </Text>
      </Box>
    );
  }

  return (
    <Box style={{ overflowX: "auto" }}>
      <Table highlightOnHover stickyHeader style={{ minWidth: 800 }}>
        <Table.Thead>
          <Table.Tr>
            <SortableHeader label="Customer" column="customer_name" currentSort={sortConfig} onSort={onSort} />
            <SortableHeader label="Current" column="current" currentSort={sortConfig} onSort={onSort} numeric />
            <SortableHeader label="1-30 Days" column="bucket_1_30" currentSort={sortConfig} onSort={onSort} numeric />
            <SortableHeader label="31-60 Days" column="bucket_31_60" currentSort={sortConfig} onSort={onSort} numeric />
            <SortableHeader label="61-90 Days" column="bucket_61_90" currentSort={sortConfig} onSort={onSort} numeric />
            <SortableHeader label="90+ Days" column="bucket_90_plus" currentSort={sortConfig} onSort={onSort} numeric />
            <SortableHeader label="Total" column="total_outstanding" currentSort={sortConfig} onSort={onSort} numeric />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedCustomers.map((customer) => (
            <Table.Tr key={customer.customer_id}>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {customer.customer_name}
                </Text>
                {customer.customer_code && (
                  <Text size="xs" c="dimmed">
                    {customer.customer_code}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <MoneyCell value={customer.current} />
              </Table.Td>
              <Table.Td>
                <MoneyCell value={customer.bucket_1_30} />
              </Table.Td>
              <Table.Td>
                <MoneyCell value={customer.bucket_31_60} />
              </Table.Td>
              <Table.Td>
                <MoneyCell value={customer.bucket_61_90} />
              </Table.Td>
              <Table.Td>
                <MoneyCell value={customer.bucket_90_plus} />
              </Table.Td>
              <Table.Td>
                <MoneyCell value={customer.total_outstanding} />
              </Table.Td>
            </Table.Tr>
          ))}
          {/* Grand Total Row */}
          <Table.Tr style={{ fontWeight: 700, backgroundColor: "var(--mantine-color-gray-1)" }}>
            <Table.Td>
              <Text size="sm" fw={700}>
                GRAND TOTAL
              </Text>
            </Table.Td>
            <Table.Td>
              <MoneyCell value={grandTotals.current} />
            </Table.Td>
            <Table.Td>
              <MoneyCell value={grandTotals.bucket_1_30} />
            </Table.Td>
            <Table.Td>
              <MoneyCell value={grandTotals.bucket_31_60} />
            </Table.Td>
            <Table.Td>
              <MoneyCell value={grandTotals.bucket_61_90} />
            </Table.Td>
            <Table.Td>
              <MoneyCell value={grandTotals.bucket_90_plus} />
            </Table.Td>
            <Table.Td>
              <MoneyCell value={grandTotals.total_outstanding} />
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Box>
  );
}