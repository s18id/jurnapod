// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";

type FilterBarProps = {
  children: ReactNode;
  onClearAll?: () => void;
  showClearAll?: boolean;
};

export function FilterBar({ children, onClearAll, showClearAll = false }: FilterBarProps) {
  return (
    <Group gap="sm" align="flex-end" wrap="wrap" justify="space-between" style={{ width: "100%" }} data-testid="filter-bar">
      <Group gap="sm" align="flex-end" wrap="wrap" data-testid="filter-bar-children">
        {children}
      </Group>
      {showClearAll && onClearAll && (
        <Button variant="subtle" size="xs" onClick={onClearAll} data-testid="filter-bar-clear-all">
          Clear All
        </Button>
      )}
    </Group>
  );
}
