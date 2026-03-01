// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReactNode } from "react";
import { Card, SimpleGrid, Text } from "@mantine/core";

export type StatTileTone = "default" | "positive" | "negative";

export type StatTileItem = {
  label: string;
  value: ReactNode;
  helper?: string;
  tone?: StatTileTone;
};

const toneColor: Record<StatTileTone, string> = {
  default: "inherit",
  positive: "var(--mantine-color-green-7)",
  negative: "var(--mantine-color-red-7)"
};

export function StatTiles({ items }: { items: StatTileItem[] }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
      {items.map((item) => (
        <Card key={item.label} padding="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: "0.08em" }}>
            {item.label}
          </Text>
          <Text size="lg" fw={600} style={{ color: toneColor[item.tone ?? "default"] }}>
            {item.value}
          </Text>
          {item.helper ? (
            <Text size="xs" c="dimmed">
              {item.helper}
            </Text>
          ) : null}
        </Card>
      ))}
    </SimpleGrid>
  );
}
