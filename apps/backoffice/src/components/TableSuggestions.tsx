// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Stack, Card, Group, Text, Badge, Button, Alert } from "@mantine/core";
import type { TableSuggestion } from "@jurnapod/shared";

export type TableSuggestionsProps = {
  suggestions: TableSuggestion[];
  guestCount: number;
  onSelect: (tableIds: number[]) => void;
  loading?: boolean;
};

export function TableSuggestions(props: TableSuggestionsProps) {
  const { suggestions, guestCount, onSelect, loading } = props;

  if (suggestions.length === 0 && !loading) {
    return (
      <Alert color="gray" title="No Suggestions Available">
        No suitable table combinations found. Try adjusting the guest count or time.
      </Alert>
    );
  }

  if (loading) {
    return (
      <Stack gap="sm">
        <Text size="sm" fw={500}>
          Finding Best Combinations...
        </Text>
        <Text size="sm" c="dimmed">
          Calculating optimal table arrangements...
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>
        Suggested Combinations
      </Text>

      {suggestions.map((suggestion, index) => {
        const isBest = index === 0;

        return (
          <Card key={index} withBorder padding="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs">
                  <Text fw={isBest ? 600 : 400} size="sm">
                    {isBest && "✨ "}
                    {suggestion.tables.length} tables
                  </Text>
                  <Badge color={isBest ? "green" : "gray"} variant="light">
                    {suggestion.total_capacity} seats
                  </Badge>
                </Group>

                <Text size="xs" c="dimmed">
                  {suggestion.excess_capacity === 0
                    ? "Perfect fit"
                    : suggestion.excess_capacity > 0
                      ? `${suggestion.excess_capacity} extra seats`
                      : `${Math.abs(suggestion.excess_capacity)} seats short`}
                </Text>
              </Group>

              <Text size="xs" c="dimmed">
                {suggestion.tables.map((t) => `${t.code} (${t.capacity})`).join(" + ")}
              </Text>

              <Button
                size="xs"
                variant={isBest ? "filled" : "light"}
                onClick={() => onSelect(suggestion.tables.map((t) => t.id))}
              >
                Select This Combination
              </Button>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}