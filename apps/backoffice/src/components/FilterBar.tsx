// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReactNode } from "react";
import { Button, Group } from "@mantine/core";

type FilterBarProps = {
  children: ReactNode;
  onClearAll?: () => void;
  showClearAll?: boolean;
};

export function FilterBar({ children, onClearAll, showClearAll = false }: FilterBarProps) {
  return (
    <Group gap="sm" align="flex-end" wrap="wrap" justify="space-between" style={{ width: "100%" }}>
      <Group gap="sm" align="flex-end" wrap="wrap">
        {children}
      </Group>
      {showClearAll && onClearAll && (
        <Button variant="subtle" size="xs" onClick={onClearAll}>
          Clear All
        </Button>
      )}
    </Group>
  );
}
