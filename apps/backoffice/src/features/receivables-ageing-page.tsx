// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Stack, Text, Group, Title, Box } from "@mantine/core";
import { useState, useCallback } from "react";

import { PageCard } from "../components/PageCard";
import { FilterBar } from "../components/FilterBar";
import { OfflinePage } from "../components/offline-page";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";

import {
  type ReceivablesAgeingFilters,
  type ReceivablesAgeingSortColumn,
  type SortConfig,
  DEFAULT_FILTERS,
} from "../types/reports/receivables-ageing";
import { useReceivablesAgeing } from "../hooks/use-receivables-ageing";
import { AgeingSummaryCards } from "../components/reports/receivables-ageing/ageing-summary-cards";
import { AgeingTable } from "../components/reports/receivables-ageing/ageing-table";
import { AgeingFilters } from "../components/reports/receivables-ageing/ageing-filters";
import { AgeingExportButton } from "../components/reports/receivables-ageing/ageing-export-button";

type ReceivablesAgeingPageProps = {
  user: SessionUser;
};

export function ReceivablesAgeingPage({ user }: ReceivablesAgeingPageProps) {
  const isOnline = useOnlineStatus();
  const [filters, setFilters] = useState<ReceivablesAgeingFilters>(DEFAULT_FILTERS);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: "total_outstanding",
    direction: "desc",
  });

  const { data, customers, isLoading, error } = useReceivablesAgeing({
    filters,
    enabled: isOnline,
  });

  const handleSort = useCallback((column: ReceivablesAgeingSortColumn) => {
    setSortConfig((prev) => ({
      column,
      direction: prev.column === column && prev.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  const handleFiltersChange = useCallback((newFilters: ReceivablesAgeingFilters) => {
    setFilters(newFilters);
  }, []);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to View Reports"
        message="Reports require real-time data. Please connect to the internet."
      />
    );
  }

  return (
    <PageCard
      title="Receivables Ageing"
      description="Track outstanding customer invoices by age bucket"
      actions={
        <AgeingExportButton
          report={data}
          customers={customers}
          asOfDate={filters.asOfDate}
          isLoading={isLoading}
        />
      }
    >
      <Stack gap="md">
        {/* Report Title */}
        <Box ta="center">
          <Title order={4} mb={4}>
            AGEING REPORT - RECEIVABLES
          </Title>
          <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.08em" }}>
            As of {filters.asOfDate}
          </Text>
        </Box>

        {/* Filters */}
        <FilterBar>
          <AgeingFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            user={user}
            isLoading={isLoading}
          />
        </FilterBar>

        {/* Error Display */}
        {error ? (
          <Text c="red" size="sm">
            {error}
          </Text>
        ) : null}

        {/* Summary Cards */}
        <AgeingSummaryCards data={data} isLoading={isLoading} />

        {/* Data Table */}
        <Box style={{ overflowX: "auto" }}>
          <AgeingTable
            customers={customers}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        </Box>

        {/* Report Metadata */}
        {data && (
          <Group justify="flex-end">
            <Text size="xs" c="dimmed">
              Generated at: {new Date().toLocaleString()}
            </Text>
          </Group>
        )}
      </Stack>
    </PageCard>
  );
}