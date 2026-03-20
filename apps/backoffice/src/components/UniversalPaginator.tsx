// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Group, Pagination, Text, Stack } from "@mantine/core";

interface UniversalPaginatorProps {
  /** Total number of items */
  total: number;
  /** Items per page */
  pageSize: number;
  /** Current page (1-indexed) */
  page: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Show "Showing X-Y of Z" label */
  showRange?: boolean;
  /** Loading state */
  loading?: boolean;
}

export function UniversalPaginator({
  total,
  pageSize,
  page,
  onPageChange,
  showRange = true,
  loading = false
}: UniversalPaginatorProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <Stack gap="xs" align="center">
      {showRange && (
        <Text size="sm" c="dimmed">
          {loading ? "Loading..." : `Showing ${startItem}-${endItem} of ${total}`}
        </Text>
      )}
      <Pagination
        total={totalPages}
        value={page}
        onChange={onPageChange}
        size="sm"
        withEdges
      />
    </Stack>
  );
}
