// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReactNode } from "react";
import { Group } from "@mantine/core";

type FilterBarProps = {
  children: ReactNode;
};

export function FilterBar({ children }: FilterBarProps) {
  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      {children}
    </Group>
  );
}
