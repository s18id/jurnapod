// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { OutletTableResponse } from "@jurnapod/shared";
import { Stack, Group, Checkbox, Text, Badge, Card, Alert } from "@mantine/core";

export type TableMultiSelectProps = {
  availableTables: OutletTableResponse[];
  selectedTableIds: number[];
  onChange: (tableIds: number[]) => void;
  guestCount: number;
  disabled?: boolean;
  conflictWarning?: string | null;
};

export function TableMultiSelect(props: TableMultiSelectProps) {
  const {
    availableTables,
    selectedTableIds,
    onChange,
    guestCount,
    disabled,
    conflictWarning
  } = props;

  const totalCapacity = selectedTableIds.reduce((sum, id) => {
    const table = availableTables.find((t) => t.id === id);
    return sum + (table?.capacity ?? 0);
  }, 0);

  const isUnderCapacity = totalCapacity < guestCount;
  const isOverCapacity = totalCapacity > guestCount * 1.5;

  const handleToggle = (tableId: number) => {
    if (selectedTableIds.includes(tableId)) {
      onChange(selectedTableIds.filter((id) => id !== tableId));
    } else {
      onChange([...selectedTableIds, tableId]);
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>
        Select Tables ({guestCount} guests)
      </Text>

      {conflictWarning && (
        <Alert color="red" title="Table Conflict">
          {conflictWarning}
        </Alert>
      )}

      <Stack gap="xs">
        {availableTables.map((table) => (
          <Card key={table.id} withBorder padding="xs">
            <Group justify="space-between">
              <Checkbox
                label={
                  <Group gap="xs">
                    <Text size="sm">{table.code}</Text>
                    <Text size="xs" c="dimmed">
                      - {table.name}
                    </Text>
                  </Group>
                }
                description={
                  table.zone ? `Zone: ${table.zone} • Capacity: ${table.capacity}` : `Capacity: ${table.capacity}`
                }
                checked={selectedTableIds.includes(table.id)}
                onChange={() => handleToggle(table.id)}
                disabled={disabled}
              />
              {selectedTableIds.includes(table.id) && (
                <Badge color="blue" variant="light">
                  {table.capacity} seats
                </Badge>
              )}
            </Group>
          </Card>
        ))}
      </Stack>

      <Group justify="space-between">
        <Text size="sm">
          Selected: {selectedTableIds.length} {selectedTableIds.length === 1 ? "table" : "tables"},{" "}
          {totalCapacity} seats
        </Text>

        {selectedTableIds.length === 0 ? (
          <Badge color="gray" variant="light">
            No tables selected
          </Badge>
        ) : isUnderCapacity ? (
          <Badge color="red" variant="light">
            ⚠ Need {guestCount - totalCapacity} more seats
          </Badge>
        ) : !isOverCapacity ? (
          <Badge color="green" variant="light">
            ✓ Sufficient capacity
          </Badge>
        ) : (
          <Badge color="yellow" variant="light">
            ⚠ {totalCapacity - guestCount} extra seats
          </Badge>
        )}
      </Group>
    </Stack>
  );
}